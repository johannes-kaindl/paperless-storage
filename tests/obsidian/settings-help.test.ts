import { afterEach, describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import { PaperlessSettingTab, type SettingsHost } from "../../src/obsidian/settings-tab";

/** UI-STANDARD §8: die Hilfe-Zeile ist das ERSTE Element der Settings, vor jeder Zeile.
 *  Die Settings dieses Plugins sind nur englisch — die Zeile also auch. */
type Hatch = { name?: string; desc?: string; render?: (s: Setting) => void };

const erste = (): Hatch => {
  const tab = new PaperlessSettingTab({} as never, { settings: {} } as unknown as SettingsHost);
  return tab.getSettingDefinitions()[0] as unknown as Hatch;
};

describe("Hilfe-Zeile in den Settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ist das ERSTE Element von getSettingDefinitions, vor jeder anderen Zeile", () => {
    expect(erste().name).toBe("Help");
    expect(erste().desc).toBe("Getting started, how-tos and troubleshooting");
    expect(typeof erste().render).toBe("function");
  });

  it("die Knöpfe öffnen Doku-Index und Issues dieses Repos", () => {
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    const setting = new Setting(undefined as never);
    erste().render?.(setting);
    const knoepfe = (setting as unknown as { components: Array<{ clickCB: (() => void) | null }> }).components;
    expect(knoepfe).toHaveLength(2);
    knoepfe.forEach((k) => k.clickCB?.());
    expect(open.mock.calls.map((c) => c[0])).toEqual([
      "https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.md",
      "https://github.com/johannes-kaindl/paperless-storage/issues",
    ]);
  });
});
