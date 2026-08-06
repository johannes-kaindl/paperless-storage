import { App, PluginSettingTab, Setting, type Plugin } from "obsidian";
import type { PaperlessSettings } from "../core/settings";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
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
  }
}
