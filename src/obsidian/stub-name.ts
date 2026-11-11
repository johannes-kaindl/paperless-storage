import type { App } from "obsidian";
import { safeFileName } from "../vendor/kit-obsidian/safe-file-name";

const PLUGIN_ID = "paperless-storage";
/** Obergrenze für den Namen ohne Endung, in Zeichen (handhabbare Länge; `.paperless` kommt dahinter). */
const MAX_BASE_CHARS = 100;
/** Und in UTF-8-Bytes: ein Dateiname hat höchstens 255 Bytes, `.paperless` braucht zehn davon. */
const MAX_BASE_BYTES = 245;

/** Der Name eines Stubs (ohne `.paperless`) aus dem Titel des Dokuments.
 *  Die Regeln kommen vom Plugin `filename-sanitizer`, wenn es läuft, sonst aus dem Kit (`safeFileName`); der Titel wird als ein
 *  Segment ohne Endung gelesen (`kind: "folder"`), damit ein Punkt mitten im Titel nicht als Dateiendung gilt. Danach wird auf
 *  100 Zeichen und 245 Bytes gekappt (an Zeichengrenzen) und ein Leerzeichen oder Punkt am Ende, den der Schnitt hinterlässt, entfernt. */
export function stubBaseName(app: App, title: string): string {
  const { name } = safeFileName(app, title, { caller: PLUGIN_ID, kind: "folder" });
  let cut = "";
  let bytes = 0;
  let chars = 0;
  for (const ch of name) {
    bytes += new TextEncoder().encode(ch).length;
    if (++chars > MAX_BASE_CHARS || bytes > MAX_BASE_BYTES) break;
    cut += ch;
  }
  const capped = cut.replace(/[ .]+$/, "");
  return capped === "" ? "Untitled" : capped;
}
