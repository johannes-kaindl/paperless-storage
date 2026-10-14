// Funktions-Inventur 2026-10-07: "Clear document cache" ohne Rueckfrage, kein "Verbindung testen",
// Command-Namen und Notices hartkodiert englisch.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Notice } from "obsidian";
import { clearNotices, noticeTexts } from "./notice-helper";
import { confirmAction } from "../../src/vendor/kit-obsidian/confirm";

vi.mock("../../src/vendor/kit-obsidian/confirm", () => ({ confirmAction: vi.fn(() => Promise.resolve(true)) }));
vi.mock("../../src/vendor/kit-obsidian/folder-hide", () => ({ installFolderHide: vi.fn(() => ({ update: vi.fn(), remove: vi.fn() })) }));
vi.mock("../../src/obsidian/embed", () => ({ registerPaperlessEmbed: vi.fn(() => () => undefined) }));
vi.mock("../../src/obsidian/file-view", () => ({ PaperlessFileView: class {}, VIEW_TYPE_PAPERLESS: "paperless-view" }));
vi.mock("../../src/obsidian/insert-modal", () => ({ InsertDocumentModal: class {} }));
vi.mock("../../src/obsidian/title-sync-runner", () => ({ runTitleSync: vi.fn(() => Promise.resolve()) }));
const transportText = vi.fn();
vi.mock("../../src/obsidian/http", () => ({ obsidianTransport: () => ({ text: transportText, binary: vi.fn() }) }));

import PaperlessStoragePlugin from "../../src/obsidian/main";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { PaperlessHttpError } from "../../src/core/errors";
import { setLang, t } from "../../src/core/i18n";

void Notice;

async function loaded(lang: "en" | "de" = "en") {
  const trashed: string[] = [];
  const app = {
    workspace: { rootSplit: { doc: {} }, onLayoutReady: (cb: () => void) => cb() },
    vault: { getFiles: () => [{ path: "_paperless-storage/1.pdf", extension: "pdf" }], getAbstractFileByPath: () => null },
    fileManager: { trashFile: (f: { path: string }) => { trashed.push(f.path); return Promise.resolve(); } },
  };
  const p = new PaperlessStoragePlugin(app as never, { id: "paperless-storage", dir: "plugins/paperless-storage" } as never);
  (p as unknown as { register: unknown }).register = vi.fn();
  p.saveData = vi.fn(() => Promise.resolve());
  p.loadData = vi.fn(() => Promise.resolve({ serverUrl: "https://p.example", apiToken: "T" }));
  await p.onload();
  setLang(lang);
  return { p, trashed, commands: (p as unknown as { commands: Array<{ id: string; name: string; callback?: () => unknown }> }).commands };
}

beforeEach(() => {
  vi.mocked(confirmAction).mockClear();
  vi.mocked(confirmAction).mockResolvedValue(true);
  transportText.mockReset();
  clearNotices();
  setLang("en");
});

describe("Clear document cache fragt nach", () => {
  it("leert den Cache erst nach Bestaetigung", async () => {
    const { commands, trashed } = await loaded();
    await commands.find((c) => c.id === "clear-cache")?.callback?.();
    expect(confirmAction).toHaveBeenCalledTimes(1);
    expect(trashed).toEqual(["_paperless-storage/1.pdf"]);
    expect(noticeTexts()).toEqual([t("notice.cacheCleared", 1)]);
  });

  it("bei 'Abbrechen' passiert nichts und es gibt keine Notice", async () => {
    vi.mocked(confirmAction).mockResolvedValue(false);
    const { commands, trashed } = await loaded();
    await commands.find((c) => c.id === "clear-cache")?.callback?.();
    expect(trashed).toEqual([]);
    expect(noticeTexts()).toEqual([]);
  });
});

describe("Command-Namen laufen ueber i18n", () => {
  it("heissen auf Englisch wie bisher", async () => {
    const { commands } = await loaded();
    expect(commands.map((c) => c.name)).toEqual(["Clear document cache", "Synchronize document titles", "Insert document"]);
  });
});

describe("testConnection", () => {
  it("meldet Erfolg, wenn der Server antwortet", async () => {
    const { p } = await loaded();
    transportText.mockResolvedValue("{}");
    await p.testConnection();
    expect(noticeTexts()).toEqual([t("notice.connected")]);
  });

  it("uebersetzt einen abgelehnten Token", async () => {
    const { p } = await loaded();
    transportText.mockRejectedValue(new PaperlessHttpError(403, "x"));
    await p.testConnection();
    expect(noticeTexts()).toEqual([t("invalidToken")]);
  });

  it("meldet 'nicht erreichbar' bei einem Transportfehler", async () => {
    const { p } = await loaded();
    transportText.mockRejectedValue(new Error("ECONNREFUSED"));
    await p.testConnection();
    expect(noticeTexts()).toEqual([t("notice.unreachable")]);
  });

  it("ohne Einrichtung nur der Hinweis, keine Anfrage", async () => {
    const { p } = await loaded();
    p.settings = { ...DEFAULT_SETTINGS };
    await p.testConnection();
    expect(noticeTexts()).toEqual([t("notConfigured")]);
    expect(transportText).not.toHaveBeenCalled();
  });
});
