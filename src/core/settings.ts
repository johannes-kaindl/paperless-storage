// Der Cache-Ordner folgt dem vim-dojo-Muster (`missionFolder: '_neurovim/'`):
// Unterstrich-Praefix im Vault-Root, frei konfigurierbar. Eine leere Eingabe faellt
// auf den Default zurueck, statt Dateien im Vault-Root zu materialisieren.

export type FileVersion = "archive" | "original";

export interface PaperlessSettings {
  serverUrl: string;
  apiToken: string;
  cacheFolder: string;
  hideCacheFolder: boolean;
  fileVersion: FileVersion;
  /** `null` = Obsidian-Default-Hoehe fuer Embeds, sonst Pixelwert. */
  embedHeight: number | null;
}

export const DEFAULT_SETTINGS: PaperlessSettings = {
  serverUrl: "",
  apiToken: "",
  cacheFolder: "_paperless-storage/",
  hideCacheFolder: true,
  fileVersion: "archive",
  embedHeight: null,
};

// mergeSettings lag hier bis 0.27.0 als reiner Spread. Es kommt jetzt aus dem Kit
// (src/vendor/kit/settings.ts) und ist zweiparametrig: mergeSettings(DEFAULT_SETTINGS, raw).

/** Normalisierter Ordner ohne fuehrende/abschlieszende Schraegstriche. */
export function resolveCacheFolder(settings: PaperlessSettings): string {
  const raw = settings.cacheFolder.trim();
  const chosen = raw === "" ? DEFAULT_SETTINGS.cacheFolder : raw;
  return chosen.replace(/^\/+|\/+$/g, "");
}

export function isConfigured(settings: PaperlessSettings): boolean {
  return settings.serverUrl.trim() !== "" && settings.apiToken.trim() !== "";
}
