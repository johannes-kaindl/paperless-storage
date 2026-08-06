// Beschreibt Requests, fuehrt sie nicht aus — dadurch bleibt das Modul rein und in Node
// testbar (PROF-OBS-03/04). Das Ausfuehren uebernimmt der injizierte Transport.
//
// Routen gegen paperless-ngx 3.0.5 verifiziert (documents/views.py: preview, thumb,
// download, metadata als Actions am DocumentViewSet).

import type { FileVersion } from "./settings";

export interface ApiConfig {
  serverUrl: string;
  apiToken: string;
}

export interface RequestSpec {
  url: string;
  headers: Record<string, string>;
}

export interface DocumentMeta {
  id: number;
  title: string;
  checksum: string;
  created: string;
}

function base(cfg: ApiConfig): string {
  return cfg.serverUrl.trim().replace(/\/+$/, "");
}

function headers(cfg: ApiConfig): Record<string, string> {
  return { Authorization: `Token ${cfg.apiToken}` };
}

export function documentMetaRequest(cfg: ApiConfig, id: number): RequestSpec {
  return { url: `${base(cfg)}/api/documents/${id}/`, headers: headers(cfg) };
}

export function documentFileRequest(
  cfg: ApiConfig,
  id: number,
  version: FileVersion,
): RequestSpec {
  const path =
    version === "original"
      ? `/api/documents/${id}/download/?original=true`
      : `/api/documents/${id}/preview/`;
  return { url: `${base(cfg)}${path}`, headers: headers(cfg) };
}

export function searchRequest(cfg: ApiConfig, query: string): RequestSpec {
  return {
    url: `${base(cfg)}/api/documents/?query=${encodeURIComponent(query)}`,
    headers: headers(cfg),
  };
}

/**
 * Gemessen gegen paperless-ngx 3.0.5 (2026-08-06): der Response traegt KEIN
 * Top-Level-`checksum` mehr, sondern ein `versions`-Array (Dokument-Reprozessierung).
 * Die Root-Version traegt die Pruefsumme der urspruenglichen Datei. Ein Top-Level-Feld
 * wird als Fallback weiter gelesen, falls eine aeltere Instanz es doch liefert.
 */
function extractChecksum(obj: Record<string, unknown>): string {
  const raw = obj["versions"];
  if (Array.isArray(raw)) {
    // `Array.isArray` narrows to `any[]` regardless of the source type — re-widen to
    // `unknown[]` so the eslint unsafe-any rules keep checking the element accesses below.
    const versions: unknown[] = raw as unknown[];
    const isVersion = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null;
    const root = versions.find((v): v is Record<string, unknown> => isVersion(v) && v["is_root"] === true);
    const chosen = root ?? (isVersion(versions[0]) ? versions[0] : undefined);
    if (chosen && typeof chosen["checksum"] === "string") return chosen["checksum"];
  }
  return typeof obj["checksum"] === "string" ? obj["checksum"] : "";
}

export function parseDocumentMeta(text: string): DocumentMeta {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unexpected paperless response: not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const id = obj["id"];
  if (typeof id !== "number") {
    throw new Error("Unexpected paperless response: missing 'id'");
  }
  return {
    id,
    title: typeof obj["title"] === "string" ? obj["title"] : "",
    checksum: extractChecksum(obj),
    created: typeof obj["created"] === "string" ? obj["created"] : "",
  };
}
