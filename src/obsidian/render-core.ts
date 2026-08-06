// Ein Renderkern, den Embed und (spaeter) FileView als duenne Adapter benutzen —
// Muster „Adapter um einen Kern" aus 3d-codeblocks. Fehlerbehandlung, Ladezustand und
// Cache-Logik liegen dadurch an genau einer Stelle.

import { Component, TFile, type App } from "obsidian";
import { parseStub, StubParseError } from "../core/stub";
import { cachePath, needsRefresh } from "../core/cache-policy";
import { documentFileRequest, documentMetaRequest, parseDocumentMeta } from "../core/paperless-api";
import type { DocumentMeta } from "../core/paperless-api";
import { PaperlessHttpError } from "../core/errors";
import { isConfigured, resolveCacheFolder, type PaperlessSettings } from "../core/settings";
import { t } from "../core/i18n";
import type { Transport } from "./http";
import type { CacheStore } from "./cache-store";

export interface RenderDeps {
  app: App;
  transport: Transport;
  cache: CacheStore;
  settings: () => PaperlessSettings;
}

/**
 * Erzwingt die konfigurierte Embed-Hoehe auf `containerEl` gegen Obsidians eigenen
 * PDF-Viewer, der sie nachtraeglich ueberschreibt. NUR fuer echte Embeds gedacht (Setting
 * "Height in pixels for EMBEDDED documents") — deshalb ruft dies ausschliesslich embed.ts
 * auf, NICHT renderStub() selbst, sonst wirkt die Einstellung faelschlich auch auf die
 * ganze FileView-Pane (file-view.ts uebergibt contentEl der GANZEN Pane als containerEl).
 *
 * Dynamische Zuweisung aus einer Variablen — vom obsidianmd-Lint ausdruecklich erlaubt
 * (nur STATISCHE style-Literale sind verboten, PROF-OBS-13).
 *
 * Gemessen (2026-08-06, Abnahme Phase 2): Obsidians eigener PDF-Viewer setzt NACH dem
 * Laden seine eigene, inhaltsabhaengige Hoehe auf genau dieses Element — und zwar in
 * ZWEI Schueben (erste, grobe Layout-Passe nach ~300-600ms, zweite nach vollstaendiger
 * Seitenberechnung ~1s spaeter). Ein einmalig abgemeldeter MutationObserver faengt nur
 * die erste ab und laesst die zweite durch. Der Observer bleibt deshalb fuer die ganze
 * Lebensdauer des Embeds aktiv (Abmeldung erst beim Unload ueber parent.register) und
 * korrigiert jede Abweichung — das eigene Zuruecksetzen loest zwar selbst wieder eine
 * Mutation aus, die dann aber bereits targetHeight sieht und nichts mehr tut, also keine
 * Endlosschleife. `!important` waere die naheliegende Alternative, ist aber durch
 * PROF-OBS-13 verboten.
 */
export function applyEmbedHeight(containerEl: HTMLElement, settings: PaperlessSettings, parent: Component): void {
  if (settings.embedHeight === null) return;
  const targetHeight = `${settings.embedHeight}px`;
  containerEl.style.height = targetHeight;
  const observer = new MutationObserver(() => {
    if (containerEl.style.height !== targetHeight) {
      containerEl.style.height = targetHeight;
    }
  });
  observer.observe(containerEl, { attributes: true, attributeFilter: ["style"] });
  parent.register(() => observer.disconnect());
}

/** Zeigt das Dokument des Stubs in `containerEl`. Wirft nie — Fehler werden gerendert. */
export async function renderStub(
  deps: RenderDeps,
  stubFile: TFile,
  containerEl: HTMLElement,
  parent: Component,
): Promise<void> {
  containerEl.empty();
  const settings = deps.settings();

  if (!isConfigured(settings)) {
    message(containerEl, t("notConfigured"));
    return;
  }

  let stub;
  try {
    stub = parseStub(await deps.app.vault.cachedRead(stubFile));
  } catch (e) {
    message(containerEl, t("brokenStub", e instanceof StubParseError ? e.message : String(e)));
    return;
  }

  const loading = message(containerEl, t("loading"));
  const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };
  const path = cachePath(resolveCacheFolder(settings), stub.id, settings.fileVersion);

  // Metadaten sind optional: ohne sie gilt der Cache. Offline lesbar zu bleiben ist
  // wichtiger als aktuell zu sein.
  let meta: DocumentMeta | null = null;
  let authFailed = false;
  let missing = false;
  try {
    meta = parseDocumentMeta(await deps.transport.text(documentMetaRequest(cfg, stub.id)));
  } catch (e) {
    if (e instanceof PaperlessHttpError) {
      if (e.status === 401 || e.status === 403) authFailed = true;
      if (e.status === 404) missing = true;
    }
  }

  const hasCache = deps.cache.has(path);

  if (authFailed && !hasCache) {
    loading.setText(t("invalidToken"));
    return;
  }
  if (missing && !hasCache) {
    loading.setText(t("notFound", String(stub.id)));
    return;
  }

  // Metadaten sind aus irgendeinem Grund nicht zu bekommen, aber ein Cache existiert:
  // Ursache dem Nutzer sichtbar lassen, statt die Notiz kommentarlos aus dem Cache zu
  // fuellen — sonst bleibt ein abgelehnter Token oder eine tote Verbindung unbemerkt.
  let cacheNotice: string | null = meta === null && hasCache ? (authFailed ? t("invalidToken") : t("offline")) : null;

  if (needsRefresh(stub, meta, hasCache)) {
    let bytes: ArrayBuffer | null = null;
    try {
      bytes = await deps.transport.binary(
        documentFileRequest(cfg, stub.id, settings.fileVersion),
      );
    } catch {
      if (!deps.cache.has(path)) {
        loading.setText(t("noCacheOffline"));
        return;
      }
      cacheNotice = t("offline");
    }
    if (bytes) {
      // Schreibfehler (volle Platte, schreibgeschuetzter Vault) sind KEIN Netzproblem —
      // sonst meldet das Plugin „offline", waehrend der Server einwandfrei antwortet
      // (Spec §5). Die Bytes sind da, also wird einmalig ohne Cache angezeigt.
      try {
        await deps.cache.store(path, bytes);
      } catch (e) {
        loading.remove();
        showUncachedNotice(containerEl, e);
        return;
      }
      cacheNotice = null;
    }
  }

  const cached = deps.cache.file(path);
  if (!cached) {
    loading.setText(t("noCacheOffline"));
    return;
  }

  // Der Hinweis bleibt stehen (nicht loading.remove()), sonst verschwindet er im selben
  // Zug, in dem er gesetzt wurde, und ist fuer den Nutzer nie sichtbar.
  if (cacheNotice) {
    loading.setText(cacheNotice);
  } else {
    loading.remove();
  }
  showPdf(deps.app, containerEl, cached, parent);
}

function message(containerEl: HTMLElement, text: string): HTMLElement {
  return containerEl.createDiv({ cls: "paperless-storage-message", text });
}

/** Der Download lief, nur das Ablegen im Vault schlug fehl — als solches benennen. */
function showUncachedNotice(containerEl: HTMLElement, error: unknown): void {
  message(containerEl, t("cacheWriteFailed", String(error)));
}

/**
 * Weg A aus dem Spike: Obsidians eigenen PDF-Embed-Creator mit unserer Cache-Datei
 * aufrufen. Inoffizielle API — mit Feature-Detection, damit ihr Verschwinden nur die
 * Anzeige kostet und nicht das Plugin.
 */
function showPdf(
  app: App,
  containerEl: HTMLElement,
  file: TFile,
  parent: Component,
): void {
  const registry = (app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
  const creator = registry?.embedByExtension?.["pdf"];
  if (!creator) {
    message(containerEl, "PDF viewer unavailable in this Obsidian version.");
    return;
  }
  const child = creator({ app, containerEl, linktext: file.path, sourcePath: file.path }, file);
  // Ohne addChild() laeuft loadFile() durch und rendert NICHTS: der Viewer baut sein DOM
  // erst in onload(), und geladen wird eine Component nur als Kind (gemessen 2026-08-06).
  parent.addChild(child as unknown as Component);
  child.loadFile();
}

interface EmbedRegistry {
  embedByExtension?: Record<
    string,
    (ctx: { app: App; containerEl: HTMLElement; linktext?: string; sourcePath?: string }, file: TFile) => { loadFile(): void }
  >;
  registerExtension(ext: string, creator: unknown): void;
  unregisterExtension(ext: string): void;
}
