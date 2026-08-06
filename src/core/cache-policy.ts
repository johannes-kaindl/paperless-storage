// Der Cache-Dateiname traegt die ID, nicht den Titel: ein Titelwechsel in paperless
// darf den Cache nicht verwaisen lassen.

import type { FileVersion } from "./settings";
import type { DocumentStub } from "./stub";
import type { DocumentMeta } from "./paperless-api";

export function cachePath(folder: string, id: number, version: FileVersion): string {
  const dir = folder.replace(/\/+$/, "");
  const suffix = version === "original" ? "-original" : "";
  return `${dir}/${id}${suffix}.pdf`;
}

/**
 * `meta === null` bedeutet: Server nicht erreichbar. Dann gilt der Cache, falls vorhanden —
 * offline lesbar zu bleiben ist wichtiger als aktuell zu sein.
 */
export function needsRefresh(
  stub: DocumentStub,
  meta: DocumentMeta | null,
  cached: boolean,
): boolean {
  if (!cached) return true;
  if (meta === null) return false;
  if (!stub.checksum || !meta.checksum) return false;
  return stub.checksum !== meta.checksum;
}
