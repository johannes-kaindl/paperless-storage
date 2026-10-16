// vendored from obsidian-kit@0.61.0, src/obsidian/secret-store-loose.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import type { App } from "obsidian";
import { stripCrLf, type SecretStore } from "../kit/secrets";

/** Der Schlüsselbund von Obsidian ohne getypten Zugriff auf `app.secretStorage` — für Plugins mit `minAppVersion` unter 1.11.4.
 *
 *  **Warum ein eigenes Modul neben `secrets.ts`:** `obsidianSecretStore` greift getypt zu (`app.secretStorage.getSecret`).
 *  Unter einem Floor < 1.11.4 meldet `obsidianmd/no-unsupported-api` jede dieser Stellen als Fehler (Lint und Store-Scanner;
 *  gemessen an paperless-storage mit Floor 1.8.7, zehn Fehler). Wer `secrets.ts` für so einen Floor vendort, bekäme sie
 *  trotzdem. Dieses Modul hängt an nichts aus `secrets.ts` und lässt sich allein vendoren.
 *
 *  **Form statt Version:** ob der Schlüsselbund da ist, sagt die API selbst — `null`, wenn `getSecret` oder `setSecret` keine
 *  Funktion ist. Eine Versionsnummer sagt nur, ab wann er da sein sollte (Muster anysource-sideloader `src/main.ts`).
 *
 *  Verhalten wie `obsidianSecretStore`: `get` liefert `null` für leer; `set` bereinigt CR/LF und liest nach dem Schreiben
 *  zurück (TaskNotes-Kniff), ein `setSecret`, das den Wert still verwirft, wirft; `delete` schreibt den Leerstring (die
 *  Obsidian-API hat keinen Löschaufruf), `has` behandelt leer als „nicht vorhanden“. Der Schlüsselbund wird einmal beim
 *  Anlegen gelesen: wer `null` bekam, ruft die Funktion nach einem Obsidian-Update erneut. */
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
      if (storage.getSecret(id) !== sanitized) throw new Error(`Obsidian SecretStorage did not persist ${id}`);
    },
    has(id: string): boolean {
      const v = storage.getSecret(id);
      return v !== null && v !== "";
    },
    delete(id: string): void {
      storage.setSecret(id, "");
    },
  };
}

interface LooseSecretStorage {
  getSecret(id: string): string | null;
  setSecret(id: string, value: string): void;
}

function storageOf(app: App): LooseSecretStorage | null {
  const s = (app as unknown as { secretStorage?: Partial<LooseSecretStorage> | null }).secretStorage;
  return typeof s?.getSecret === "function" && typeof s?.setSecret === "function" ? (s as LooseSecretStorage) : null;
}
