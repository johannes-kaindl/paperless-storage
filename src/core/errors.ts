// Transportfehler tragen Status UND Rohbody. Wer den Body verwirft, zwingt die
// Anzeigeschicht zum Raten — ein 401 sah in vault-rag dadurch aus wie „Server nicht
// erreichbar" und war nicht diagnostizierbar.
//
// Die Kaskade ueber error.message/error/message/detail lag hier bis 0.27.0 als eigene
// `extractErrorMessage`; sie kommt jetzt aus dem Kit (src/vendor/kit/error_body.ts).
// PaperlessHttpError und describeHttpError bleiben lokal — das Kit-Modul nimmt sie
// ausdruecklich NICHT mit (obsidian-kit/src/pure/error_body.ts:41-43).

import { errorMessageFromText } from "../vendor/kit/error_body";

export class PaperlessHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Paperless HTTP ${status}`);
    this.name = "PaperlessHttpError";
  }
}

export function describeHttpError(err: PaperlessHttpError): string {
  const detail = errorMessageFromText(err.body);
  return detail ? `HTTP ${err.status}: ${detail}` : `HTTP ${err.status}`;
}
