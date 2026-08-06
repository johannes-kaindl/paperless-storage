// Blendet den Cache-Ordner im Datei-Explorer per injiziertem <style>-Element aus. Der
// Ordner bleibt ein normaler (nicht Punkt-praefigierter) Vault-Ordner — sonst sieht der
// native PDF-Viewer die Cache-Dateien nicht (cache-store.ts). Nur die ANZEIGE wird
// unterdrueckt, nicht der Ordner selbst.
//
// PROF-OBS-13: CSS.escape() gegen Ordnernamen mit Anfuehrungszeichen o.ae., Cleanup-Pflicht
// fuer jedes injizierte <style>-Element.
//
// Das Ziel-Dokument wird als Parameter uebergeben statt ueber activeDocument geraten
// (Befund 3, Gesamt-Review Phase 2): seit Obsidian 1.13 ist das Einstellungsfenster ein
// EIGENES Fenster mit eigenem document — aendert der Nutzer den Toggle dort, ist
// activeDocument das Einstellungsfenster, nicht das Hauptfenster mit dem Datei-Explorer.
// Der Aufrufer (main.ts) uebergibt gezielt app.workspace.containerEl.ownerDocument.
// Nicht auf den Lint-Hinweis "Use activeWindow.createEl(...)" umschwenken — das fuehrt
// denselben Bug wieder ein (ambientes aktives Fenster statt Datei-Explorer-Fenster).

let styleEl: HTMLStyleElement | null = null;

export function applyCacheFolderVisibility(doc: Document, folder: string, hidden: boolean): void {
  styleEl?.remove();
  styleEl = null;
  if (!hidden || folder === "") return;
  styleEl = doc.createElement("style");
  styleEl.textContent = `.nav-folder-title[data-path="${CSS.escape(folder)}"] { display: none; }`;
  doc.head.appendChild(styleEl);
}

/** Fuer die Registrierung als Cleanup-Funktion (this.register(...) in main.ts). */
export function removeCacheFolderVisibility(): void {
  styleEl?.remove();
  styleEl = null;
}
