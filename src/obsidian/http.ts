// PROF-OBS-12: `requestUrl` statt globalem `fetch` (nicht CORS- und nicht mobilsicher).
// Der Transport wird injiziert, nie global gegriffen — dadurch bleibt der Kern testbar.
//
// `throw: false` ist entscheidend: sonst wirft requestUrl bei 4xx/5xx eine eigene
// Fehlerform und der Rohbody geht verloren. Genau der wird fuer die Diagnose gebraucht.

import { requestUrl } from "obsidian";
import type { RequestSpec } from "../core/paperless-api";
import { PaperlessHttpError } from "../core/errors";

export interface Transport {
  text(spec: RequestSpec): Promise<string>;
  binary(spec: RequestSpec): Promise<ArrayBuffer>;
}

export function obsidianTransport(): Transport {
  return {
    async text(spec) {
      const res = await requestUrl({ url: spec.url, headers: spec.headers, throw: false });
      if (res.status < 200 || res.status >= 300) {
        throw new PaperlessHttpError(res.status, res.text ?? "");
      }
      return res.text;
    },
    async binary(spec) {
      const res = await requestUrl({ url: spec.url, headers: spec.headers, throw: false });
      if (res.status < 200 || res.status >= 300) {
        throw new PaperlessHttpError(res.status, res.text ?? "");
      }
      return res.arrayBuffer;
    },
  };
}
