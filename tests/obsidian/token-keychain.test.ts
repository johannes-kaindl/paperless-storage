// Der API-Token lag im Klartext in data.json (wandert mit jedem Vault-Sync). Jetzt: Obsidians
// Schluesselbund, Migration beim ersten Laden, Klartext mit Hinweis auf Obsidian vor 1.11.4.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, noticeTexts } from "./notice-helper";

vi.mock("../../src/vendor/kit-obsidian/folder-hide", () => ({ installFolderHide: vi.fn(() => ({ update: vi.fn(), remove: vi.fn() })) }));
vi.mock("../../src/obsidian/embed", () => ({ registerPaperlessEmbed: vi.fn(() => () => undefined) }));
vi.mock("../../src/obsidian/file-view", () => ({ PaperlessFileView: class {}, VIEW_TYPE_PAPERLESS: "paperless-view" }));
vi.mock("../../src/obsidian/insert-modal", () => ({ InsertDocumentModal: class {} }));
vi.mock("../../src/obsidian/title-sync-runner", () => ({ runTitleSync: vi.fn() }));

import PaperlessStoragePlugin from "../../src/obsidian/main";
import { API_TOKEN_SECRET_ID } from "../../src/core/settings";
import { t } from "../../src/core/i18n";

function keychain() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getSecret: (id: string) => values.get(id) ?? null,
      setSecret: (id: string, v: string) => void values.set(id, v),
      listSecrets: () => [...values.keys()],
    },
  };
}

function plugin(secretStorage: object | undefined, stored: unknown) {
  const app = {
    workspace: { rootSplit: { doc: {} }, onLayoutReady: (cb: () => void) => cb() },
    vault: {}, fileManager: {},
    ...(secretStorage ? { secretStorage } : {}),
  };
  const p = new PaperlessStoragePlugin(app as never, { id: "paperless-storage", dir: "d" } as never);
  const data = { value: stored as unknown };
  (p as unknown as { register: unknown }).register = vi.fn();
  p.loadData = () => Promise.resolve(data.value);
  p.saveData = (d: unknown) => { data.value = JSON.parse(JSON.stringify(d)); return Promise.resolve(); };
  return Object.assign(p, { saved: () => data.value as { apiToken: string } });
}

beforeEach(() => clearNotices());

describe("API-Token im Schluesselbund", () => {
  it("hebt einen Altwert aus data.json beim ersten Laden in den Schluesselbund und leert die Datei", async () => {
    const kc = keychain();
    const p = plugin(kc.storage, { serverUrl: "https://p", apiToken: "tok-alt" });
    await p.onload();
    expect(p.settings.apiToken).toBe("tok-alt");
    expect(kc.values.get(API_TOKEN_SECRET_ID)).toBe("tok-alt");
    expect(p.saved().apiToken).toBe("");
    expect(noticeTexts()).toEqual([]);
  });

  it("laedt den Token aus dem Schluesselbund, wenn data.json leer ist", async () => {
    const kc = keychain();
    kc.values.set(API_TOKEN_SECRET_ID, "tok-bund");
    const p = plugin(kc.storage, { apiToken: "" });
    await p.onload();
    expect(p.settings.apiToken).toBe("tok-bund");
  });

  it("beim Speichern bleibt der Token im Speicher, data.json bekommt einen Leerstring", async () => {
    const kc = keychain();
    const p = plugin(kc.storage, null);
    await p.onload();
    p.settings.apiToken = "tok-neu";
    await p.saveSettings();
    expect(p.settings.apiToken).toBe("tok-neu");
    expect(kc.values.get(API_TOKEN_SECRET_ID)).toBe("tok-neu");
    expect(p.saved().apiToken).toBe("");
  });

  it("ohne Schluesselbund (Obsidian vor 1.11.4) bleibt der Token in data.json — mit Hinweis, ohne Verlust", async () => {
    const p = plugin(undefined, { apiToken: "tok-alt" });
    await p.onload();
    expect(p.settings.apiToken).toBe("tok-alt");
    expect(p.saved()?.apiToken ?? "tok-alt").toBe("tok-alt");
    expect(noticeTexts()).toEqual([t("notice.tokenPlaintext")]);
    p.settings.apiToken = "tok-2";
    await p.saveSettings();
    expect(p.saved().apiToken).toBe("tok-2");
  });

  it("ohne Schluesselbund und ohne Token kein Hinweis (ein Nutzer ohne Token sieht keine Warnung)", async () => {
    const p = plugin(undefined, null);
    await p.onload();
    expect(noticeTexts()).toEqual([]);
  });

  it("ein Schluesselbund, der den Wert verwirft, laesst ihn in data.json stehen (Klartext mit Warnung, kein Verlust)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const p = plugin({ getSecret: () => null, setSecret: () => undefined, listSecrets: () => [] }, null);
    await p.onload();
    p.settings.apiToken = "tok-1";
    await p.saveSettings();
    expect(p.saved().apiToken).toBe("tok-1");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
