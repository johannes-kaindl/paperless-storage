// Blendet den Cache-Ordner im Datei-Explorer per injiziertem <style>-Element aus. Der
// Ordner bleibt ein normaler (nicht Punkt-praefigierter) Vault-Ordner — sonst sieht der
// native PDF-Viewer die Cache-Dateien nicht (cache-store.ts). Nur die ANZEIGE wird
// unterdrueckt, nicht der Ordner selbst.
//
// PROF-OBS-13: activeDocument statt document (popout-sicher), CSS.escape() gegen
// Ordnernamen mit Anfuehrungszeichen o.ae., Cleanup-Pflicht fuer jedes injizierte
// <style>-Element.

let styleEl: HTMLStyleElement | null = null;

export function applyCacheFolderVisibility(folder: string, hidden: boolean): void {
  styleEl?.remove();
  styleEl = null;
  if (!hidden || folder === "") return;
  styleEl = activeDocument.createElement("style");
  styleEl.textContent = `.nav-folder-title[data-path="${CSS.escape(folder)}"] { display: none; }`;
  activeDocument.head.appendChild(styleEl);
}

/** Fuer die Registrierung als Cleanup-Funktion (this.register(...) in main.ts). */
export function removeCacheFolderVisibility(): void {
  styleEl?.remove();
  styleEl = null;
}
