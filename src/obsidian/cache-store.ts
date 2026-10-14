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

  /** Sidecar neben dem Cache-PDF (`<id>.json`): haelt die Pruefsumme, mit der das PDF geladen wurde.
   *  Der Stub bleibt unveraendert — er ist die Datei, die der Nutzer synchronisiert und verlinkt. */
  private sidecarPath(pdfPath: string): string {
    return normalizePath(pdfPath).replace(/\.pdf$/i, ".json");
  }

  /** Die Pruefsumme, mit der das gecachte PDF geladen wurde; `undefined`, wenn keine bekannt ist
   *  (Cache aus einer Version vor dem Sidecar, oder eine unlesbare Datei). */
  async readChecksum(pdfPath: string): Promise<string | undefined> {
    const file = this.file(this.sidecarPath(pdfPath));
    if (!file) return undefined;
    try {
      const parsed: unknown = JSON.parse(await this.vault.read(file));
      const value = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>)["checksum"] : undefined;
      return typeof value === "string" && value !== "" ? value : undefined;
    } catch {
      return undefined;
    }
  }

  async writeChecksum(pdfPath: string, checksum: string): Promise<void> {
    const path = this.sidecarPath(pdfPath);
    await this.ensureFolder(path);
    const text = JSON.stringify({ checksum }) + "\n";
    const existing = this.file(path);
    if (existing) await this.vault.modify(existing, text);
    else await this.vault.create(path, text);
  }

  /** Loescht alle gecachten Dateien samt Pruefsummen-Sidecars. Gibt die Anzahl der PDFs zurueck. */
  async clear(): Promise<number> {
    const dir = normalizePath(this.folder());
    const victims = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(dir + "/") && (f.extension === "pdf" || f.extension === "json"));
    for (const f of victims) await this.trash(f);
    return victims.filter((f) => f.extension === "pdf").length;
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
