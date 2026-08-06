import { getLanguage, Notice, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  isConfigured,
  mergeSettings,
  resolveCacheFolder,
  type PaperlessSettings,
} from "../core/settings";
import { pickLang, setLang, t } from "../core/i18n";
import { obsidianTransport } from "./http";
import { CacheStore } from "./cache-store";
import { registerPaperlessEmbed } from "./embed";
import { PaperlessFileView, VIEW_TYPE_PAPERLESS } from "./file-view";
import { PaperlessSettingTab } from "./settings-tab";
import { applyCacheFolderVisibility, removeCacheFolderVisibility } from "./hide-folder";
import { runTitleSync } from "./title-sync-runner";
import { InsertDocumentModal } from "./insert-modal";

export default class PaperlessStoragePlugin extends Plugin {
  settings: PaperlessSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    // Sprachdetektion lebt in der obsidian-Schicht und laeuft einmalig beim onload
    // (PROF-OBS-07) — der reine i18n-Kern kennt obsidian nicht.
    setLang(pickLang(getLanguage()));

    const cache = new CacheStore(this.app.vault, () => resolveCacheFolder(this.settings));
    const deps = {
      app: this.app,
      transport: obsidianTransport(),
      cache,
      settings: () => this.settings,
    };

    // Nicht-werfende Registrierungen zuerst (PROF-OBS-13).
    this.addSettingTab(new PaperlessSettingTab(this.app, this));
    this.applyCacheFolderVisibility();
    this.register(removeCacheFolderVisibility);

    const unregister = registerPaperlessEmbed(deps);
    if (unregister) {
      this.register(unregister);
    } else {
      new Notice("Paperless storage: embeds unavailable in this Obsidian version.");
    }

    this.registerView(VIEW_TYPE_PAPERLESS, (leaf) => new PaperlessFileView(leaf, deps));
    try {
      this.registerExtensions(["paperless"], VIEW_TYPE_PAPERLESS);
    } catch (e) {
      console.warn("[paperless-storage] could not claim '.paperless' as a file view:", e);
    }

    this.addCommand({
      id: "clear-cache",
      name: "Clear document cache",
      callback: async () => {
        const n = await cache.clear();
        new Notice(`Paperless storage: ${n} cached file(s) removed.`);
      },
    });

    this.addCommand({
      id: "sync-titles",
      name: "Synchronize document titles",
      callback: () => {
        void runTitleSync(deps);
      },
    });

    this.addCommand({
      id: "insert-document",
      name: "Insert document",
      editorCallback: (editor, ctx) => {
        if (!isConfigured(this.settings)) {
          new Notice(t("notConfigured"));
          return;
        }
        new InsertDocumentModal(
          {
            app: this.app,
            transport: deps.transport,
            settings: () => this.settings,
            sourcePath: ctx.file?.path ?? "",
          },
          editor,
        ).open();
      },
    });
  }

  applyCacheFolderVisibility(): void {
    applyCacheFolderVisibility(resolveCacheFolder(this.settings), this.settings.hideCacheFolder);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
