// Zweigleisige Settings — EINE Wahrheit fuer beide Renderpfade.
//
// Ab Obsidian 1.13 fragt der Host `getSettingDefinitions()` ab und ruft `display()`
// nie; nur so erscheinen die Settings in der Settings-Suche. Unser `minAppVersion`
// ist 1.8.7, dort gibt es die deklarative API noch nicht — der Host ruft `display()`.
//
// Deshalb ist `getSettingDefinitions()` die einzige Definition, und `display()`
// zeichnet DIESELBE Struktur mit der klassischen `Setting`-API nach. Kein zweiter
// Definitionsbaum, der auseinanderlaufen kann.
//
// Muster: REGISTRY „Zweigleisige deklarative Settings — eine-Wahrheit-Walker",
// minimale Form uebernommen aus `3d-codeblocks/src/obsidian/settings.ts`. Drei Zeilen
// (API-Token, Cache-Ordner, Embed-Hoehe) brauchen mehr als einen generischen Control-Typ
// — Passwort-Maskierung, Ordner-Autocomplete und ein nullbarer Zahlenwert haben keine
// deklarative Entsprechung — und werden deshalb als `render`-Hatches definiert. Eine
// Hatch bekommt ein fertiges `Setting` und zeichnet sich selbst; dieselbe Funktion laeuft
// unveraendert im deklarativen UND im Fallback-Pfad (kein zweiter Rendercode).
import {
  App,
  PluginSettingTab,
  Setting,
  type Plugin,
  type SettingDefinitionItem,
} from "obsidian";
import type { PaperlessSettings } from "../core/settings";
import { renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";
import { githubHelpUrls, helpSettingDefinition } from "../vendor/kit-obsidian/help-setting";
import { t } from "../core/i18n";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
  /** Wendet den aktuellen hideCacheFolder-Zustand sofort an (kein Neustart nötig). */
  applyCacheFolderVisibility(): void;
  /** Prueft Server-URL und Token mit einer Suchanfrage und meldet das Ergebnis als Notice. */
  testConnection(): Promise<void>;
}

export class PaperlessSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly host: SettingsHost,
  ) {
    super(app, host);
  }

  // ── Die eine Wahrheit ────────────────────────────────────────────────────
  // Der Generic-Parameter bindet jeden `key` an ein echtes Settings-Feld: ein
  // Tippfehler bricht den Build, statt zur Laufzeit stumm ins Leere zu greifen.
  getSettingDefinitions(): SettingDefinitionItem<keyof PaperlessSettings>[] {
    return [
      // UI-STANDARD §8: die Hilfe-Zeile steht vor jeder anderen Zeile.
      helpSettingDefinition({
        ...githubHelpUrls("paperless-storage"),
        texts: {
          name: t("settings.help.name"),
          desc: t("settings.help.desc"),
          openDocs: t("settings.help.openDocs"),
          reportIssue: t("settings.help.reportIssue"),
        },
      }),
      {
        name: t("settings.url"),
        desc: t("settings.url.desc"),
        control: { type: "text", key: "serverUrl", placeholder: t("settings.url.placeholder") },
      },
      {
        name: t("settings.token"),
        desc: t("settings.token.desc"),
        render: (setting) => this.renderApiToken(setting),
      },
      {
        name: t("settings.cache"),
        desc: t("settings.cache.desc"),
        render: (setting) => this.renderCacheFolder(setting),
      },
      {
        name: t("settings.hide"),
        desc: t("settings.hide.desc"),
        control: { type: "toggle", key: "hideCacheFolder" },
      },
      {
        name: t("settings.version"),
        desc: t("settings.version.desc"),
        control: {
          type: "dropdown",
          key: "fileVersion",
          options: { archive: t("settings.version.archive"), original: t("settings.version.original") },
        },
      },
      {
        name: t("settings.height"),
        desc: t("settings.height.desc"),
        render: (setting) => this.renderEmbedHeight(setting),
      },
      {
        name: t("settings.test"),
        desc: t("settings.test.desc"),
        aliases: ["connection", "verbindung", "test", "ping"],
        render: (setting) => {
          setting.addButton((b) => b.setButtonText(t("settings.test.button")).onClick(() => void this.host.testConnection()));
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.host.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    (this.host.settings as unknown as Record<string, unknown>)[key] = value;
    await this.host.saveSettings();
    if (key === "hideCacheFolder") this.host.applyCacheFolderVisibility();
  }

  // ── Render-Hatches (ein Code, beide Pfade) ───────────────────────────────

  private renderApiToken(setting: Setting): void {
    setting.addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.host.settings.apiToken).onChange(async (value) => {
        this.host.settings.apiToken = value;
        await this.host.saveSettings();
      });
    });
  }

  private renderCacheFolder(setting: Setting): void {
    setting.addText((text) => {
      text
        .setPlaceholder(t("settings.cache.placeholder"))
        .setValue(this.host.settings.cacheFolder)
        .onChange(async (value) => {
          this.host.settings.cacheFolder = value;
          await this.host.saveSettings();
          this.host.applyCacheFolderVisibility();
        });
      new FolderSuggest(this.app, text.inputEl);
    });
  }

  private renderEmbedHeight(setting: Setting): void {
    setting.addText((text) =>
      text
        .setPlaceholder(t("settings.height.placeholder"))
        .setValue(this.host.settings.embedHeight === null ? "" : String(this.host.settings.embedHeight))
        .onChange(async (value) => {
          const trimmed = value.trim();
          const n = Number(trimmed);
          this.host.settings.embedHeight =
            trimmed === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n);
          await this.host.saveSettings();
        }),
    );
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  private cleanupPrevious: () => void = () => {};

  display(): void {
    this.cleanupPrevious();
    this.containerEl.empty();
    this.cleanupPrevious = renderSettingDefinitions(
      this.containerEl,
      this.getSettingDefinitions(),
      this,
      this.app,
    );
  }
}
