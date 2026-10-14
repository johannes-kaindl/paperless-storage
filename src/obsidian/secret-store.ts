// angepasst aus obsidian-kit/src/obsidian/secrets.ts (0.60.1), 2026-10-14 — ohne typisierten Zugriff
// auf `app.secretStorage`.
//
// Warum nicht vendort: dieses Plugin traegt `minAppVersion` 1.8.7 (Entscheidung 2026-10-13: aeltere
// Obsidian-Versionen behalten Klartext mit Hinweis). Das Kit-Modul greift auf `app.secretStorage`
// getypt zu, und `obsidianmd/no-unsupported-api` meldet das unter einem Floor < 1.11.4 als Fehler
// (Lint UND Store-Scanner). Hier laeuft derselbe Zugriff ueber eine lose Typsicht; zur Laufzeit
// entscheidet die FORM (`secretStorageAvailable`), nicht die Versionsnummer.
import type { App } from "obsidian";
import { stripCrLf, type SecretStore } from "../vendor/kit/secrets";

interface LooseSecretStorage {
  getSecret(id: string): string | null;
  setSecret(id: string, value: string): void;
}

function storageOf(app: App): LooseSecretStorage | null {
  const s = (app as unknown as { secretStorage?: Partial<LooseSecretStorage> }).secretStorage;
  return typeof s?.getSecret === "function" && typeof s?.setSecret === "function" ? (s as LooseSecretStorage) : null;
}

/** Der Schluesselbund von Obsidian, oder `null`, wenn diese Version keinen hat. */
export function obsidianSecretStoreOrNull(app: App): SecretStore | null {
  const storage = storageOf(app);
  if (storage === null) return null;
  return {
    get(id: string): string | null {
      const v = storage.getSecret(id);
      return v === "" ? null : v;
    },
    set(id: string, value: string): void {
      const sanitized = stripCrLf(value);
      storage.setSecret(id, sanitized);
      // Zurueckgelesen: ein `setSecret`, das den Wert still verwirft (Plattform ohne Keychain-Zugriff), faellt auf.
      if (storage.getSecret(id) !== sanitized) throw new Error(`Obsidian SecretStorage did not persist ${id}`);
    },
    has(id: string): boolean {
      const v = storage.getSecret(id);
      return v !== null && v !== "";
    },
    delete(id: string): void {
      // Die Obsidian-API hat keinen Loeschaufruf; leer gilt als "nicht vorhanden".
      storage.setSecret(id, "");
    },
  };
}
