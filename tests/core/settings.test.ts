import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS, mergeSettings, isConfigured, resolveCacheFolder,
} from "../../src/core/settings";

describe("DEFAULT_SETTINGS", () => {
  it("nutzt _paperless-storage/ im Vault-Root", () => {
    expect(DEFAULT_SETTINGS.cacheFolder).toBe("_paperless-storage/");
  });
  it("liefert leere Zugangsdaten", () => {
    expect(DEFAULT_SETTINGS.serverUrl).toBe("");
    expect(DEFAULT_SETTINGS.apiToken).toBe("");
  });
  it("blendet den Cache-Ordner standardmaeszig aus", () => {
    expect(DEFAULT_SETTINGS.hideCacheFolder).toBe(true);
  });
  it("nutzt standardmaeszig das Archiv-PDF", () => {
    expect(DEFAULT_SETTINGS.fileVersion).toBe("archive");
  });
});

describe("mergeSettings", () => {
  it("ergaenzt fehlende Felder aus den Defaults", () => {
    expect(mergeSettings({ serverUrl: "https://x.tld" }).cacheFolder).toBe("_paperless-storage/");
  });
  it("vertraegt null und undefined", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
  it("uebernimmt gesetzte Werte", () => {
    expect(mergeSettings({ apiToken: "abc" }).apiToken).toBe("abc");
  });
  it("liefert bei jedem Aufruf ein frisches Objekt", () => {
    const a = mergeSettings({});
    a.cacheFolder = "geaendert/";
    expect(mergeSettings({}).cacheFolder).toBe("_paperless-storage/");
  });
});

describe("resolveCacheFolder", () => {
  it("faellt bei leerer Eingabe auf den Default zurueck", () => {
    expect(resolveCacheFolder({ ...DEFAULT_SETTINGS, cacheFolder: "" }))
      .toBe("_paperless-storage");
  });
  it("faellt bei reinem Whitespace auf den Default zurueck", () => {
    expect(resolveCacheFolder({ ...DEFAULT_SETTINGS, cacheFolder: "   " }))
      .toBe("_paperless-storage");
  });
  it("entfernt fuehrende und abschlieszende Schraegstriche", () => {
    expect(resolveCacheFolder({ ...DEFAULT_SETTINGS, cacheFolder: "/a/b/" })).toBe("a/b");
  });
});

describe("isConfigured", () => {
  it("ist falsch ohne URL", () => {
    expect(isConfigured({ ...DEFAULT_SETTINGS, apiToken: "t" })).toBe(false);
  });
  it("ist falsch ohne Token", () => {
    expect(isConfigured({ ...DEFAULT_SETTINGS, serverUrl: "https://x.tld" })).toBe(false);
  });
  it("ist wahr mit beidem", () => {
    expect(isConfigured({ ...DEFAULT_SETTINGS, serverUrl: "https://x.tld", apiToken: "t" }))
      .toBe(true);
  });
});
