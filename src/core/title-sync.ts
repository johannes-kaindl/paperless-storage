// Reiner Entscheidungskern fuer den Befehl "Synchronize document titles": vergleicht
// gespeicherte Stub-Titel mit den aktuellen Servertiteln. Das Umbenennen selbst
// (app.fileManager.renameFile) passiert in der obsidian-Schicht (title-sync-runner.ts).

import type { DocumentStub } from "./stub";
import type { DocumentMeta } from "./paperless-api";

export interface StubRecord {
  path: string;
  stub: DocumentStub;
}

export interface RenamePlan {
  path: string;
  newTitle: string;
}

/** Nur echte Aenderungen kommen in den Plan. Fehlende Metadaten (Dokument nicht
 *  erreichbar/geloescht) sind Aufgabe des 404-Platzhalters (Spec §5), nicht dieses
 *  Befehls — der Stub bleibt dann einfach unangetastet. Ein leerer Server-Titel wird
 *  ebenfalls uebersprungen: er entstuende nur durch eine unerwartete Serverantwort und
 *  soll keinen Stub auf einen leeren Namen umbenennen. */
export function planTitleSync(
  stubs: StubRecord[],
  metaById: ReadonlyMap<number, DocumentMeta>,
): RenamePlan[] {
  const plans: RenamePlan[] = [];
  for (const { path, stub } of stubs) {
    const meta = metaById.get(stub.id);
    if (!meta || meta.title === "") continue;
    if (meta.title !== stub.title) {
      plans.push({ path, newTitle: meta.title });
    }
  }
  return plans;
}
