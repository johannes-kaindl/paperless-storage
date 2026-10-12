import { beforeEach, describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";

const update = vi.fn();
const install = vi.fn(() => ({ update, remove: vi.fn() }));
vi.mock("../../src/vendor/kit-obsidian/folder-hide", () => ({
  installFolderHide: (...args: unknown[]) => (install as (...a: unknown[]) => unknown)(...args),
}));

// Die Host-nahen Module (Embed, FileView, Modal) erben von Obsidian-Klassen, die der Mock nicht
// kennt; für diese Frage (Settings → Ausblend-Regel) sind sie ohne Belang.
vi.mock("../../src/obsidian/embed", () => ({ registerPaperlessEmbed: vi.fn() }));
vi.mock("../../src/obsidian/file-view", () => ({ PaperlessFileView: class {}, VIEW_TYPE_PAPERLESS: "paperless-view" }));
vi.mock("../../src/obsidian/insert-modal", () => ({ InsertDocumentModal: class {} }));
vi.mock("../../src/obsidian/title-sync-runner", () => ({ runTitleSync: vi.fn() }));

import PaperlessStoragePlugin from "../../src/obsidian/main";
import { PaperlessSettingTab } from "../../src/obsidian/settings-tab";
import { DEFAULT_SETTINGS } from "../../src/core/settings";

type Def = { name?: string; render?: (s: Setting) => void };

/** Ändert der Nutzer den Cache-Ordner im Settings-Feld, muss die Ausblend-Regel dem NEUEN
 *  Ordner folgen — nicht bei der Installation stehen bleiben (Task "Cache-Ordner ausblenden —
 *  Regel wird bei geändertem cacheFolder nicht aktualisiert"). */
describe("Cache-Ordner ausblenden folgt dem geänderten cacheFolder", () => {
  beforeEach(() => {
    update.mockClear();
    install.mockClear();
  });

  async function aendere(plugin: PaperlessStoragePlugin, neu: string): Promise<void> {
    plugin.saveData = vi.fn(() => Promise.resolve());
    const tab = new PaperlessSettingTab(plugin.app, plugin as never);
    const def = (tab.getSettingDefinitions() as unknown as Def[]).find((d) => d.name === "Cache folder");
    const setting = new Setting(undefined as never);
    def?.render?.(setting);
    const text = (setting as unknown as { components: Array<{ onChangeCB: ((v: string) => Promise<void>) | null }> }).components[0];
    await text?.onChangeCB?.(neu);
  }

  function plugin(): PaperlessStoragePlugin {
    const app = { workspace: { rootSplit: { doc: {} } } };
    const p = new PaperlessStoragePlugin(app as never, { id: "paperless-storage" } as never);
    p.settings = { ...DEFAULT_SETTINGS, cacheFolder: "alt/", hideCacheFolder: true };
    return p;
  }

  it("installiert die Regel für den alten Ordner und aktualisiert sie nach der Änderung auf den neuen", async () => {
    const p = plugin();
    p.applyCacheFolderVisibility();
    expect(install).toHaveBeenCalledWith(expect.anything(), "alt", true, expect.any(Function));
    await aendere(p, "neu/ordner/");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("neu/ordner", true);
  });

  it("ein leerer Wert fällt auf den Default-Ordner zurück", async () => {
    const p = plugin();
    p.applyCacheFolderVisibility();
    await aendere(p, "   ");
    expect(update).toHaveBeenCalledWith("_paperless-storage", true);
  });
});
