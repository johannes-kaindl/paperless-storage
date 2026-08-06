// Blendet den Cache-Ordner im Datei-Explorer per Constructable Stylesheet aus. Der
// Ordner bleibt ein normaler (nicht Punkt-praefigierter) Vault-Ordner — sonst sieht der
// native PDF-Viewer die Cache-Dateien nicht (cache-store.ts). Nur die ANZEIGE wird
// unterdrueckt, nicht der Ordner selbst.
//
// Kein document.createElement("style")/createEl("style") — beide sind von der
// obsidianmd-Regel no-forbidden-elements gesperrt, und zwar an der Operation selbst
// ("For loading CSS, use a 'styles.css' file instead"), nicht nur am Bezeichnernamen
// "document". Ein Store-Reviewer oder eine kuenftige, typbasierte Regel-Version wuerde
// eine Variante ueber einen umbenannten Document-Parameter vermutlich trotzdem
// beanstanden. new CSSStyleSheet() + replaceSync() + adoptedStyleSheets erzeugt gar
// kein <style>-Element und faellt nicht unter die Regel. Braucht iOS/Safari 16.4+ —
// Feature-Detection + try/catch, sonst kein Crash, nur der kosmetische Rueckfall
// (Ordner bleibt sichtbar).
//
// PROF-OBS-13: CSS.escape() gegen Ordnernamen mit Anfuehrungszeichen o.ae., Cleanup-Pflicht
// fuer jedes adoptierte Stylesheet.
//
// Das Ziel-Dokument wird als Parameter uebergeben statt ueber activeDocument geraten
// (Befund 3, Gesamt-Review Phase 2): seit Obsidian 1.13 ist das Einstellungsfenster ein
// EIGENES Fenster mit eigenem document — aendert der Nutzer den Toggle dort, ist
// activeDocument das Einstellungsfenster, nicht das Hauptfenster mit dem Datei-Explorer.
// Der Aufrufer (main.ts) uebergibt gezielt app.workspace.containerEl.ownerDocument.
// Nicht auf den Lint-Hinweis "Use activeWindow.createEl(...)" umschwenken — das fuehrt
// denselben Bug wieder ein (ambientes aktives Fenster statt Datei-Explorer-Fenster).

let sheet: CSSStyleSheet | null = null;
let sheetDoc: Document | null = null;

function supportsConstructableStylesheets(): boolean {
  return typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype;
}

export function applyCacheFolderVisibility(doc: Document, folder: string, hidden: boolean): void {
  removeCacheFolderVisibility();
  if (!hidden || folder === "" || !supportsConstructableStylesheets()) return;
  try {
    const css = `.nav-folder-title[data-path="${CSS.escape(folder)}"] { display: none; }`;
    const newSheet = new CSSStyleSheet();
    newSheet.replaceSync(css);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, newSheet];
    sheet = newSheet;
    sheetDoc = doc;
  } catch {
    // Kosmetischer Rueckfall: Ordner bleibt sichtbar, kein Crash.
  }
}

/** Fuer die Registrierung als Cleanup-Funktion (this.register(...) in main.ts). */
export function removeCacheFolderVisibility(): void {
  if (sheet && sheetDoc) {
    sheetDoc.adoptedStyleSheets = sheetDoc.adoptedStyleSheets.filter((s) => s !== sheet);
  }
  sheet = null;
  sheetDoc = null;
}
