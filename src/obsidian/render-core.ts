// Ein Renderkern, den Embed und (spaeter) FileView als duenne Adapter benutzen —
// Muster „Adapter um einen Kern" aus 3d-codeblocks. Fehlerbehandlung, Ladezustand und
// Cache-Logik liegen dadurch an genau einer Stelle.

import { Component, TFile, setIcon, type App } from "obsidian";
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

const chains = new Map<string, Promise<unknown>>();

/** Fuehrt `fn` erst aus, wenn der vorherige Lauf zum selben Schluessel fertig ist (auch bei Fehler). */
async function serialized(key: string, fn: () => Promise<void>): Promise<void> {
  const previous = chains.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => { if (chains.get(key) === tail) chains.delete(key); });
  await run;
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

  const retry: MessageAction = { label: t("retry"), run: () => { void renderStub(deps, stubFile, containerEl, parent); } };
  const openSettings: MessageAction = { label: t("openSettings"), run: () => { openPluginSettings(deps.app); } };

  if (!isConfigured(settings)) {
    message(containerEl, t("notConfigured"), "warning", [openSettings]);
    return;
  }

  let stub;
  try {
    stub = parseStub(await deps.app.vault.cachedRead(stubFile));
  } catch (e) {
    message(containerEl, t("brokenStub", e instanceof StubParseError ? e.message : String(e)), "error");
    return;
  }

  const loading = message(containerEl, t("loading"), "checking");
  const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };
  const path = cachePath(resolveCacheFolder(settings), stub.id, settings.fileVersion);

  // Je Cache-Datei hintereinander: Embed und FileView rendern dasselbe Dokument oft gleichzeitig. Ohne
  // Reihung sahen beide den veralteten Cache und luden beide herunter; der zweite Lauf sieht jetzt
  // schon die frisch geschriebene Pruefsumme und zeigt aus dem Cache.
  await serialized(path, async () => {
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
    // Die Pruefsumme, mit der der Cache geladen wurde, steht im Sidecar (nicht im Stub, den der Nutzer
    // synchronisiert). Ein aelterer Stub-Eintrag bleibt als Rueckfall gueltig.
    const knownChecksum = hasCache ? ((await deps.cache.readChecksum(path)) ?? stub.checksum) : undefined;

    if (authFailed && !hasCache) {
      show(loading, t("invalidToken"), "error", [openSettings, retry]);
      return;
    }
    if (missing && !hasCache) {
      show(loading, t("notFound", String(stub.id)), "error");
      return;
    }

    // Metadaten sind aus irgendeinem Grund nicht zu bekommen, aber ein Cache existiert:
    // Ursache dem Nutzer sichtbar lassen, statt die Notiz kommentarlos aus dem Cache zu
    // fuellen — sonst bleibt ein abgelehnter Token oder eine tote Verbindung unbemerkt.
    let cacheNotice: { text: string; settings: boolean } | null =
      meta === null && hasCache ? (authFailed ? { text: t("invalidToken"), settings: true } : { text: t("offline"), settings: false }) : null;

    // Ein Cache ohne bekannte Pruefsumme (aus einer Version vor dem Sidecar) wird einmal neu geladen,
    // sobald der Server erreichbar ist: sonst bliebe er fuer immer ungeprueft, weil nie jemand die
    // Pruefsumme festgehalten hat. Offline (meta === null) gilt der Cache weiter.
    const baselineMissing = hasCache && meta !== null && meta.checksum !== "" && knownChecksum === undefined;
    if (baselineMissing || needsRefresh({ ...stub, checksum: knownChecksum }, meta, hasCache)) {
      let bytes: ArrayBuffer | null = null;
      try {
        bytes = await deps.transport.binary(
          documentFileRequest(cfg, stub.id, settings.fileVersion),
        );
      } catch {
        if (!deps.cache.has(path)) {
          show(loading, t("noCacheOffline"), "error", [retry]);
          return;
        }
        cacheNotice = { text: t("offline"), settings: false };
      }
      if (bytes) {
        // Schreibfehler (volle Platte, schreibgeschuetzter Vault) sind KEIN Netzproblem —
        // sonst meldet das Plugin „offline", waehrend der Server einwandfrei antwortet
        // (Spec §5). Die Bytes sind da, nur das Ablegen scheiterte; angezeigt wird deshalb die
        // Meldung "Downloaded, but could not be cached", nicht das PDF.
        try {
          await deps.cache.store(path, bytes);
        } catch (e) {
          show(loading, t("cacheWriteFailed", String(e)), "error", [retry]);
          return;
        }
        cacheNotice = null;
        // Die Pruefsumme festhalten, mit der diese Bytes geladen wurden; ohne sie vergleicht
        // needsRefresh nie echte Werte. Best effort: ein Schreibfehler kostet nur die naechste
        // Pruefung, nicht die Anzeige.
        if (meta !== null && meta.checksum !== "") {
          try {
            await deps.cache.writeChecksum(path, meta.checksum);
          } catch {
            // Sidecar nicht schreibbar: das PDF ist da, der naechste Aufruf laedt dann erneut.
          }
        }
      }
    }

    const cached = deps.cache.file(path);
    if (!cached) {
      show(loading, t("noCacheOffline"), "error", [retry]);
      return;
    }

    // Der Hinweis bleibt stehen (nicht loading.remove()), sonst verschwindet er im selben
    // Zug, in dem er gesetzt wurde, und ist fuer den Nutzer nie sichtbar.
    if (cacheNotice) {
      show(loading, cacheNotice.text, "warning", cacheNotice.settings ? [openSettings, retry] : [retry]);
    } else {
      loading.remove();
    }
    showPdf(deps.app, containerEl, cached, parent);
  });
}

/** Zustandsvokabel aus UI-STANDARD § 8 (Status-Indikator): Form UND Farbe UND Klasse UND Text. */
type MessageKind = "checking" | "ok" | "warning" | "error";
const MESSAGE_ICON: Record<MessageKind, string> = {
  checking: "loader", ok: "circle-check", warning: "alert-triangle", error: "circle-x",
};
interface MessageAction {
  label: string;
  run: () => void;
}

/** Die ID dieses Plugins fuer `app.setting.openTabById`. */
const PLUGIN_ID = "paperless-storage";

/** Oeffnet die Plugin-Einstellungen. `app.setting` ist nicht Teil der oeffentlichen Typen: mit
 *  Feature-Detection, damit sein Verschwinden nur den Knopf wirkungslos macht. */
function openPluginSettings(app: App): void {
  const setting = (app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
  setting?.open?.();
  setting?.openTabById?.(PLUGIN_ID);
}

/** Zeichnet (oder ersetzt) eine Meldung mit Icon, `is-*`-Klasse, `aria-live` und optionalen Knoepfen. */
function show(el: HTMLElement, text: string, kind: MessageKind, actions: MessageAction[] = []): HTMLElement {
  el.empty();
  for (const k of ["checking", "ok", "warning", "error"] as const) el.removeClass(`is-${k}`);
  el.addClass(`is-${kind}`);
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  setIcon(el.createSpan({ cls: "paperless-storage-status-icon" }), MESSAGE_ICON[kind]);
  el.createSpan({ cls: "paperless-storage-message-text", text });
  for (const action of actions) {
    el.createEl("button", { cls: "paperless-storage-message-action", text: action.label }).addEventListener("click", action.run);
  }
  return el;
}

function message(containerEl: HTMLElement, text: string, kind: MessageKind = "error", actions: MessageAction[] = []): HTMLElement {
  return show(containerEl.createDiv({ cls: "paperless-storage-message" }), text, kind, actions);
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
    message(containerEl, t("viewerUnavailable"), "error");
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
