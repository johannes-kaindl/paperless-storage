// Der Cache liegt in einem sichtbaren Ordner: Obsidian ignoriert Dot-Ordner vollstaendig,
// darin liegende Dateien sind keine TFile und fuer den nativen PDF-Viewer unsichtbar.

import { normalizePath, TFile, type Vault } from "obsidian";

export class CacheStore {
  constructor(
    private readonly vault: Vault,
    private readonly folder: () => string,
    /** app.fileManager.trashFile — respektiert die Papierkorb-Einstellung des Nutzers,
     *  anders als vault.delete (obsidianmd/prefer-file-manager-trash-file). */
    private readonly trash: (file: TFile) => Promise<void>,
  ) {}

  file(path: string): TFile | null {
    const found = this.vault.getAbstractFileByPath(normalizePath(path));
    return found instanceof TFile ? found : null;
  }

  has(path: string): boolean {
    return this.file(path) !== null;
  }

  async store(path: string, bytes: ArrayBuffer): Promise<TFile> {
    const normalized = normalizePath(path);
    await this.ensureFolder(normalized);
    const existing = this.file(normalized);
    if (existing) {
      await this.vault.modifyBinary(existing, bytes);
      return existing;
    }
    return await this.vault.createBinary(normalized, bytes);
  }

  /** Loescht alle gecachten Dateien. Gibt die Anzahl zurueck. */
  async clear(): Promise<number> {
    const dir = normalizePath(this.folder());
    const victims = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(dir + "/") && f.extension === "pdf");
    for (const f of victims) await this.trash(f);
    return victims.length;
  }

  private async ensureFolder(filePath: string): Promise<void> {
    const dir = filePath.slice(0, filePath.lastIndexOf("/"));
    if (!dir) return;
    if (this.vault.getAbstractFileByPath(dir)) return;
    try {
      await this.vault.createFolder(dir);
    } catch {
      // Nebenlaeufig bereits angelegt — der naechste Zugriff findet ihn.
    }
  }
}
