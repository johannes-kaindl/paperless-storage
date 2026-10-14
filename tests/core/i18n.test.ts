import { describe, expect, it } from "vitest";
import { getLang, setLang, t } from "../../src/core/i18n";

// Die Strings stehen in `defineStrings` (kein exportiertes Objekt): die Gleichheit der Schluessel
// beider Sprachen misst sich ueber die Aufloesung — ein fehlender Schluessel faellt auf den Namen zurueck.
const KEYS = [
  "retry", "openSettings", "viewerUnavailable", "settings.help.name", "settings.url", "settings.token",
  "settings.cache", "settings.hide", "settings.version", "settings.version.archive", "settings.height",
  "settings.test", "settings.test.button", "notice.connected", "notice.unreachable", "notice.embedsUnavailable",
  "notice.cacheCleared", "notice.titleSyncFailed", "notice.titleBackup", "command.clearCache", "command.syncTitles",
  "command.insert", "confirm.cancel", "confirm.clear.title", "confirm.clear.body", "confirm.clear.ok",
  "confirm.titles.title", "confirm.titles.body", "confirm.titles.more", "confirm.titles.ok",
];

describe("i18n — beide Sprachen kennen jeden Schluessel", () => {
  for (const lang of ["en", "de"] as const) {
    it(`${lang}: kein Schluessel faellt auf seinen Namen zurueck`, () => {
      setLang(lang);
      expect(getLang()).toBe(lang);
      for (const key of KEYS) expect(t(key), `${lang}: ${key}`).not.toBe(key);
      setLang("en");
    });
  }

  it("Deutsch und Englisch unterscheiden sich fuer die Command-Namen", () => {
    setLang("de");
    const de = t("command.clearCache");
    setLang("en");
    expect(de).not.toBe(t("command.clearCache"));
  });
});
