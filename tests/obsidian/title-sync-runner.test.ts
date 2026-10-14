// Funktions-Inventur 2026-10-07: der Titelabgleich benannte Dateien um und ueberschrieb Inhalt ohne
// Vorschau, Rueckfrage oder Schnappschuss.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { confirmAction } from "../../src/vendor/kit-obsidian/confirm";
import { runTitleSync } from "../../src/obsidian/title-sync-runner";
import { DEFAULT_SETTINGS } from "../../src/core/settings";

vi.mock("../../src/vendor/kit-obsidian/confirm", () => ({ confirmAction: vi.fn(() => Promise.resolve(true)) }));

function setup(serverTitles: Record<number, string>, extraDocs = 0) {
  const texts = new Map<string, string>([
    ["Doc A.paperless", JSON.stringify({ id: 1, title: "Alt A" })],
    ["Doc B.paperless", JSON.stringify({ id: 2, title: "Alt B" })],
  ]);
  for (let i = 3; i < 3 + extraDocs; i++) {
    texts.set(`Doc ${i}.paperless`, JSON.stringify({ id: i, title: `Alt ${i}` }));
    serverTitles[i] = `Neu ${i}`;
  }
  const files = new Map([...texts.keys()].map((p) => [p, new TFile(p, "paperless")]));
  const order: string[] = [];
  const adapter = { write: vi.fn((p: string) => { order.push(`backup:${p}`); return Promise.resolve(); }) };
  const renameFile = vi.fn((f: TFile, to: string) => { order.push(`rename:${f.path}`); files.set(to, new TFile(to, "paperless")); texts.set(to, texts.get(f.path) ?? ""); return Promise.resolve(); });
  const modify = vi.fn(() => Promise.resolve());
  const app = {
    vault: {
      getFiles: () => [...files.values()],
      getAbstractFileByPath: (p: string) => files.get(p) ?? null,
      cachedRead: (f: TFile) => Promise.resolve(texts.get(f.path) ?? ""),
      modify, adapter,
    },
    fileManager: { renameFile },
  };
  const transport = {
    text: vi.fn((spec: { url: string }) => {
      const id = Number(/documents\/(\d+)\//.exec(spec.url)?.[1]);
      return Promise.resolve(JSON.stringify({ id, title: serverTitles[id] ?? "", checksum: "c", created: "" }));
    }),
    binary: vi.fn(),
  };
  const deps = { app, transport, settings: () => ({ ...DEFAULT_SETTINGS, serverUrl: "https://p.example", apiToken: "T" }), backupDir: "plugins/paperless-storage" };
  return { deps: deps as never, renameFile, adapter, order, modify };
}

beforeEach(() => {
  vi.mocked(confirmAction).mockClear();
  vi.mocked(confirmAction).mockResolvedValue(true);
});

describe("runTitleSync — Vorschau, Rueckfrage, Schnappschuss", () => {
  it("zeigt eine Vorschau (alt → neu) und sichert VOR dem ersten Umbenennen", async () => {
    const t = setup({ 1: "Neu A", 2: "Neu B" });
    await runTitleSync(t.deps);
    const opts = vi.mocked(confirmAction).mock.calls[0]?.[1];
    expect(opts?.message).toContain("Alt A → Neu A");
    expect(opts?.message).toContain("Alt B → Neu B");
    expect(t.order[0]).toMatch(/^backup:plugins\/paperless-storage\/title-sync-backup-/);
    expect(t.order.slice(1)).toEqual(["rename:Doc A.paperless", "rename:Doc B.paperless"]);
  });

  it("die Sicherung enthaelt Pfad und alten Inhalt", async () => {
    const t = setup({ 1: "Neu A" });
    await runTitleSync(t.deps);
    const written = JSON.parse(t.adapter.write.mock.calls[0]?.[1] as unknown as string) as { items: { path: string; content: string }[] };
    expect(written.items).toEqual([{ path: "Doc A.paperless", content: JSON.stringify({ id: 1, title: "Alt A" }) }]);
  });

  it("bei 'Abbrechen' wird weder gesichert noch umbenannt", async () => {
    vi.mocked(confirmAction).mockResolvedValue(false);
    const t = setup({ 1: "Neu A" });
    await runTitleSync(t.deps);
    expect(t.adapter.write).not.toHaveBeenCalled();
    expect(t.renameFile).not.toHaveBeenCalled();
  });

  it("scheitert die Sicherung, wird NICHTS umbenannt", async () => {
    const t = setup({ 1: "Neu A" });
    t.adapter.write.mockRejectedValueOnce(new Error("disk full"));
    await expect(runTitleSync(t.deps)).rejects.toThrow("disk full");
    expect(t.renameFile).not.toHaveBeenCalled();
  });

  it("ohne geaenderte Titel keine Rueckfrage und keine Sicherung", async () => {
    const t = setup({ 1: "Alt A", 2: "Alt B" });
    await runTitleSync(t.deps);
    expect(confirmAction).not.toHaveBeenCalled();
    expect(t.adapter.write).not.toHaveBeenCalled();
  });

  it("deckelt die Vorschau und nennt den Rest", async () => {
    const t = setup({ 1: "Neu A", 2: "Neu B" }, 9);
    await runTitleSync(t.deps);
    const msg = vi.mocked(confirmAction).mock.calls[0]?.[1].message as string[];
    expect(msg.filter((l) => l.includes("→"))).toHaveLength(8);
    expect(msg.at(-1)).toContain("3");
  });
});
