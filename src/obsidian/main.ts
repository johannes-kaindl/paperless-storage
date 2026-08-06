/**
 * SPIKE — Wegwerf-Messcode zu Aufgabe 2 des Plans. Wird in Aufgabe 10 vollstaendig
 * ersetzt. Beantwortet die eine Frage, an der das Design haengt:
 *
 *   Laesst sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter heraus
 *   auf eine beliebige Datei im Vault ansetzen?
 *
 * Bewusst NICHT lint-konform (`obsidianmd/no-console`): die Messung lebt von der
 * Konsolenausgabe. Kein eslint-Override — ein Override wuerde die Store-Vorschau auch
 * fuer den spaeteren Produktionscode blenden.
 *
 * Ergebnisse liegen zusaetzlich strukturiert unter `window.__paperlessSpike`, damit sie
 * ueber CDP im Wortlaut ausgelesen und nicht abgetippt werden.
 */
import { MarkdownRenderChild, Notice, Plugin, TFile, MarkdownRenderer, Component } from "obsidian";

/**
 * Lauf 2 des Spikes. Obsidian fuehrt unbekannte Endungen moeglicherweise gar nicht als
 * Vault-Dateien — dann loest `![[probe.paperless]]` nie auf und die Wege A/B kommen nie
 * zum Zug. Messung 0 klaert das; dieses Flag schaltet die Gegenprobe mit einer
 * registrierten View-Extension frei.
 */
const REGISTER_VIEW_EXTENSION = false;

const PROBE_PDF = "_probe/muster.pdf";
const PROBE_STUB = "_probe/probe.paperless";

interface EmbedContext {
  app: unknown;
  containerEl: HTMLElement;
  linktext?: string;
  sourcePath?: string;
}
type EmbedCreator = (ctx: EmbedContext, file: TFile, subpath?: string) => { loadFile(): void };
interface EmbedRegistry {
  embedByExtension?: Record<string, EmbedCreator>;
  isExtensionRegistered?(ext: string): boolean;
  registerExtension(ext: string, creator: EmbedCreator): void;
  unregisterExtension(ext: string): void;
}

interface SpikeReport {
  registryPresent: boolean;
  pdfCreatorPresent: boolean;
  knownExtensions: string[];
  viewExtensionRegistered: boolean;
  measurement0: Record<string, unknown>;
  embedInvoked: boolean;
  wegA: Record<string, unknown> | null;
  wegB: Record<string, unknown> | null;
  log: string[];
}

const report: SpikeReport = {
  registryPresent: false,
  pdfCreatorPresent: false,
  knownExtensions: [],
  viewExtensionRegistered: REGISTER_VIEW_EXTENSION,
  measurement0: {},
  embedInvoked: false,
  wegA: null,
  wegB: null,
  log: [],
};

function note(msg: string, data?: unknown): void {
  const line = data === undefined ? msg : `${msg} ${JSON.stringify(data)}`;
  report.log.push(line);
  console.log("[spike]", line);
}

/** Was das DOM nach dem Rendern hergibt — die Scroll-Frage ist hier messbar. */
function probeDom(el: HTMLElement): Record<string, unknown> {
  const scroller = el.querySelector<HTMLElement>(".pdf-viewer-container, .pdf-viewer") ?? el;
  return {
    childElementCount: el.childElementCount,
    innerHTMLLength: el.innerHTML.length,
    canvasCount: el.querySelectorAll("canvas").length,
    pdfViewerNodes: el.querySelectorAll(".pdf-viewer, .pdf-viewer-container, .pdf-embed").length,
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    scrollable: scroller.scrollHeight > scroller.clientHeight + 1,
    firstClasses: Array.from(el.children)
      .slice(0, 5)
      .map((c) => c.className || c.tagName),
  };
}

export default class SpikePlugin extends Plugin {
  onload(): void {
    const registry = (this.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;

    // MESSUNG 1: Existiert die Registry und kennt sie einen PDF-Creator?
    report.registryPresent = !!registry;
    report.pdfCreatorPresent = !!registry?.embedByExtension?.["pdf"];
    report.knownExtensions = Object.keys(registry?.embedByExtension ?? {});
    note("embedRegistry vorhanden:", report.registryPresent);
    note("pdf-Creator vorhanden:", report.pdfCreatorPresent);
    note("bekannte Embed-Endungen:", report.knownExtensions);

    (window as unknown as { __paperlessSpike: SpikeReport }).__paperlessSpike = report;

    if (!registry) {
      new Notice("[spike] embedRegistry fehlt — Weg A ausgeschlossen");
      return;
    }

    // MESSUNG 0 (Ergaenzung zum Plan): Fuehrt Obsidian die Stub-Datei ueberhaupt als
    // Vault-Datei? Ohne das loest `![[probe.paperless]]` nie auf, und A/B sind irrelevant.
    if (REGISTER_VIEW_EXTENSION) {
      try {
        this.registerExtensions(["paperless"], "markdown");
        note("registerExtensions('paperless') gesetzt");
      } catch (e) {
        note("registerExtensions warf:", String(e));
      }
    }
    this.app.workspace.onLayoutReady(() => this.measureZero());

    // BEFUND Lauf 1: Obsidian ruft `addChild()` auf dem Rueckgabewert und damit dessen
    // `load()`. Ein Plain-Object `{ loadFile() }` — so steht es im Plan — wirft
    // `TypeError: e.load is not a function`, und zwar so frueh, dass die GESAMTE Notiz
    // nicht mehr rendert. Der Rueckgabewert muss eine Component sein.
    registry.registerExtension(
      "paperless",
      ((ctx: EmbedContext) => new SpikeEmbed(ctx, this)) as unknown as EmbedCreator,
    );
    this.register(() => registry.unregisterExtension("paperless"));
    note("Extension 'paperless' registriert — Notiz mit ![[probe.paperless]] oeffnen");
  }

  private measureZero(): void {
    const stub = this.app.vault.getAbstractFileByPath(PROBE_STUB);
    const resolved = this.app.metadataCache.getFirstLinkpathDest(
      "probe.paperless",
      "_probe/spike-probe.md",
    );
    report.measurement0 = {
      stubAlsVaultDatei: stub instanceof TFile,
      linkAufloesung: resolved?.path ?? null,
      dateienImVault: this.app.vault.getFiles().length,
      paperlessDateien: this.app.vault
        .getFiles()
        .filter((f) => f.extension === "paperless")
        .map((f) => f.path),
    };
    note("MESSUNG 0:", report.measurement0);
  }

}

/**
 * BEFUND Lauf 2: Beide Wege liefen ohne Wurf und rendertem trotzdem nichts — weil die
 * erzeugte Component nie GELADEN wurde. Obsidians PDF-Viewer baut sein DOM erst in
 * `onload()`. Deshalb hier ein echtes MarkdownRenderChild, das die Kind-Components per
 * `addChild()` registriert: das ist es, was `load()` ausloest.
 */
class SpikeEmbed extends MarkdownRenderChild {
  constructor(
    private readonly ctx: EmbedContext,
    private readonly plugin: Plugin,
  ) {
    super(ctx.containerEl);
  }

  loadFile(): void {
    report.embedInvoked = true;
    note("Embed-Creator fuer .paperless AUFGERUFEN");
    void this.messen();
  }

  private async messen(): Promise<void> {
    const app = this.plugin.app;
    const target = app.vault.getAbstractFileByPath(PROBE_PDF);
    if (!(target instanceof TFile)) {
      note(`Testdatei ${PROBE_PDF} nicht gefunden`);
      return;
    }

    // WEG A: Obsidians eigenen PDF-Creator mit unserer Datei aufrufen — und die
    // zurueckgegebene Component als Kind registrieren, damit ihr onload() laeuft.
    const registry = (app as unknown as { embedRegistry: EmbedRegistry }).embedRegistry;
    const pdfCreator = registry.embedByExtension?.["pdf"];
    const wegAEl = this.containerEl.createDiv({ attr: { "data-spike": "weg-a" } });
    if (pdfCreator) {
      try {
        const child = pdfCreator(
          { app, containerEl: wegAEl, linktext: target.path, sourcePath: target.path },
          target,
        );
        this.addChild(child as unknown as MarkdownRenderChild);
        child.loadFile();
        note("WEG A: Creator lief, als Kind registriert");
        report.wegA = { threw: false };
      } catch (e) {
        note("WEG A gescheitert:", String(e));
        report.wegA = { threw: true, error: String(e) };
      }
    } else {
      report.wegA = { threw: false, error: "kein pdf-Creator" };
    }

    // WEG B: MarkdownRenderer — die Component muss geladen werden, sonst bleibt das
    // Embed leer. Als Kind registrieren erledigt beides (load + Aufraeumen).
    const wegBEl = this.containerEl.createDiv({ attr: { "data-spike": "weg-b" } });
    try {
      const comp = new Component();
      this.addChild(comp);
      await MarkdownRenderer.render(app, `![[${target.path}]]`, wegBEl, target.path, comp);
      note("WEG B: gerendert, Kind-Elemente:", wegBEl.childElementCount);
      report.wegB = { threw: false };
    } catch (e) {
      note("WEG B gescheitert:", String(e));
      report.wegB = { threw: true, error: String(e) };
    }

    // Der PDF-Viewer laedt asynchron — erst danach ist das DOM aussagekraeftig.
    window.setTimeout(() => {
      report.wegA = { ...(report.wegA ?? {}), dom: probeDom(wegAEl) };
      report.wegB = { ...(report.wegB ?? {}), dom: probeDom(wegBEl) };
      note("WEG A DOM:", report.wegA);
      note("WEG B DOM:", report.wegB);
      note("FERTIG");
    }, 3000);
  }
}
