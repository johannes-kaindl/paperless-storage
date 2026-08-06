// Befehl "Insert document": durchsucht paperless serverseitig (SuggestModal, siehe
// Begruendung im Plan gegen die dort zunaechst genannte FuzzySuggestModal), legt bei
// Bedarf einen Stub an (oder findet den vorhandenen fuer dieselbe id wieder) und fuegt
// ![[…]] an der Cursorposition ein.

import { Notice, SuggestModal, TFile, type App, type Editor } from "obsidian";
import { parseStub, serializeStub, sanitizeStubFilename, uniqueStubPath, StubParseError } from "../core/stub";
import { searchRequest, parseSearchResults, type DocumentSearchResult } from "../core/paperless-api";
import type { PaperlessSettings } from "../core/settings";
import type { Transport } from "./http";

export interface InsertModalDeps {
  app: App;
  transport: Transport;
  settings: () => PaperlessSettings;
  /** Pfad der Notiz, in die eingefuegt wird — fuer den kollisionsfreien Stub-Ordner und
   *  fuer app.metadataCache.fileToLinktext(). */
  sourcePath: string;
}

export class InsertDocumentModal extends SuggestModal<DocumentSearchResult> {
  constructor(
    private readonly deps: InsertModalDeps,
    private readonly editor: Editor,
  ) {
    super(deps.app);
    this.setPlaceholder("Search paperless documents…");
  }

  async getSuggestions(query: string): Promise<DocumentSearchResult[]> {
    if (query.trim() === "") return [];
    const settings = this.deps.settings();
    const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };
    try {
      const text = await this.deps.transport.text(searchRequest(cfg, query));
      return parseSearchResults(text).slice(0, 20);
    } catch {
      return [];
    }
  }

  renderSuggestion(item: DocumentSearchResult, el: HTMLElement): void {
    el.createDiv({ text: item.title === "" ? `Document ${item.id}` : item.title });
  }

  onChooseSuggestion(item: DocumentSearchResult): void {
    void this.insert(item);
  }

  private async insert(item: DocumentSearchResult): Promise<void> {
    try {
      const file = await this.resolveStubFile(item);
      const linktext = this.deps.app.metadataCache.fileToLinktext(file, this.deps.sourcePath);
      this.editor.replaceSelection(`![[${linktext}]]`);
    } catch (e) {
      new Notice(`Paperless storage: could not insert document (${String(e)}).`);
    }
  }

  private async findExistingStub(id: number): Promise<TFile | null> {
    const candidates = this.deps.app.vault.getFiles().filter((f) => f.extension === "paperless");
    for (const file of candidates) {
      try {
        const stub = parseStub(await this.deps.app.vault.cachedRead(file));
        if (stub.id === id) return file;
      } catch (e) {
        if (e instanceof StubParseError) continue; // fremde/kaputte .paperless-Datei
        throw e;
      }
    }
    return null;
  }

  private async resolveStubFile(item: DocumentSearchResult): Promise<TFile> {
    const existing = await this.findExistingStub(item.id);
    if (existing) return existing;

    const base = sanitizeStubFilename(item.title === "" ? `Document ${item.id}` : item.title);
    const dir = this.deps.sourcePath.includes("/")
      ? this.deps.sourcePath.slice(0, this.deps.sourcePath.lastIndexOf("/"))
      : "";
    const existingPaths = new Set(this.deps.app.vault.getFiles().map((f) => f.path));
    const path = uniqueStubPath(dir, base, existingPaths);
    return await this.deps.app.vault.create(path, serializeStub({ id: item.id, title: item.title }));
  }
}
