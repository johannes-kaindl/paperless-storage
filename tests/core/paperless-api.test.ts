import { describe, it, expect } from "vitest";
import {
  documentMetaRequest, documentFileRequest, searchRequest, parseDocumentMeta,
} from "../../src/core/paperless-api";

const cfg = { serverUrl: "https://paperless.example.org", apiToken: "geheim" };

describe("Request-Bau", () => {
  it("baut die Metadaten-URL", () => {
    expect(documentMetaRequest(cfg, 42).url)
      .toBe("https://paperless.example.org/api/documents/42/");
  });
  it("setzt den Token-Header", () => {
    expect(documentMetaRequest(cfg, 42).headers["Authorization"]).toBe("Token geheim");
  });
  it("vertraegt einen abschlieszenden Schraegstrich in der Server-URL", () => {
    expect(documentMetaRequest({ ...cfg, serverUrl: "https://x.tld/" }, 7).url)
      .toBe("https://x.tld/api/documents/7/");
  });
  it("baut die Archiv-URL", () => {
    expect(documentFileRequest(cfg, 42, "archive").url)
      .toBe("https://paperless.example.org/api/documents/42/preview/");
  });
  it("baut die Original-URL", () => {
    expect(documentFileRequest(cfg, 42, "original").url)
      .toBe("https://paperless.example.org/api/documents/42/download/?original=true");
  });
  it("kodiert die Suchanfrage", () => {
    expect(searchRequest(cfg, "Miet vertrag").url)
      .toBe("https://paperless.example.org/api/documents/?query=Miet%20vertrag");
  });
});

describe("parseDocumentMeta", () => {
  it("liest die relevanten Felder", () => {
    const meta = parseDocumentMeta(
      '{"id":42,"title":"Mietvertrag","checksum":"abc","created":"2026-08-05","extra":1}',
    );
    expect(meta).toEqual({ id: 42, title: "Mietvertrag", checksum: "abc", created: "2026-08-05" });
  });
  it("liest die Pruefsumme aus dem versions-Array (gemessen gegen paperless-ngx 3.0.5, kein Top-Level-checksum-Feld)", () => {
    const meta = parseDocumentMeta(
      '{"id":1,"title":"notes-to-media","created":"2026-08-06",' +
        '"versions":[{"id":1,"checksum":"root-sum","is_root":true}]}',
    );
    expect(meta.checksum).toBe("root-sum");
  });
  it("bevorzugt die Root-Version, wenn mehrere versions vorliegen", () => {
    const meta = parseDocumentMeta(
      '{"id":1,"title":"x","created":"",' +
        '"versions":[{"id":2,"checksum":"nicht-root","is_root":false},' +
        '{"id":1,"checksum":"root-sum","is_root":true}]}',
    );
    expect(meta.checksum).toBe("root-sum");
  });
  it("wirft bei kaputtem JSON", () => {
    expect(() => parseDocumentMeta("<html>")).toThrow();
  });
  it("wirft bei fehlender id", () => {
    expect(() => parseDocumentMeta('{"title":"x"}')).toThrow();
  });
  it("vertraegt fehlende optionale Felder", () => {
    const meta = parseDocumentMeta('{"id":1}');
    expect(meta.title).toBe("");
    expect(meta.checksum).toBe("");
  });
});
