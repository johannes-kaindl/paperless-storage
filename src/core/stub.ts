// Der Stub ist die Datei, die im Vault liegt: `<Titel>.paperless`. Fuer Obsidian ist er
// eine echte Datei und traegt damit Backlinks, Graph und Autovervollstaendigung.
// Maszgeblich ist allein `id` — `title` und `checksum` sind Anzeige- und
// Invalidierungs-Cache und duerfen vom Server abweichen.

export interface DocumentStub {
  id: number;
  title: string;
  checksum?: string;
  added?: string;
}

export class StubParseError extends Error {
  constructor(reason: string) {
    super(`Invalid .paperless stub: ${reason}`);
    this.name = "StubParseError";
  }
}

export function parseStub(text: string): DocumentStub {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StubParseError("not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) throw new StubParseError("not an object");

  const obj = parsed as Record<string, unknown>;
  const id = obj["id"];
  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw new StubParseError("missing or non-integer 'id'");
  }

  const stub: DocumentStub = { id, title: typeof obj["title"] === "string" ? obj["title"] : "" };
  if (typeof obj["checksum"] === "string") stub.checksum = obj["checksum"];
  if (typeof obj["added"] === "string") stub.added = obj["added"];
  return stub;
}

export function serializeStub(stub: DocumentStub): string {
  const out: Record<string, unknown> = { id: stub.id, title: stub.title };
  if (stub.checksum !== undefined) out["checksum"] = stub.checksum;
  if (stub.added !== undefined) out["added"] = stub.added;
  return JSON.stringify(out, null, 2) + "\n";
}

/** Ersetzt Zeichen, die Obsidian in Dateinamen nicht erlaubt (`\ / : * ? " < > |`),
 *  durch "-" und kappt auf eine handhabbare Laenge. Ein leerer/reiner Whitespace-Titel
 *  wuerde sonst eine unbenutzbare Datei ("".paperless) erzeugen. */
export function sanitizeStubFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  const base = cleaned === "" ? "Untitled" : cleaned;
  return base.slice(0, 100);
}

/** Findet einen im Vault freien `<base>.paperless`-Pfad, mit " 2", " 3", … bei
 *  Kollision — Vault-Pfade muessen eindeutig sein, `vault.create()` wirft sonst.
 *  Rein: die Kollisionslogik ist ohne Vault-Mock testbar, der Aufrufer liefert die
 *  vorhandenen Pfade (z. B. aus `vault.getFiles().map(f => f.path)`). */
export function uniqueStubPath(
  folder: string,
  base: string,
  existingPaths: ReadonlySet<string>,
): string {
  const dir = folder.replace(/\/+$/, "");
  const prefix = dir === "" ? "" : `${dir}/`;
  let candidate = `${prefix}${base}.paperless`;
  let n = 2;
  while (existingPaths.has(candidate)) {
    candidate = `${prefix}${base} ${n}.paperless`;
    n++;
  }
  return candidate;
}
