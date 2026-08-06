// Fuehrt den Befehl "Synchronize document titles" aus: alle .paperless-Stubs im Vault
// lesen, aktuelle Titel vom Server holen, das reine planTitleSync() (core/title-sync.ts)
// entscheiden lassen, dann per app.fileManager.renameFile umbenennen — Obsidian zieht
// darueber alle Links im Vault selbst nach (Spec §3.6).

import { Notice, TFile, type App } from "obsidian";
import { parseStub, serializeStub, sanitizeStubFilename, uniqueStubPath, StubParseError } from "../core/stub";
import { documentMetaRequest, parseDocumentMeta, type DocumentMeta } from "../core/paperless-api";
import { planTitleSync, type StubRecord } from "../core/title-sync";
import { isConfigured, type PaperlessSettings } from "../core/settings";
import { PaperlessHttpError } from "../core/errors";
import { t } from "../core/i18n";
import type { Transport } from "./http";

export interface TitleSyncDeps {
  app: App;
  transport: Transport;
  settings: () => PaperlessSettings;
}

export async function runTitleSync(deps: TitleSyncDeps): Promise<void> {
  const settings = deps.settings();
  if (!isConfigured(settings)) {
    new Notice(t("notConfigured"));
    return;
  }
  const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };

  const files = deps.app.vault.getFiles().filter((f) => f.extension === "paperless");
  const stubs: StubRecord[] = [];
  for (const file of files) {
    try {
      const stub = parseStub(await deps.app.vault.cachedRead(file));
      stubs.push({ path: file.path, stub });
    } catch (e) {
      if (e instanceof StubParseError) continue; // kaputte Stubs bleiben liegen (Spec §5)
      throw e;
    }
  }

  const metaById = new Map<number, DocumentMeta>();
  let authFailed = false;
  for (const { stub } of stubs) {
    if (metaById.has(stub.id)) continue;
    try {
      const meta = parseDocumentMeta(await deps.transport.text(documentMetaRequest(cfg, stub.id)));
      metaById.set(stub.id, meta);
    } catch (e) {
      // 401/403 (Token abgelehnt) macht das Ergebnis fuer den Nutzer unbrauchbar — das
      // muss sichtbar werden, sonst sieht ein Totalausfall wie "alles aktuell" aus.
      // 404 (Dokument geloescht) bleibt laut Spec §5 still: Stub bleibt liegen, kein
      // Rename-Vorschlag ohne Metadaten. Andere Fehler (z. B. Netzwerkausfall ohne
      // HTTP-Status) landen ebenfalls im stillen Zweig — planTitleSync ueberspringt
      // Stubs ohne Eintrag hier.
      if (e instanceof PaperlessHttpError && (e.status === 401 || e.status === 403)) {
        authFailed = true;
      }
    }
  }

  const plans = planTitleSync(stubs, metaById);
  const stubByPath = new Map(stubs.map((s) => [s.path, s.stub]));
  let renamed = 0;

  for (const plan of plans) {
    const file = deps.app.vault.getAbstractFileByPath(plan.path);
    const oldStub = stubByPath.get(plan.path);
    if (!(file instanceof TFile) || !oldStub) continue;

    const dir = plan.path.includes("/") ? plan.path.slice(0, plan.path.lastIndexOf("/")) : "";
    const base = sanitizeStubFilename(plan.newTitle);
    const existingPaths = new Set(
      deps.app.vault.getFiles().map((f) => f.path).filter((p) => p !== plan.path),
    );
    const newPath = uniqueStubPath(dir, base, existingPaths);

    await deps.app.fileManager.renameFile(file, newPath);
    const renamedFile = deps.app.vault.getAbstractFileByPath(newPath);
    if (renamedFile instanceof TFile) {
      await deps.app.vault.modify(renamedFile, serializeStub({ ...oldStub, title: plan.newTitle }));
    }
    renamed++;
  }

  new Notice(`Paperless storage: ${renamed} title(s) synchronized.`);
  if (authFailed) {
    // Eigene Notice statt Vermischen mit der Zusammenfassung — ein abgelehnter Token
    // betrifft potenziell alle Stubs und darf nicht im "0 synchronized" untergehen.
    new Notice(t("invalidToken"));
  }
}
