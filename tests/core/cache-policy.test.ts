import { describe, it, expect } from "vitest";
import { cachePath, needsRefresh } from "../../src/core/cache-policy";

describe("cachePath", () => {
  it("nutzt die ID, nicht den Titel", () => {
    expect(cachePath("_paperless-storage", 42, "archive")).toBe("_paperless-storage/42.pdf");
  });
  it("unterscheidet Original von Archiv", () => {
    expect(cachePath("_paperless-storage", 42, "original"))
      .toBe("_paperless-storage/42-original.pdf");
  });
  it("vertraegt einen abschlieszenden Schraegstrich im Ordner", () => {
    expect(cachePath("cache/", 7, "archive")).toBe("cache/7.pdf");
  });
});

describe("needsRefresh", () => {
  const stub = { id: 1, title: "x", checksum: "abc" };
  it("verlangt Laden, wenn nichts im Cache liegt", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "abc", created: "" }, false))
      .toBe(true);
  });
  it("nutzt den Cache bei gleicher Pruefsumme", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "abc", created: "" }, true))
      .toBe(false);
  });
  it("laedt neu bei abweichender Pruefsumme", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "NEU", created: "" }, true))
      .toBe(true);
  });
  it("nutzt den Cache, wenn die Metadaten unerreichbar sind", () => {
    expect(needsRefresh(stub, null, true)).toBe(false);
  });
  it("verlangt Laden ohne Metadaten und ohne Cache", () => {
    expect(needsRefresh(stub, null, false)).toBe(true);
  });
  it("nutzt den Cache, wenn der Stub keine Pruefsumme kennt", () => {
    expect(needsRefresh({ id: 1, title: "x" }, { id: 1, title: "x", checksum: "abc", created: "" }, true))
      .toBe(false);
  });
});
