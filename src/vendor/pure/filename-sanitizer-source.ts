// vendored from obsidian-kit@0.82.2, src/pure/filename-sanitizer-source.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import type { FilenameHit, SegmentKind } from "../kit/filename-policy";

/** Vertrag der Plugin-API v1 des Plugins `filename-sanitizer` (Spec 2026-11-08, § 7), so wie ein schreibendes Plugin ihn braucht.
 *  Das Plugin besitzt die Dateinamen-Richtlinie (zulässige Zeichen, Ersetzungen, Ausnahmen); wer einen Namen schreibt, fragt zuerst
 *  `sanitizeName` und fällt ohne das Plugin auf `applyPolicy` mit `DEFAULT_FILENAME_POLICY` zurück (`safeFileName`, `src/obsidian/`).
 *  Alle Methoden sind synchron; Fehler sind Werte (`ApiError`), keine Ausnahmen. Die Datei hat keinen Import außer den Typen aus
 *  `filename-policy` (code-kit 0.62.0).
 *
 *  @example
 *  isFilenameSanitizerApi({ version: 1, sanitizeName() {}, checkName() {} }); // true */
export const FILENAME_SANITIZER_PLUGIN_ID = "filename-sanitizer";
export const FILENAME_SANITIZER_API_VERSION = 1;

export interface ApiError { error: "invalid-input" | "not-ready"; message: string }
export interface SanitizeResult { name: string; changed: boolean; hits: FilenameHit[] }
export interface NameCheck { valid: boolean; hits: FilenameHit[] }

export interface FilenameSanitizerApi {
  version: 1;
  /** `name` ist ein einzelnes Segment (nie ein Pfad); `caller` ist eine Selbstauskunft fürs Protokoll. */
  sanitizeName(name: string, opts: { caller: string; kind?: SegmentKind }): SanitizeResult | ApiError;
  checkName(name: string, opts?: { kind?: SegmentKind }): NameCheck | ApiError;
}

const METHODS = ["sanitizeName", "checkName"] as const;

/** Form-Prüfung statt Vertrauen: ein Fremdplugin bekommt kein TS-Vertrauen geschenkt. */
export function isFilenameSanitizerApi(x: unknown): x is FilenameSanitizerApi {
  if (x === null || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== FILENAME_SANITIZER_API_VERSION) return false;
  return METHODS.every((m) => typeof o[m] === "function");
}
