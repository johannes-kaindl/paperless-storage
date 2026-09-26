// vendored from obsidian-kit@0.43.0, src/obsidian/folder-hide.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** Hängt das Ausblende-Stylesheet aus `pure/folder-hide` an ein Dokument — per Constructable
 *  Stylesheet, weil ein `<style>`-Element die Store-Lint-Regel `no-forbidden-elements` verletzt.
 *
 *  **Welches Dokument:** das Hauptfenster, in dem der Datei-Explorer lebt —
 *  `app.workspace.rootSplit.doc`, NICHT `activeDocument`. Gemessen in slide-deck (CHANGELOG 0.5.0
 *  und 0.6.1, Windows mit Pop-out-Fenster): beim Laden kann `activeDocument` auf ein
 *  wiederhergestelltes Pop-out zeigen. Das Blatt landete dann dort, weit weg vom Explorer, und
 *  in 0.4.0 warf das Übernehmen über Dokumentgrenzen `NotAllowedError` — das Plugin lud nicht.
 *  Hier nicht nachgemessen (Bibliothek ohne Obsidian-Lauf); belegt ist es nur dort.
 *
 *  **Der Realm-Fehler ist hier ausgeschlossen, unabhängig von der Dokumentwahl:** das Blatt
 *  entsteht mit dem `CSSStyleSheet`-Konstruktor des ZIEL-Dokuments (`doc.defaultView`). Ein
 *  Blatt aus einem anderen Realm zu übernehmen ist genau das, was `NotAllowedError` auslöste.
 *
 *  **Wann aufrufen:** einmal nach `onLayoutReady` installieren, `update` in `saveSettings()` —
 *  nicht im Setter des Schalters, sonst greift ein geänderter Ordnername erst nach dem nächsten
 *  Umschalten. `remove` in `onunload` (bzw. per `this.register(() => h.remove())`).
 *  Ob der Ordner anfangs ausgeblendet ist, entscheidet das Plugin (vault-crews: aus,
 *  slide-deck: an) — das Kit hat keinen Default.
 *
 *  Kosmetisch und deshalb nie ein Grund, das Laden abzubrechen: ohne Constructable Stylesheets
 *  (Safari/iOS < 16.4) ist der Griff ein No-op, Fehler gehen an `onError` statt nach oben. */
import { buildHideCss } from "../pure/folder-hide";

export interface FolderHideHandle {
  /** `false` ohne Constructable Stylesheets — dann bleibt der Ordner sichtbar. */
  readonly supported: boolean;
  update(folder: string, hide: boolean): void;
  remove(): void;
}

export function installFolderHide(
  doc: Document,
  folder: string,
  hide: boolean,
  onError: (e: unknown) => void = () => {},
): FolderHideHandle {
  const Sheet = doc.defaultView?.CSSStyleSheet;
  const supported = !!Sheet && "replaceSync" in Sheet.prototype && "adoptedStyleSheets" in doc;
  let sheet: CSSStyleSheet | null = null;

  const update = (f: string, h: boolean): void => {
    if (!supported || !Sheet) return;
    try {
      if (sheet === null) {
        sheet = new Sheet();
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      }
      sheet.replaceSync(buildHideCss(f, h));
    } catch (e) {
      onError(e);
    }
  };

  const remove = (): void => {
    if (sheet === null) return;
    const own = sheet;
    sheet = null;
    try {
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== own);
    } catch (e) {
      onError(e);
    }
  };

  update(folder, hide);
  return { supported, update, remove };
}
