import { App, PluginSettingTab, Setting, type Plugin } from "obsidian";
import type { FileVersion, PaperlessSettings } from "../core/settings";
import { FolderSuggest } from "./folder-suggest";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
  /** Wendet den aktuellen hideCacheFolder-Zustand sofort an (kein Neustart nötig). */
  applyCacheFolderVisibility(): void;
}

export class PaperlessSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly host: SettingsHost,
  ) {
    super(app, host);
  }

  display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("Server URL")
      .setDesc("Base URL of your paperless-ngx instance, e.g. https://paperless.example.org")
      .addText((text) =>
        text
          .setPlaceholder("https://paperless.example.org")
          .setValue(this.host.settings.serverUrl)
          .onChange(async (value) => {
            this.host.settings.serverUrl = value;
            await this.host.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("API token")
      .setDesc("Create one in paperless under settings. Stored in this plugin's data.json.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setValue(this.host.settings.apiToken)
          .onChange(async (value) => {
            this.host.settings.apiToken = value;
            await this.host.saveSettings();
          });
      });

    new Setting(this.containerEl)
      .setName("Cache folder")
      .setDesc("Vault folder where downloaded PDFs are cached.")
      .addText((text) => {
        text
          .setPlaceholder("_paperless-storage/")
          .setValue(this.host.settings.cacheFolder)
          .onChange(async (value) => {
            this.host.settings.cacheFolder = value;
            await this.host.saveSettings();
            this.host.applyCacheFolderVisibility();
          });
        new FolderSuggest(this.app, text.inputEl);
      });

    new Setting(this.containerEl)
      .setName("Hide cache folder")
      .setDesc("Hide the cache folder in the file explorer.")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.hideCacheFolder).onChange(async (value) => {
          this.host.settings.hideCacheFolder = value;
          await this.host.saveSettings();
          this.host.applyCacheFolderVisibility();
        }),
      );

    new Setting(this.containerEl)
      .setName("File version")
      .setDesc("Which version of the document to embed and cache.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("archive", "Archive (searchable PDF)")
          .addOption("original", "Original")
          .setValue(this.host.settings.fileVersion)
          .onChange(async (value) => {
            this.host.settings.fileVersion = value as FileVersion;
            await this.host.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Default embed height")
      .setDesc("Height in pixels for embedded documents. Leave empty for Obsidian's default.")
      .addText((text) =>
        text
          .setPlaceholder("Obsidian default")
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
}
