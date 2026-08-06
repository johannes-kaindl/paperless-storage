// Transportfehler tragen Status UND Rohbody. Wer den Body verwirft, zwingt die
// Anzeigeschicht zum Raten — ein 401 sah in vault-rag dadurch aus wie „Server nicht
// erreichbar" und war nicht diagnostizierbar.

export class PaperlessHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Paperless HTTP ${status}`);
    this.name = "PaperlessHttpError";
  }
}

/** Vier Quellen, in dieser Reihenfolge: error.message, error, message, detail. */
export function extractErrorMessage(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const err = obj["error"];
  if (typeof err === "object" && err !== null) {
    const msg = (err as Record<string, unknown>)["message"];
    if (typeof msg === "string" && msg) return msg;
  }
  if (typeof err === "string" && err) return err;
  for (const key of ["message", "detail"]) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export function describeHttpError(err: PaperlessHttpError): string {
  const detail = extractErrorMessage(err.body);
  return detail ? `HTTP ${err.status}: ${detail}` : `HTTP ${err.status}`;
}
