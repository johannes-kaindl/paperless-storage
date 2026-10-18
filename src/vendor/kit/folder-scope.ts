// vendored from code-kit@0.31.0, src/ts/pure/folder-scope.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { normalizeRelPath } from "./rel-path";

/** Which paths lie inside a folder, and the entries of a list that mean "this note" or "all notes in this folder". The same few
 *  lines stood in a dozen places, each with its own answer to four questions; the options below are those four questions, with
 *  the safe answer as the default. Pure string logic: it never reads a vault, and the paths come from the caller.
 *
 *  Origin, measured 2026-10-18 (all `startsWith(folder + "/")` underneath):
 *  - **koda-agent** `core/tools/write-policy.ts` (`inKoda`: both sides normalised, lower case, the folder itself counts),
 *    `core/tools/list.ts` `collectFolderNotes` (NFC, an empty folder is the root, direct children optional, sorted),
 *    `src/main.ts` `addContextFolder` and `expandNotizen` (an entry with `/` at the end is a folder, the rest a single path);
 *  - **obsidian-transmute** `core/vault/scope.ts` `inFolder` (slashes trimmed, an empty folder holds everything, direct children
 *    optional), **vault-crews** `obsidian/vault-port.ts` `listMarkdownFiles` (root holds everything, sorted) and `main.ts`
 *    (an empty root holds nothing), **llm-lab** `core/settings.ts` `pathsExcluded` (an empty folder is dropped first — "an
 *    empty string would be a prefix of every path and turn a typo into a silent plugin" — the folder itself counts),
 *    **mailstone** `import-eml.ts` (the folder itself counts), **paperless-storage** `cache-store.ts` and
 *    **kuro-gamification** `main.ts` (no normalising at all).
 *
 *  The four questions and the default:
 *  - *Does the folder itself count?* (`self`) Three versions said yes, six no. Default **no**: the paths asked about are notes.
 *  - *Does `Inbox` hold `inbox/a.md`?* (`ignoreCase`) Only write-policy compared lower case. Default **no**, as the vault does.
 *  - *Direct children only?* (`recursive`) transmute and koda's `list_notes` have both. Default **all depths**.
 *  - *Does an empty folder hold everything?* (`root`) Four versions said yes, five no or dropped the entry first. Default **no**:
 *    an empty setting that silently becomes "every file" is how `clear()` in paperless-storage would delete the whole vault; a
 *    caller that means the root says `root: true`. The same goes for `/`, `.` and `./`, which are the root spelled out.
 *
 *  What every call does on top, where the local versions differed: names are compared in Unicode normal form C — also a single
 *  entry of {@link expandPathEntries} (koda's `list` did; APFS and Obsidian's `normalizePath` treat a precomposed and a decomposed
 *  umlaut alike, the others did not); `ignoreCase` is `toLowerCase`, not case folding (dotted capital I, sharp s and a final sigma
 *  are not folded); both sides go through
 *  {@link normalizeRelPath} with a leading `/` stripped, so `/Inbox//./a.md` and `Inbox\a.md` are the same path; and a path or
 *  folder with a `..` segment or a NUL byte is **in no folder** (the local versions compared the text, so `a/../b` was "in `a`").
 *  The paths that come back are the strings the caller gave, not the normalised ones. Sorting is by UTF-16 code unit, not by
 *  locale, so the order does not depend on the ICU version (koda's reason, stated in `list.ts`).
 *
 *  **No trimming of whitespace**: a name may start or end with a blank. A folder a user typed into a setting is trimmed by the
 *  caller first — llm-lab's `normalizePath` did, and without it `Privat ` no longer holds `Privat/x.md`, so an exclusion would
 *  silently stop excluding. A folder with a `/` at the end is the same folder here; llm-lab compared it against `Privat//` and
 *  matched nothing.
 *
 *  Linear in the total length of the paths (plus the sort); {@link expandPathEntries} splits the list of known paths once, not
 *  once per entry. */
export interface FolderScopeOptions {
  /** Default `true`. `false`: only the direct children of the folder. */
  recursive?: boolean;
  /** Default `false`. `true`: the folder itself is inside (`Inbox` in `Inbox`). */
  self?: boolean;
  /** Default `false`. `true`: compare lower case. */
  ignoreCase?: boolean;
  /** Default `false`. `true`: an empty folder is the vault root and holds every path. */
  root?: boolean;
}

function segmentsOf(path: string, ignoreCase: boolean): string[] | null {
  const r = normalizeRelPath(path, { absolute: "strip", allowEmpty: true });
  if (!r.ok) return null;
  return r.segments.map((s) => {
    const n = s.normalize("NFC");
    return ignoreCase ? n.toLowerCase() : n;
  });
}

/** The test of one folder on paths that are already split ({@link segmentsOf}), or null if the folder is unusable (a `..` or a
 *  NUL in it) — then nothing is inside. */
function scopeOf(folder: string, options: FolderScopeOptions): ((segments: readonly string[]) => boolean) | null {
  const base = segmentsOf(folder, options.ignoreCase === true);
  if (base === null) return null;
  const recursive = options.recursive !== false;
  const self = options.self === true;
  if (base.length === 0 && options.root !== true) return () => false;
  return (p: readonly string[]): boolean => {
    if (p.length < base.length) return false;
    for (let i = 0; i < base.length; i++) if (p[i] !== base[i]) return false;
    const below = p.length - base.length;
    if (below === 0) return self;
    return recursive || below === 1;
  };
}

/** Whether `path` lies inside `folder` (whole segments: `Inbox` does not hold `Inbox-Archiv/x.md`). */
export function isInFolder(path: string, folder: string, options: FolderScopeOptions = {}): boolean {
  const inside = scopeOf(folder, options);
  if (inside === null) return false;
  const p = segmentsOf(path, options.ignoreCase === true);
  return p !== null && inside(p);
}

/** The paths of `paths` that lie inside `folder`, as given, sorted by UTF-16 code unit. A new array. */
export function pathsInFolder(paths: readonly string[], folder: string, options: FolderScopeOptions = {}): string[] {
  const inside = scopeOf(folder, options);
  if (inside === null) return [];
  return paths.filter((path) => {
    const p = segmentsOf(path, options.ignoreCase === true);
    return p !== null && inside(p);
  }).sort();
}

export interface ExpandedEntries {
  /** The notes the entries name, each once, in the order of the entries; the notes of one folder sorted. */
  paths: string[];
  /** The entries that point at nothing, word for word as they were given (so the caller can say which). */
  missing: string[];
}

/** Resolves a list of entries against the notes that exist. An entry with a `/` at the end is a folder and becomes all notes
 *  below it, at any depth; any other entry is one note and stays if `knownPaths` holds it — case as in the vault, but a name in
 *  another Unicode normal form or with a doubled slash is the same note — and comes back spelled as `knownPaths` spells it. An
 *  entry is `missing` if it names no note (an unknown note, a folder without a note), if it is empty after normalising (`""`,
 *  `.`, `/` — the root is **not** a way to select every note), or if it has a `..` or a NUL. A trailing `\` does not make a
 *  folder: only `/` does. The list of known paths is split once, however many entries there are. */
export function expandPathEntries(entries: readonly string[], knownPaths: readonly string[]): ExpandedEntries {
  const known: Array<{ path: string; segments: string[] }> = [];
  const byKey = new Map<string, string>();
  for (const path of knownPaths) {
    const segments = segmentsOf(path, false);
    if (segments === null) continue;
    known.push({ path, segments });
    const key = segments.join("/");
    if (!byKey.has(key)) byKey.set(key, path);
  }
  const seen = new Set<string>();
  const paths: string[] = [];
  const missing: string[] = [];
  const add = (p: string): void => {
    if (seen.has(p)) return;
    seen.add(p);
    paths.push(p);
  };
  for (const entry of entries) {
    const segments = segmentsOf(entry, false);
    if (segments === null || segments.length === 0) {
      missing.push(entry);
      continue;
    }
    if (entry.endsWith("/")) {
      const inside = scopeOf(entry, {});
      const hits = known.filter((k) => inside?.(k.segments) === true).map((k) => k.path).sort();
      if (hits.length === 0) missing.push(entry);
      else hits.forEach(add);
    } else {
      const hit = byKey.get(segments.join("/"));
      if (hit === undefined) missing.push(entry);
      else add(hit);
    }
  }
  return { paths, missing };
}
