// `![[x.paperless]]`-Embeds ueber Obsidians embedRegistry.
//
// WICHTIG — inoffizielle API: `app.embedRegistry` ist nicht Teil der oeffentlichen
// Obsidian-Typen. Sie ist der EINZIGE zuverlaessige Weg fuer echte Datei-Embeds; der
// Markdown-Postprocessor greift nicht (er laeuft vor Obsidians Embed-Laden).
// Deshalb: Feature-Detection + eigene minimale Typ-Deklaration statt einer Dependency.
// Verschwindet die API, fehlen nur Embeds — das Plugin laedt weiter.
//
// Signatur verifiziert gegen obsidian-typings: der Creator bekommt die Datei,
// `loadFile()` ist parameterlos.

import { MarkdownRenderChild, type App, type TFile } from "obsidian";
import { applyEmbedHeight, renderStub, type RenderDeps } from "./render-core";

interface EmbedContext {
  app: App;
  containerEl: HTMLElement;
  linktext?: string;
  sourcePath?: string;
}
interface EmbedComponentLike {
  loadFile(): void;
}
interface EmbedRegistry {
  isExtensionRegistered?(extension: string): boolean;
  registerExtension(
    extension: string,
    creator: (ctx: EmbedContext, file: TFile, subpath?: string) => EmbedComponentLike,
  ): void;
  unregisterExtension(extension: string): void;
}

class PaperlessEmbed extends MarkdownRenderChild implements EmbedComponentLike {
  constructor(
    containerEl: HTMLElement,
    private readonly deps: RenderDeps,
    private readonly file: TFile,
  ) {
    super(containerEl);
  }

  loadFile(): void {
    // Nur Embeds bekommen die Hoehen-Erzwingung (Befund 1, Gesamt-Review Phase 2) — die
    // FileView (file-view.ts) ruft renderStub() ohne applyEmbedHeight() auf, damit die
    // Einstellung nicht die ganze Pane auf Embed-Hoehe zwingt.
    applyEmbedHeight(this.containerEl, this.deps.settings(), this);
    void renderStub(this.deps, this.file, this.containerEl, this);
  }
}

/**
 * Registriert die Endung. Gibt eine Abmeldefunktion zurueck, oder `null`, wenn die
 * Registry fehlt oder die Endung bereits belegt ist.
 */
export function registerPaperlessEmbed(deps: RenderDeps): (() => void) | null {
  const registry = (deps.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
  if (!registry) {
    console.warn("[paperless-storage] embedRegistry unavailable — ![[…]] embeds disabled.");
    return null;
  }
  if (registry.isExtensionRegistered?.("paperless")) {
    console.warn("[paperless-storage] extension 'paperless' already registered.");
    return null;
  }
  registry.registerExtension("paperless", (ctx, file) => new PaperlessEmbed(ctx.containerEl, deps, file));
  return () => registry.unregisterExtension("paperless");
}
