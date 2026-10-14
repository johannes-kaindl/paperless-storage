import { getLanguage, Notice, Plugin } from "obsidian";
import {
  DEFAULT_SETTINGS,
  isConfigured,
  resolveCacheFolder,
  type PaperlessSettings,
} from "../core/settings";
import { mergeSettings } from "../vendor/kit/settings";
import { pickLang, setLang, t } from "../core/i18n";
import { obsidianTransport } from "./http";
import { CacheStore } from "./cache-store";
import { registerPaperlessEmbed } from "./embed";
import { PaperlessFileView, VIEW_TYPE_PAPERLESS } from "./file-view";
import { PaperlessSettingTab } from "./settings-tab";
import { installFolderHide, type FolderHideHandle } from "../vendor/kit-obsidian/folder-hide";
import { confirmAction } from "../vendor/kit-obsidian/confirm";
import { searchRequest } from "../core/paperless-api";
import { PaperlessHttpError, describeHttpError } from "../core/errors";
import { runTitleSync } from "./title-sync-runner";
import { InsertDocumentModal } from "./insert-modal";

export default class PaperlessStoragePlugin extends Plugin {
  settings: PaperlessSettings = DEFAULT_SETTINGS;
  private folderHide: FolderHideHandle | null = null;

  async onload(): Promise<void> {
    this.settings = mergeSettings(DEFAULT_SETTINGS, await this.loadData());
    // Sprachdetektion lebt in der obsidian-Schicht und laeuft einmalig beim onload
    // (PROF-OBS-07) — der reine i18n-Kern kennt obsidian nicht.
    setLang(pickLang(getLanguage()));

    const cache = new CacheStore(
      this.app.vault,
      () => resolveCacheFolder(this.settings),
      (f) => this.app.fileManager.trashFile(f),
    );
    const deps = {
      app: this.app,
      transport: obsidianTransport(),
      cache,
      settings: () => this.settings,
    };

    // Nicht-werfende Registrierungen zuerst (PROF-OBS-13).
    this.addSettingTab(new PaperlessSettingTab(this.app, this));
    // Nach onLayoutReady: der Griff braucht rootSplit.doc, das Dokument des Datei-Explorers.
    this.app.workspace.onLayoutReady(() => this.applyCacheFolderVisibility());
    this.register(() => {
      this.folderHide?.remove();
      this.folderHide = null;
    });

    const unregister = registerPaperlessEmbed(deps);
    if (unregister) {
      this.register(unregister);
    } else {
      new Notice(t("notice.embedsUnavailable"));
    }

    this.registerView(VIEW_TYPE_PAPERLESS, (leaf) => new PaperlessFileView(leaf, deps));
    try {
      this.registerExtensions(["paperless"], VIEW_TYPE_PAPERLESS);
    } catch (e) {
      console.warn("[paperless-storage] could not claim '.paperless' as a file view:", e);
    }

    this.addCommand({
      id: "clear-cache",
      name: t("command.clearCache"),
      callback: async () => {
        // Rueckfrage: das Leeren verwirft alle zwischengespeicherten Dokumente (und damit die
        // Offline-Lesbarkeit, bis sie neu geladen sind).
        const go = await confirmAction(this.app, {
          title: t("confirm.clear.title"),
          message: t("confirm.clear.body"),
          confirmLabel: t("confirm.clear.ok"),
          cancelLabel: t("confirm.cancel"),
        });
        if (!go) return;
        const n = await cache.clear();
        new Notice(t("notice.cacheCleared", n));
      },
    });

    this.addCommand({
      id: "sync-titles",
      name: t("command.syncTitles"),
      callback: () => {
        // Eine Ablehnung (renameFile/vault.modify wirft in der Schleife) landete sonst als
        // unhandled rejection ohne jede Rueckmeldung fuer den Nutzer (Befund 2, Gesamt-
        // Review Phase 2).
        runTitleSync({ ...deps, backupDir: this.manifest.dir ?? "" }).catch((e: unknown) => {
          new Notice(t("notice.titleSyncFailed", String(e)));
        });
      },
    });

    this.addCommand({
      id: "insert-document",
      name: t("command.insert"),
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

  /** "Verbindung testen" im Einstellungs-Tab: eine Suchanfrage prueft URL, Token und Erreichbarkeit
   *  in einem Zug. Ein abgelehnter Token bekommt seine eigene Meldung, nicht den HTTP-Rohtext. */
  async testConnection(): Promise<void> {
    if (!isConfigured(this.settings)) {
      new Notice(t("notConfigured"));
      return;
    }
    try {
      await obsidianTransport().text(searchRequest({ serverUrl: this.settings.serverUrl, apiToken: this.settings.apiToken }, ""));
      new Notice(t("notice.connected"));
    } catch (e) {
      if (e instanceof PaperlessHttpError) {
        new Notice(e.status === 401 || e.status === 403 ? t("invalidToken") : `Paperless storage: ${describeHttpError(e)}`);
      } else {
        new Notice(t("notice.unreachable"));
      }
    }
  }

  /** Blendet den Cache-Ordner samt Inhalt im Datei-Explorer aus bzw. ein (Kit `folder-hide`).
   *  Erster Aufruf installiert das Stylesheet, jeder weitere aktualisiert es. Ziel ist das
   *  Dokument des Haupt-Workspace (`rootSplit.doc`), nicht `activeDocument` — das waere im
   *  ausgelagerten Einstellungsfenster (Obsidian >=1.13) oder einem Pop-out das falsche. */
  applyCacheFolderVisibility(): void {
    const folder = resolveCacheFolder(this.settings);
    const hide = this.settings.hideCacheFolder;
    if (this.folderHide) {
      this.folderHide.update(folder, hide);
      return;
    }
    // Kosmetisch: ein Fehler beim Anhaengen darf das Laden nie abbrechen (Kit meldet ihn hier).
    this.folderHide = installFolderHide(this.app.workspace.rootSplit.doc, folder, hide, (e) => {
      console.warn("paperless-storage: Cache-Ordner konnte nicht ausgeblendet werden", e);
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
