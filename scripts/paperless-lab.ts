// Lauf gegen eine echte paperless-Instanz (CORE-TEST-02). Getrackt, nicht Scratchpad.
//
//   PAPERLESS_URL=https://… PAPERLESS_TOKEN=… npm run lab -- <dokument-id>
//
// Geprueft wird derselbe Request-Bau und dasselbe Antwort-Parsing wie im Plugin.

import {
  documentMetaRequest, documentFileRequest, parseDocumentMeta,
} from "../src/core/paperless-api.ts";
import { extractErrorMessage } from "../src/core/errors.ts";

const serverUrl = process.env["PAPERLESS_URL"];
const apiToken = process.env["PAPERLESS_TOKEN"];
if (!serverUrl || !apiToken) {
  console.error("PAPERLESS_URL und PAPERLESS_TOKEN setzen.");
  process.exit(2);
}
const cfg = { serverUrl, apiToken };
const id = Number(process.argv[2] ?? "1");

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  OK   ${label}`);
  } catch (e) {
    console.log(`  FAIL ${label}: ${String(e)}`);
  }
}

console.log(`Lab gegen ${serverUrl}, Dokument ${id}\n`);

await run("Metadaten lesen", async () => {
  const spec = documentMetaRequest(cfg, id);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = parseDocumentMeta(await res.text());
  console.log(`       title="${meta.title}" checksum=${meta.checksum.slice(0, 12)}…`);
});

await run("Archiv-PDF holen", async () => {
  const spec = documentFileRequest(cfg, id, "archive");
  const res = await fetch(spec.url, { headers: spec.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(buf.slice(0, 5));
  if (head !== "%PDF-") throw new Error(`kein PDF-Header, sondern "${head}"`);
  console.log(`       ${buf.byteLength} Bytes, PDF-Header vorhanden`);
});

await run("401 bei falschem Token", async () => {
  const spec = documentMetaRequest({ ...cfg, apiToken: "ungueltig" }, id);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (res.status !== 401 && res.status !== 403) throw new Error(`erwartet 401/403, war ${res.status}`);
  const msg = extractErrorMessage(await res.text());
  console.log(`       Status ${res.status}, Servermeldung: ${msg ?? "(nicht lesbar)"}`);
});

await run("404 bei unbekannter ID", async () => {
  const spec = documentMetaRequest(cfg, 999999);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (res.status !== 404) throw new Error(`erwartet 404, war ${res.status}`);
  console.log(`       Status 404 wie erwartet`);
});
