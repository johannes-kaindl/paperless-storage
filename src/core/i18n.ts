import { defineStrings } from "../vendor/kit/i18n";

defineStrings({
  en: {
    notConfigured: "Paperless Storage is not set up yet — open the plugin settings.",
    loading: "Loading document…",
    offline: "Server unreachable — showing cached copy.",
    noCacheOffline: "Server unreachable and no cached copy available.",
    invalidToken: "API token rejected. Check the plugin settings.",
    notFound: "Document {0} no longer exists in paperless.",
    brokenStub: "Cannot read this .paperless file: {0}",
    cacheWriteFailed: "Downloaded, but could not be cached: {0}",
    retry: "Retry",
  },
  de: {
    notConfigured: "Paperless Storage ist noch nicht eingerichtet — bitte in den Plugin-Einstellungen konfigurieren.",
    loading: "Dokument wird geladen…",
    offline: "Server nicht erreichbar — zwischengespeicherte Fassung.",
    noCacheOffline: "Server nicht erreichbar, keine zwischengespeicherte Fassung vorhanden.",
    invalidToken: "API-Token abgelehnt. Bitte in den Plugin-Einstellungen prüfen.",
    notFound: "Dokument {0} existiert in paperless nicht mehr.",
    brokenStub: "Diese .paperless-Datei ist nicht lesbar: {0}",
    cacheWriteFailed: "Geladen, konnte aber nicht zwischengespeichert werden: {0}",
    retry: "Erneut versuchen",
  },
});

export { t, setLang, getLang, pickLang } from "../vendor/kit/i18n";
export type { Lang } from "../vendor/kit/i18n";
