import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { CacheStore } from "../../src/obsidian/cache-store";

type FileCtor = new (path: string) => TFile;
const MockFile = TFile as unknown as FileCtor;

function vaultDouble(initial: Record<string, string> = {}) {
  const texts = new Map(Object.entries(initial));
  const files = new Map<string, TFile>();
  const mk = (p: string) => {
    const f = new MockFile(p) as TFile & { extension: string };
    (f as { extension: string }).extension = p.slice(p.lastIndexOf(".") + 1);
    files.set(p, f);
    return f;
  };
  for (const p of texts.keys()) mk(p);
  const vault = {
    getAbstractFileByPath: (p: string) => files.get(p) ?? null,
    getFiles: () => [...files.values()],
    read: (f: TFile) => Promise.resolve(texts.get(f.path) ?? ""),
    create: (p: string, text: string) => { texts.set(p, text); return Promise.resolve(mk(p)); },
    modify: (f: TFile, text: string) => { texts.set(f.path, text); return Promise.resolve(); },
    createFolder: () => Promise.resolve(),
  };
  const trash = vi.fn((f: TFile) => { files.delete(f.path); texts.delete(f.path); return Promise.resolve(); });
  return { store: new CacheStore(vault as never, () => "cache", trash), texts, trash, mk };
}

describe("CacheStore — Pruefsummen-Sidecar", () => {
  it("schreibt <id>.json neben das PDF und liest die Pruefsumme zurueck", async () => {
    const { store, texts } = vaultDouble();
    await store.writeChecksum("cache/7.pdf", "abc");
    expect(texts.get("cache/7.json")).toBe('{"checksum":"abc"}\n');
    expect(await store.readChecksum("cache/7.pdf")).toBe("abc");
  });

  it("ueberschreibt eine vorhandene Pruefsumme", async () => {
    const { store } = vaultDouble({ "cache/7.json": '{"checksum":"alt"}' });
    await store.writeChecksum("cache/7.pdf", "neu");
    expect(await store.readChecksum("cache/7.pdf")).toBe("neu");
  });

  it("unterscheidet Original und Archiv (eigene Dateien)", async () => {
    const { store, texts } = vaultDouble();
    await store.writeChecksum("cache/7-original.pdf", "o");
    expect(texts.has("cache/7-original.json")).toBe(true);
    expect(await store.readChecksum("cache/7.pdf")).toBeUndefined();
  });

  it("liefert undefined ohne Sidecar und bei kaputtem Inhalt, statt zu werfen", async () => {
    expect(await vaultDouble().store.readChecksum("cache/7.pdf")).toBeUndefined();
    expect(await vaultDouble({ "cache/7.json": "{kaputt" }).store.readChecksum("cache/7.pdf")).toBeUndefined();
    expect(await vaultDouble({ "cache/7.json": '{"checksum":3}' }).store.readChecksum("cache/7.pdf")).toBeUndefined();
  });

  it("clear() entfernt PDFs UND Sidecars, zaehlt aber nur die PDFs", async () => {
    const { store, trash, mk } = vaultDouble({ "cache/7.json": '{"checksum":"a"}', "other/x.json": "{}" });
    mk("cache/7.pdf");
    expect(await store.clear()).toBe(1);
    const gone = trash.mock.calls.map((c) => c[0].path).sort();
    expect(gone).toEqual(["cache/7.json", "cache/7.pdf"]);
  });
});
