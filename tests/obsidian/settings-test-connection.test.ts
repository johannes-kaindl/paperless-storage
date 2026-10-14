import { describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import { PaperlessSettingTab, type SettingsHost } from "../../src/obsidian/settings-tab";
import { t } from "../../src/core/i18n";

type Hatch = { name?: string; render?: (s: Setting) => void; control?: { placeholder?: string } };

describe("Settings: Verbindung testen und lokalisierte Texte", () => {
  const host = (testConnection = vi.fn()) => ({ settings: {}, testConnection }) as unknown as SettingsHost;

  it("hat eine Zeile mit Knopf, der testConnection() des Plugins ruft", async () => {
    const testConnection = vi.fn().mockResolvedValue(undefined);
    const tab = new PaperlessSettingTab({} as never, host(testConnection));
    const row = (tab.getSettingDefinitions() as unknown as Hatch[]).find((d) => d.name === t("settings.test"));
    expect(row?.render).toBeDefined();
    const setting = new Setting(undefined as never);
    row?.render?.(setting);
    const button = (setting as unknown as { components: Array<{ textValue?: string; clickCB?: () => unknown }> }).components[0];
    expect(button?.textValue).toBe(t("settings.test.button"));
    await button?.clickCB?.();
    expect(testConnection).toHaveBeenCalledTimes(1);
  });

  it("alle Zeilennamen kommen aus den Strings (keine fest verdrahteten Texte)", () => {
    const tab = new PaperlessSettingTab({} as never, host());
    const names = (tab.getSettingDefinitions() as unknown as Hatch[]).slice(1).map((d) => d.name);
    expect(names).toEqual([
      t("settings.url"), t("settings.token"), t("settings.cache"), t("settings.hide"),
      t("settings.version"), t("settings.height"), t("settings.test"),
    ]);
  });
});
