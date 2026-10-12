// vendored from obsidian-kit@0.57.0, src/pure/folder-hide.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
/** CSS, das einen Ordner im Datei-Explorer von Obsidian ausblendet — der pure Kern.
 *
 *  Herkunft (Welle 8, 2026-09-25): `vault-rag/src/index_dir.ts` (`normalizeIndexDir`,
 *  `buildHideCss`) ist der Ursprung; `slide-deck/src/folder-hide.ts` übernahm ihn
 *  („vault-rag pattern"), `vault-crews/src/obsidian/folder-hide.ts` am 2026-09-25 byte-identisch
 *  aus slide-deck. Eine Kopier-Kette, drei Konsumenten.
 *
 *  `data-path` ist internes Obsidian-Markup, keine API: bricht es, taucht der Ordner nur
 *  kosmetisch wieder auf, Daten gehen nicht verloren. Kein `:has()` (Mobile), `display:none`
 *  statt Höhe 0 (der Explorer virtualisiert), Attributwert per `JSON.stringify` escapt.
 *
 *  ⚠️ `normalizeFolder` entfernt nur SCHLIESSENDE Slashes, keine führenden. Ein Ordner
 *  „/Crews" trifft deshalb kein `data-path` (dort steht „Crews") und bleibt sichtbar. Bewusst
 *  so übernommen: die Funktion rechnet in slide-deck und vault-rag auch außerhalb des
 *  Ausblendens (Theme-Pfade, Index-Umzug), eine Änderung wäre dort ein Verhaltenswechsel. */

/** Trimmen und schließende Slashes entfernen — kanonische Form für Vergleich und `data-path`. */
export function normalizeFolder(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/** Die Regel für `folder`, oder `""`, wenn nicht ausgeblendet wird bzw. nichts übrig bleibt.
 *
 *  Eine Liste wird je Pfad normalisiert (`normalizeFolder`), Leere und Duplikate fallen weg, die
 *  Reihenfolge bleibt; je Pfad entsteht ein Zwei-Selektor-Block, die Blöcke trennt `\n`. Kein
 *  Vorfahren-Pruning: `a` und `a/b` ergeben zwei Blöcke (harmlos, `a` verdeckt `a/b` ohnehin). */
export function buildHideCss(folder: string | readonly string[], hide: boolean): string {
  if (!hide) return "";
  const raw = typeof folder === "string" ? [folder] : folder;
  const paths = [...new Set(raw.map(normalizeFolder).filter((p) => p !== ""))];
  return paths
    .map((p) => {
      const sel = `.nav-folder-title[data-path=${JSON.stringify(p)}]`;
      return `${sel},\n${sel} + .nav-folder-children { display: none; }`;
    })
    .join("\n");
}
