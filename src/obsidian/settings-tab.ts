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
  type SettingControl,
  type SettingDefinitionItem,
} from "obsidian";
import type { PaperlessSettings } from "../core/settings";
import { FolderSuggest } from "../vendor/kit-obsidian/folder-suggest";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
  /** Wendet den aktuellen hideCacheFolder-Zustand sofort an (kein Neustart nötig). */
  applyCacheFolderVisibility(): void;
}

/** Lokale, absichtlich lockere Signatur fuer den Fallback-Aufruf einer render-Hatch —
 *  `SettingDefinitionRender.render` verlangt offiziell ein zweites `SettingGroup`-Argument,
 *  das im klassischen display()-Pfad keine Entsprechung hat. Eine Hatch, die nur den
 *  ersten Parameter deklariert, ist trotzdem zuweisungskompatibel (JS ignoriert
 *  ueberzaehlige Argumente); nur der direkte Aufruf durch `def.render(setting)` braucht
 *  hier den laxeren lokalen Typ, sonst verlangt TS zwei Argumente. */
type RenderHatch = (setting: Setting) => void;

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
      {
        name: "Server URL",
        desc: "Base URL of your paperless-ngx instance, e.g. https://paperless.example.org",
        control: { type: "text", key: "serverUrl", placeholder: "https://paperless.example.org" },
      },
      {
        name: "API token",
        desc: "Create one in paperless under settings. Stored in this plugin's data.json.",
        render: (setting) => this.renderApiToken(setting),
      },
      {
        name: "Cache folder",
        desc: "Vault folder where downloaded pdfs are cached.",
        render: (setting) => this.renderCacheFolder(setting),
      },
      {
        name: "Hide cache folder",
        desc: "Hide the cache folder in the file explorer.",
        control: { type: "toggle", key: "hideCacheFolder" },
      },
      {
        name: "File version",
        desc: "Which version of the document to embed and cache.",
        control: {
          type: "dropdown",
          key: "fileVersion",
          options: { archive: "Archive (searchable PDF)", original: "Original" },
        },
      },
      {
        name: "Default embed height",
        desc: "Height in pixels for embedded documents. Leave empty for Obsidian's default.",
        render: (setting) => this.renderEmbedHeight(setting),
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
        .setPlaceholder("_paperless-storage/")
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

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  display(): void {
    this.containerEl.empty();
    for (const item of this.getSettingDefinitions()) {
      this.renderDefinitionItem(this.containerEl, item);
    }
  }

  private renderDefinitionItem(containerEl: HTMLElement, item: SettingDefinitionItem): void {
    const def = item as { name?: string; desc?: string; control?: SettingControl; render?: RenderHatch };
    const setting = new Setting(containerEl);
    if (def.name) setting.setName(def.name);
    if (typeof def.desc === "string") setting.setDesc(def.desc);
    if (def.render) {
      def.render(setting);
      return;
    }
    if (def.control) this.renderControl(setting, def.control);
  }

  private renderControl(setting: Setting, control: SettingControl): void {
    const current = this.getControlValue(control.key);
    const save = (value: unknown): void => {
      void this.setControlValue(control.key, value);
    };

    switch (control.type) {
      case "toggle":
        setting.addToggle((toggle) => toggle.setValue(current as boolean).onChange(save));
        break;
      case "dropdown":
        setting.addDropdown((dropdown) => {
          for (const [key, label] of Object.entries(control.options)) dropdown.addOption(key, label);
          dropdown.setValue(String(current)).onChange(save);
        });
        break;
      case "text":
      default:
        setting.addText((text) =>
          text
            .setPlaceholder((control as { placeholder?: string }).placeholder ?? "")
            .setValue(String(current))
            .onChange(save),
        );
        break;
    }
  }
}
