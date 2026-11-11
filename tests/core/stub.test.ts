import { describe, it, expect } from "vitest";
import {
  parseStub,
  serializeStub,
  StubParseError,
  uniqueStubPath,
} from "../../src/core/stub";

describe("parseStub", () => {
  it("liest id und title", () => {
    const s = parseStub('{"id":42,"title":"Mietvertrag 2024"}');
    expect(s.id).toBe(42);
    expect(s.title).toBe("Mietvertrag 2024");
  });
  it("liest optionale Felder", () => {
    const s = parseStub('{"id":1,"title":"x","checksum":"abc","added":"2026-08-05"}');
    expect(s.checksum).toBe("abc");
    expect(s.added).toBe("2026-08-05");
  });
  it("wirft bei fehlender id", () => {
    expect(() => parseStub('{"title":"x"}')).toThrow(StubParseError);
  });
  it("wirft bei nicht-numerischer id", () => {
    expect(() => parseStub('{"id":"42","title":"x"}')).toThrow(StubParseError);
  });
  it("wirft bei kaputtem JSON", () => {
    expect(() => parseStub("nicht json")).toThrow(StubParseError);
  });
  it("wirft bei leerem Text", () => {
    expect(() => parseStub("")).toThrow(StubParseError);
  });
  it("faellt auf leeren title zurueck, wenn er fehlt", () => {
    expect(parseStub('{"id":7}').title).toBe("");
  });
});

describe("serializeStub", () => {
  it("erzeugt wieder parsebares JSON", () => {
    const stub = { id: 42, title: "Mietvertrag 2024", checksum: "abc" };
    expect(parseStub(serializeStub(stub))).toEqual(stub);
  });
  it("endet mit Zeilenumbruch", () => {
    expect(serializeStub({ id: 1, title: "x" }).endsWith("\n")).toBe(true);
  });
  it("laesst undefinierte Felder weg", () => {
    expect(serializeStub({ id: 1, title: "x" })).not.toContain("checksum");
  });
});

describe("uniqueStubPath", () => {
  it("nutzt den Basisnamen ohne Kollision", () => {
    expect(uniqueStubPath("", "Invoice", new Set())).toBe("Invoice.paperless");
  });
  it("haengt den Ordner voran", () => {
    expect(uniqueStubPath("Docs", "Invoice", new Set())).toBe("Docs/Invoice.paperless");
  });
  it("haengt bei Kollision eine Zaehlnummer an", () => {
    const existing = new Set(["Docs/Invoice.paperless"]);
    expect(uniqueStubPath("Docs", "Invoice", existing)).toBe("Docs/Invoice 2.paperless");
  });
  it("erhoeht die Zaehlnummer bis eine freie Stelle gefunden ist", () => {
    const existing = new Set(["Invoice.paperless", "Invoice 2.paperless"]);
    expect(uniqueStubPath("", "Invoice", existing)).toBe("Invoice 3.paperless");
  });
  it("vertraegt einen Ordnerpfad mit abschlieszendem Schraegstrich", () => {
    expect(uniqueStubPath("Docs/", "Invoice", new Set())).toBe("Docs/Invoice.paperless");
  });
});
