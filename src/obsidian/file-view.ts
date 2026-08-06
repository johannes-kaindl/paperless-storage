// Oeffnet eine .paperless-Datei im ganzen Pane (Datei-Explorer-Klick statt Embed) — wie
// Obsidians eigener PDF-Viewer. Duenner Adapter um denselben renderStub()-Kern wie
// embed.ts (Kommentar in render-core.ts: "Embed und (spaeter) FileView").

import { Component, FileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { renderStub, type RenderDeps } from "./render-core";

export const VIEW_TYPE_PAPERLESS = "paperless-storage-file-view";

export class PaperlessFileView extends FileView {
  /** Zwischen-Parent fuer den aktuell geladenen PDF-Viewer-Child — siehe Plan-Begruendung
   *  zur Lifecycle-Falle. Ohne dieses Zwischenglied haeuften sich bei jedem Dateiwechsel
   *  im selben Pane nicht abgemeldete Children an. */
  private current: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly deps: RenderDeps,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PAPERLESS;
  }

  getIcon(): string {
    return "file-text";
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Paperless document";
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.teardown();
    const holder = new Component();
    this.addChild(holder);
    this.current = holder;
    await renderStub(this.deps, file, this.contentEl, holder);
  }

  async onUnloadFile(): Promise<void> {
    this.teardown();
    this.contentEl.empty();
  }

  private teardown(): void {
    if (this.current) {
      this.removeChild(this.current);
      this.current = null;
    }
  }
}
