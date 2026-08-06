# paperless-storage — Umsetzungsplan Phase 2

> **Für agentische Bearbeiter:** ERFORDERLICHER SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe
> umzusetzen. Die Schritte nutzen Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Bedienung vervollständigen — Dokumente per Suchmodal einfügen, Titel mit
paperless synchronisieren, Cache-Ordner/Dateiversion/Embed-Höhe einstellbar machen, das
Dokument im ganzen Pane öffnen können (FileView).

**Architektur:** Alle neuen Fähigkeiten sind dünne `src/obsidian/`-Adapter um die in
Phase 1 gebaute Kernlogik (`render-core.ts`, `core/paperless-api.ts`, `core/stub.ts`).
Neue Entscheidungslogik (Kollisions-Dateinamen, Titel-Abgleich, Suchergebnis-Parsing)
entsteht als reine `core/`-Funktion mit vitest-Test; die obsidian-Verdrahtung bleibt wie
in Phase 1 unit-untestbar und wird über die Gesamtabnahme in Aufgabe 21 geprüft (kein
`tests/obsidian/`-Verzeichnis — Präzedenzfall aus Phase 1, `render-core.ts`/`embed.ts`
haben ebenfalls keine dedizierten Unit-Tests).

**Tech-Stack:** wie Phase 1 — TypeScript strict, esbuild, vitest + happy-dom, eslint mit
`eslint-plugin-obsidianmd`, `obsidian-kit` gevendored.

**Vorbedingung:** Phase 1 ist abgeschlossen und committet (`5c86d5b`). Für die Abnahme in
Aufgabe 21 wie in Phase 1 ein laufendes Obsidian mit dem ProtoVault nötig.

**Spec:** `docs/superpowers/specs/2026-08-05-paperless-storage-design.md` §3.6, §8 ·
Herkunft dieser Aufgabenliste: „Nach Phase 1" am Ende von
`docs/superpowers/plans/2026-08-05-paperless-storage-phase-1.md`.

## Umfang dieses Plans

Abgedeckt: Suchmodal zum Einfügen (Punkt 2 der Nach-Phase-1-Liste), FileView im Pane
(Punkt 3), restliche Einstellungen (Punkt 4), Titel-Synchronisation (Punkt 5).

**Nicht abgedeckt** — folgen als eigene Schritte nach diesem Plan, nicht als TDD-Aufgaben
hier: **GUI-Smoke** (Dach-Skill `gui-smoke-setup`) und **Release-Infrastruktur** (Dach-Skill
`plugin-release-setup` + README + MIT-Lizenz, Punkte 6–7). Beides sind geführte
Skill-Workflows, kein Code, den ein TDD-Task-Zuschnitt sinnvoll abbildet.

Der REGISTRY-Eintrag (Punkt 1) ist bereits erledigt (2026-08-06,
`obsidian-plugins/REGISTRY.md` Zeile 181).

## Globale Rahmenbedingungen

Gelten für **jede** Aufgabe dieses Plans zusätzlich zu den in Phase 1 geltenden
(PROF-OBS-03/04/07/12/13, Kit-Vendoring, Commit-Präfixe):

- **PROF-OBS-13, konkret hier relevant:** Kein `el.style.x = "literal"` mit **statischem**
  Literal — der Linter (`noStaticStylesAssignment`) erlaubt dynamische Zuweisungen aus
  einer Variable oder einem Template-Literal mit Ausdruck (z. B.
  `` el.style.height = `${n}px` ``) ausdrücklich, verbietet aber feste Strings.
  Injiziertes `<style>`-Element geht über **`activeDocument`**, nie `document`, und wird
  über eine Abmeldefunktion aufgeräumt (Muster wie `embed.ts`s `unregister`).
- **`app.fileManager.renameFile`**, nicht `app.vault.rename` — laut Spec §3.6, damit
  Obsidian alle Links selbst nachzieht.
- Neue nutzersichtbare Strings gehen in `core/i18n.ts` (EN kanonisch, DE daneben,
  PROF-OBS-07) — keine Strings direkt im obsidian-Layer.
- **`Vault.getAvailablePath` existiert in dieser obsidian-Typings-Version NICHT**
  (geprüft: nur `FileManager.getAvailablePathForAttachment`, async und
  anhangsordner-gebunden — nicht passend). Kollisionsfreie Dateinamen kommen aus der
  selbstgebauten, reinen `uniqueStubPath()` (Aufgabe 11).

---

## Aufgabe 11: `core/stub.ts` erweitern — Dateiname aus Titel, Kollisionsfreiheit

**Dateien:**
- Ändern: `src/core/stub.ts`
- Test: `tests/core/stub.test.ts`

**Interfaces:**
- Liefert: `sanitizeStubFilename(title: string): string` ·
  `uniqueStubPath(folder: string, base: string, existingPaths: ReadonlySet<string>): string`
- Konsumiert von: nichts (reine Funktionen)
- Gebraucht von: Aufgabe 18 (Titel-Sync), Aufgabe 19 (Suchmodal)

- [ ] **Schritt 1: Failing Tests schreiben**

An `tests/core/stub.test.ts` anhängen:

```typescript
import { sanitizeStubFilename, uniqueStubPath } from "../../src/core/stub";

describe("sanitizeStubFilename", () => {
  it("ersetzt in Obsidian verbotene Zeichen", () => {
    expect(sanitizeStubFilename("Rechnung/Telekom: März*2026")).toBe("Rechnung-Telekom- M-rz-2026".replace("M-rz", "März"));
  });
  it("laesst normale Titel unveraendert", () => {
    expect(sanitizeStubFilename("Mietvertrag 2024")).toBe("Mietvertrag 2024");
  });
  it("faellt bei leerem Titel auf Untitled zurueck", () => {
    expect(sanitizeStubFilename("")).toBe("Untitled");
    expect(sanitizeStubFilename("   ")).toBe("Untitled");
  });
  it("kappt sehr lange Titel auf 100 Zeichen", () => {
    expect(sanitizeStubFilename("x".repeat(150)).length).toBe(100);
  });
});

describe("uniqueStubPath", () => {
  it("nutzt den Basisnamen ohne Kollision", () => {
    expect(uniqueStubPath("", "Invoice", new Set())).toBe("Invoice.paperless");
  });
  it("haengt den Ordner voran", () => {
    expect(uniqueStubPath("Docs", "Invoice", new Set())).toBe("Docs/Invoice.paperless");
  });
  it("haengt bei Kollision eine Zaehlnummer an", () => {
    const existing = new Set(["Docs/Invoice.paperless"]);
    expect(uniqueStubPath("Docs", "Invoice", existing)).toBe("Docs/Invoice 2.paperless");
  });
  it("erhoeht die Zaehlnummer bis eine freie Stelle gefunden ist", () => {
    const existing = new Set(["Invoice.paperless", "Invoice 2.paperless"]);
    expect(uniqueStubPath("", "Invoice", existing)).toBe("Invoice 3.paperless");
  });
  it("vertraegt einen Ordnerpfad mit abschlieszendem Schraegstrich", () => {
    expect(uniqueStubPath("Docs/", "Invoice", new Set())).toBe("Docs/Invoice.paperless");
  });
});
```

Der erste Testfall vergleicht gegen einen mit `ä` zusammengesetzten String, weil
dieser Dateiinhalt sonst nicht ASCII-sauber im Plan steht — im echten Test einfach
`"Rechnung-Telekom- März-2026"` direkt als Literal schreiben (die Datei ist UTF-8).

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/stub.test.ts`
Erwartet: FAIL — `sanitizeStubFilename`/`uniqueStubPath` sind nicht exportiert.

- [ ] **Schritt 3: Implementierung in `src/core/stub.ts` ergänzen**

Am Ende der Datei (nach `serializeStub`):

```typescript
/** Ersetzt Zeichen, die Obsidian in Dateinamen nicht erlaubt (`\ / : * ? " < > |`),
 *  durch "-" und kappt auf eine handhabbare Laenge. Ein leerer/reiner Whitespace-Titel
 *  wuerde sonst eine unbenutzbare Datei ("".paperless) erzeugen. */
export function sanitizeStubFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  const base = cleaned === "" ? "Untitled" : cleaned;
  return base.slice(0, 100);
}

/** Findet einen im Vault freien `<base>.paperless`-Pfad, mit " 2", " 3", … bei
 *  Kollision — Vault-Pfade muessen eindeutig sein, `vault.create()` wirft sonst.
 *  Rein: die Kollisionslogik ist ohne Vault-Mock testbar, der Aufrufer liefert die
 *  vorhandenen Pfade (z. B. aus `vault.getFiles().map(f => f.path)`). */
export function uniqueStubPath(
  folder: string,
  base: string,
  existingPaths: ReadonlySet<string>,
): string {
  const dir = folder.replace(/\/+$/, "");
  const prefix = dir === "" ? "" : `${dir}/`;
  let candidate = `${prefix}${base}.paperless`;
  let n = 2;
  while (existingPaths.has(candidate)) {
    candidate = `${prefix}${base} ${n}.paperless`;
    n++;
  }
  return candidate;
}
```

- [ ] **Schritt 4: Tests laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/core/stub.test.ts`
Erwartet: PASS, alle Tests grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/stub.ts tests/core/stub.test.ts
git commit -m "feat: Dateinamen aus Dokumenttitel ableiten, kollisionsfrei"
```

---

## Aufgabe 12: `core/paperless-api.ts` erweitern — Suchergebnisse parsen

**Dateien:**
- Ändern: `src/core/paperless-api.ts`
- Test: `tests/core/paperless-api.test.ts`

**Interfaces:**
- Liefert: `interface DocumentSearchResult { id: number; title: string }` ·
  `parseSearchResults(text: string): DocumentSearchResult[]`
- Gebraucht von: Aufgabe 19 (Suchmodal)

**Antwortform gegen die echte Instanz verifiziert** (paperless-ngx 3.0.5, 2026-08-06,
`GET /api/documents/?query=notes`): `{"count":1,"results":[{"id":1,"title":"notes-to-media",…}],…}`.
`results` ist die maßgebliche Liste, jedes Element trägt mindestens `id` und `title`.

- [ ] **Schritt 1: Failing Test schreiben**

An `tests/core/paperless-api.test.ts` anhängen:

```typescript
import { parseSearchResults } from "../../src/core/paperless-api";

describe("parseSearchResults", () => {
  const body = JSON.stringify({
    count: 2,
    results: [
      { id: 1, title: "notes-to-media", content: "…", tags: [] },
      { id: 7, title: "Mietvertrag 2024", content: "…", tags: [] },
    ],
  });

  it("liest id und title aus jedem Treffer", () => {
    expect(parseSearchResults(body)).toEqual([
      { id: 1, title: "notes-to-media" },
      { id: 7, title: "Mietvertrag 2024" },
    ]);
  });
  it("liefert eine leere Liste ohne Treffer", () => {
    expect(parseSearchResults(JSON.stringify({ count: 0, results: [] }))).toEqual([]);
  });
  it("wirft, wenn 'results' fehlt", () => {
    expect(() => parseSearchResults(JSON.stringify({ count: 0 }))).toThrow();
  });
  it("ueberspringt Eintraege ohne numerische id", () => {
    const bad = JSON.stringify({ results: [{ title: "kaputt" }, { id: 2, title: "ok" }] });
    expect(parseSearchResults(bad)).toEqual([{ id: 2, title: "ok" }]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/paperless-api.test.ts`
Erwartet: FAIL — `parseSearchResults` ist nicht exportiert.

- [ ] **Schritt 3: Implementierung ergänzen**

In `src/core/paperless-api.ts`, nach `parseDocumentMeta`:

```typescript
export interface DocumentSearchResult {
  id: number;
  title: string;
}

export function parseSearchResults(text: string): DocumentSearchResult[] {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unexpected paperless response: not an object");
  }
  const results = (parsed as Record<string, unknown>)["results"];
  if (!Array.isArray(results)) {
    throw new Error("Unexpected paperless response: missing 'results'");
  }
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  return (results as unknown[])
    .filter(isRecord)
    .map((r) => ({
      id: typeof r["id"] === "number" ? r["id"] : null,
      title: typeof r["title"] === "string" ? r["title"] : "",
    }))
    .filter((r): r is DocumentSearchResult => r.id !== null);
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/core/paperless-api.test.ts`
Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/paperless-api.ts tests/core/paperless-api.test.ts
git commit -m "feat: Suchergebnis-Antworten parsen"
```

---

## Aufgabe 13: `core/settings.ts` erweitern — Embed-Höhe

**Dateien:**
- Ändern: `src/core/settings.ts`
- Test: `tests/core/settings.test.ts`

**Interfaces:**
- Ändert: `PaperlessSettings` bekommt `embedHeight: number | null` (`null` = Obsidian-Default)
- Gebraucht von: Aufgabe 16 (Settings-Tab), Aufgabe 17 (Embed-Höhe anwenden)

- [ ] **Schritt 1: Failing Test schreiben**

An `tests/core/settings.test.ts`, im `describe("DEFAULT_SETTINGS", …)`-Block ergänzen:

```typescript
  it("laesst die Embed-Hoehe standardmaeszig auf Obsidian-Default (null)", () => {
    expect(DEFAULT_SETTINGS.embedHeight).toBeNull();
  });
```

Und im `describe("mergeSettings", …)`-Block:

```typescript
  it("uebernimmt eine gesetzte Embed-Hoehe", () => {
    expect(mergeSettings({ embedHeight: 500 }).embedHeight).toBe(500);
  });
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/settings.test.ts`
Erwartet: FAIL — `DEFAULT_SETTINGS.embedHeight` ist `undefined`, nicht `null`.

- [ ] **Schritt 3: `PaperlessSettings` und `DEFAULT_SETTINGS` erweitern**

In `src/core/settings.ts`:

```typescript
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
```

(`mergeSettings` bleibt unverändert — es spreadet bereits alle Felder aus `DEFAULT_SETTINGS`.)

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/core/settings.test.ts`
Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/settings.ts tests/core/settings.test.ts
git commit -m "feat: Embed-Hoehe als Einstellung"
```

---

## Aufgabe 14: `core/title-sync.ts` — Umbenennungsplan berechnen

**Dateien:**
- Anlegen: `src/core/title-sync.ts`
- Test: `tests/core/title-sync.test.ts`

**Interfaces:**
- Konsumiert: `DocumentStub` aus `core/stub.ts`, `DocumentMeta` aus `core/paperless-api.ts`
- Liefert: `interface StubRecord { path: string; stub: DocumentStub }` ·
  `interface RenamePlan { path: string; newTitle: string }` ·
  `planTitleSync(stubs: StubRecord[], metaById: ReadonlyMap<number, DocumentMeta>): RenamePlan[]`
- Gebraucht von: Aufgabe 18

- [ ] **Schritt 1: Failing Test schreiben**

`tests/core/title-sync.test.ts` neu anlegen:

```typescript
import { describe, it, expect } from "vitest";
import { planTitleSync, type StubRecord } from "../../src/core/title-sync";
import type { DocumentMeta } from "../../src/core/paperless-api";

function meta(id: number, title: string): DocumentMeta {
  return { id, title, checksum: "c", created: "2026-01-01" };
}

describe("planTitleSync", () => {
  it("plant eine Umbenennung bei geaendertem Titel", () => {
    const stubs: StubRecord[] = [{ path: "Alt.paperless", stub: { id: 1, title: "Alt" } }];
    const metaById = new Map([[1, meta(1, "Neu")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([{ path: "Alt.paperless", newTitle: "Neu" }]);
  });
  it("plant nichts bei gleichem Titel", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    const metaById = new Map([[1, meta(1, "X")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([]);
  });
  it("ueberspringt Stubs ohne erreichbare Metadaten", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    expect(planTitleSync(stubs, new Map())).toEqual([]);
  });
  it("ueberspringt einen leeren Server-Titel", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    const metaById = new Map([[1, meta(1, "")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([]);
  });
  it("verarbeitet mehrere Stubs unabhaengig", () => {
    const stubs: StubRecord[] = [
      { path: "A.paperless", stub: { id: 1, title: "A" } },
      { path: "B.paperless", stub: { id: 2, title: "B-alt" } },
    ];
    const metaById = new Map([[1, meta(1, "A")], [2, meta(2, "B-neu")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([{ path: "B.paperless", newTitle: "B-neu" }]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/title-sync.test.ts`
Erwartet: FAIL — Modul `src/core/title-sync.ts` existiert nicht.

- [ ] **Schritt 3: `src/core/title-sync.ts` schreiben**

```typescript
// Reiner Entscheidungskern fuer den Befehl "Synchronize document titles": vergleicht
// gespeicherte Stub-Titel mit den aktuellen Servertiteln. Das Umbenennen selbst
// (app.fileManager.renameFile) passiert in der obsidian-Schicht (title-sync-runner.ts).

import type { DocumentStub } from "./stub";
import type { DocumentMeta } from "./paperless-api";

export interface StubRecord {
  path: string;
  stub: DocumentStub;
}

export interface RenamePlan {
  path: string;
  newTitle: string;
}

/** Nur echte Aenderungen kommen in den Plan. Fehlende Metadaten (Dokument nicht
 *  erreichbar/geloescht) sind Aufgabe des 404-Platzhalters (Spec §5), nicht dieses
 *  Befehls — der Stub bleibt dann einfach unangetastet. Ein leerer Server-Titel wird
 *  ebenfalls uebersprungen: er entstuende nur durch eine unerwartete Serverantwort und
 *  soll keinen Stub auf einen leeren Namen umbenennen. */
export function planTitleSync(
  stubs: StubRecord[],
  metaById: ReadonlyMap<number, DocumentMeta>,
): RenamePlan[] {
  const plans: RenamePlan[] = [];
  for (const { path, stub } of stubs) {
    const meta = metaById.get(stub.id);
    if (!meta || meta.title === "") continue;
    if (meta.title !== stub.title) {
      plans.push({ path, newTitle: meta.title });
    }
  }
  return plans;
}
```

- [ ] **Schritt 4: Test laufen lassen, Erfolg bestätigen**

Run: `npx vitest run tests/core/title-sync.test.ts`
Erwartet: PASS.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/title-sync.ts tests/core/title-sync.test.ts
git commit -m "feat: Umbenennungsplan fuer Titel-Synchronisation"
```

---

## Aufgabe 15: `FolderSuggest` aus obsidian-kit vendoren

**Dateien:**
- Ändern: `tools/sync-kit.sh`
- Anlegen (durch das Skript): `src/vendor/kit/folder-suggest.ts`
- Ändern (durch das Skript): `src/vendor/kit/VENDOR.json`

**Interfaces:**
- Liefert: `class FolderSuggest` (aus `obsidian-kit/src/obsidian/folder-suggest.ts`,
  Konstruktor `new FolderSuggest(app: App, textInputEl: HTMLInputElement)`)
- Gebraucht von: Aufgabe 16

Anders als `i18n.ts` liegt `folder-suggest.ts` im Kit unter `src/obsidian/` (obsidian-
gekoppelt) statt `src/pure/` — das bestehende Skript kopiert nur `src/pure/*`. Nötig ist
ein zweiter, expliziter Kopierblock wie er für den Test-Mock schon existiert.

- [ ] **Schritt 1: `tools/sync-kit.sh` erweitern**

Nach dem bestehenden `for m in i18n; do … done`-Block einfügen (vor dem
`cp "$KIT/src/testing/obsidian-mock.ts" …`-Block):

```sh
# obsidian-gekoppelte Kit-Module liegen unter src/obsidian/, nicht src/pure/ —
# eigener Kopierblock je Modul, wie beim Test-Mock unten.
cp "$KIT/src/obsidian/folder-suggest.ts" src/vendor/kit/folder-suggest.ts
stamp src/vendor/kit/folder-suggest.ts "src/obsidian/folder-suggest.ts"
echo "vendored obsidian-kit@$VER/obsidian/folder-suggest.ts -> src/vendor/kit/"
```

Und im abschließenden `VENDOR.json`-Heredoc das Feld `"vendored"` aktualisieren:

```json
  "vendored": "i18n.ts, folder-suggest.ts, ../kit-testing/obsidian-mock.ts",
```

- [ ] **Schritt 2: Skript ausführen**

Run: `sh tools/sync-kit.sh`
Erwartet: drei `vendored …`-Zeilen, darunter die neue für `folder-suggest.ts`.

- [ ] **Schritt 3: Vendor-Header prüfen**

Run: `head -1 src/vendor/kit/folder-suggest.ts`
Erwartet: `// vendored from obsidian-kit@<version>, src/obsidian/folder-suggest.ts — do not hand-edit; re-vendor via tools/sync-kit.sh`

- [ ] **Schritt 4: `check:pure` bewusst NICHT gegen diese Datei laufen lassen**

`src/vendor/kit/` ist laut `scripts/check-pure.mjs` einer der zwei geschützten Wurzeln —
`folder-suggest.ts` importiert `obsidian` und würde das Gate zum Scheitern bringen. Das
ist beabsichtigt für dieses eine Modul (obsidian-gekoppelter Kit-Code, kein Kern-Code);
prüfen, dass `npm run check:pure` trotzdem grün bleibt, weil das Skript nur `.ts`-Dateien
in `src/core` und `src/vendor/kit` scannt, **nicht** nach obsidian-Importen ausschließt.

Run: `npm run check:pure`

Falls das FEHLSCHLÄGT (rot statt der erwarteten grünen Meldung `check:pure OK`): das
Gate ist strenger als hier angenommen (scannt *jede* `.ts`-Datei unter `src/vendor/kit`,
nicht nur die aus `src/pure/`) — dann `folder-suggest.ts` stattdessen direkt unter
`src/obsidian/` vendoren (z. B. `src/obsidian/folder-suggest.ts`, gleicher Stamp-Header)
und Schritt 1 entsprechend anpassen, bevor mit Aufgabe 16 fortgefahren wird.

- [ ] **Schritt 5: Typecheck**

Run: `npm run typecheck`
Erwartet: keine Fehler (die Datei wird noch nirgends importiert, muss also nur isoliert
kompilieren).

- [ ] **Schritt 6: Commit**

```bash
git add tools/sync-kit.sh src/vendor/kit/folder-suggest.ts src/vendor/kit/VENDOR.json
git commit -m "chore: FolderSuggest aus obsidian-kit vendoren"
```

---

## Aufgabe 16: `settings-tab.ts` erweitern + Cache-Ordner ausblenden

**Dateien:**
- Ändern: `src/obsidian/settings-tab.ts`
- Anlegen: `src/obsidian/hide-folder.ts`
- Ändern: `src/obsidian/main.ts`

**Interfaces:**
- Konsumiert: `FolderSuggest` (Aufgabe 15), `PaperlessSettings.embedHeight` (Aufgabe 13),
  `resolveCacheFolder` aus `core/settings.ts` (Phase 1)
- Liefert: `applyCacheFolderVisibility(folder: string, hidden: boolean): void` und
  `removeCacheFolderVisibility(): void` (in `hide-folder.ts`)
- Ändert: `SettingsHost`-Interface bekommt `applyCacheFolderVisibility(): void`

Diese beiden Punkte der Nach-Phase-1-Liste (restliche Einstellungen, Ordner-Ausblenden)
landen als **eine** Aufgabe: `settings-tab.ts` ruft `host.applyCacheFolderVisibility()`
auf, die erst mit der `main.ts`-Verdrahtung existiert — beide Dateien kompilieren nur
gemeinsam, ein Zwischenstand wäre nicht sinnvoll bewertbar.

- [ ] **Schritt 1: `src/obsidian/hide-folder.ts` schreiben**

```typescript
// Blendet den Cache-Ordner im Datei-Explorer per injiziertem <style>-Element aus. Der
// Ordner bleibt ein normaler (nicht Punkt-praefigierter) Vault-Ordner — sonst sieht der
// native PDF-Viewer die Cache-Dateien nicht (cache-store.ts). Nur die ANZEIGE wird
// unterdrueckt, nicht der Ordner selbst.
//
// PROF-OBS-13: activeDocument statt document (popout-sicher), CSS.escape() gegen
// Ordnernamen mit Anfuehrungszeichen o.ae., Cleanup-Pflicht fuer jedes injizierte
// <style>-Element.

let styleEl: HTMLStyleElement | null = null;

export function applyCacheFolderVisibility(folder: string, hidden: boolean): void {
  styleEl?.remove();
  styleEl = null;
  if (!hidden || folder === "") return;
  styleEl = activeDocument.createElement("style");
  styleEl.textContent = `.nav-folder-title[data-path="${CSS.escape(folder)}"] { display: none; }`;
  activeDocument.head.appendChild(styleEl);
}

/** Fuer die Registrierung als Cleanup-Funktion (this.register(...) in main.ts). */
export function removeCacheFolderVisibility(): void {
  styleEl?.remove();
  styleEl = null;
}
```

- [ ] **Schritt 2: `SettingsHost` erweitern und die vier Settings in `settings-tab.ts` ergänzen**

In `src/obsidian/settings-tab.ts`:

```typescript
import { App, PluginSettingTab, Setting, type Plugin } from "obsidian";
import type { FileVersion, PaperlessSettings } from "../core/settings";
import { FolderSuggest } from "../vendor/kit/folder-suggest";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
  /** Wendet den aktuellen hideCacheFolder-Zustand sofort an (kein Neustart nötig). */
  applyCacheFolderVisibility(): void;
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

    new Setting(this.containerEl)
      .setName("Cache folder")
      .setDesc("Vault folder where downloaded PDFs are cached.")
      .addText((text) => {
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

    new Setting(this.containerEl)
      .setName("Hide cache folder")
      .setDesc("Hide the cache folder in the file explorer.")
      .addToggle((toggle) =>
        toggle.setValue(this.host.settings.hideCacheFolder).onChange(async (value) => {
          this.host.settings.hideCacheFolder = value;
          await this.host.saveSettings();
          this.host.applyCacheFolderVisibility();
        }),
      );

    new Setting(this.containerEl)
      .setName("File version")
      .setDesc("Which version of the document to embed and cache.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("archive", "Archive (searchable PDF)")
          .addOption("original", "Original")
          .setValue(this.host.settings.fileVersion)
          .onChange(async (value) => {
            this.host.settings.fileVersion = value as FileVersion;
            await this.host.saveSettings();
          }),
      );

    new Setting(this.containerEl)
      .setName("Default embed height")
      .setDesc("Height in pixels for embedded documents. Leave empty for Obsidian's default.")
      .addText((text) =>
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
}
```

- [ ] **Schritt 3: In `main.ts` verdrahten**

Import ergänzen, `applyCacheFolderVisibility`-Methode auf der Plugin-Klasse hinzufügen und
beim Laden einmal aufrufen:

```typescript
import { getLanguage, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, mergeSettings, resolveCacheFolder, type PaperlessSettings } from "../core/settings";
import { pickLang, setLang } from "../core/i18n";
import { obsidianTransport } from "./http";
import { CacheStore } from "./cache-store";
import { registerPaperlessEmbed } from "./embed";
import { PaperlessSettingTab } from "./settings-tab";
import { applyCacheFolderVisibility, removeCacheFolderVisibility } from "./hide-folder";

export default class PaperlessStoragePlugin extends Plugin {
  settings: PaperlessSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    setLang(pickLang(getLanguage()));

    const cache = new CacheStore(this.app.vault, () => resolveCacheFolder(this.settings));
    const deps = {
      app: this.app,
      transport: obsidianTransport(),
      cache,
      settings: () => this.settings,
    };

    this.addSettingTab(new PaperlessSettingTab(this.app, this));
    this.applyCacheFolderVisibility();
    this.register(removeCacheFolderVisibility);

    const unregister = registerPaperlessEmbed(deps);
    if (unregister) {
      this.register(unregister);
    } else {
      new Notice("Paperless storage: embeds unavailable in this Obsidian version.");
    }

    this.addCommand({
      id: "clear-cache",
      name: "Clear document cache",
      callback: async () => {
        const n = await cache.clear();
        new Notice(`Paperless storage: ${n} cached file(s) removed.`);
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
```

(Die freie Funktion und die Methode heißen bewusst gleich — TypeScript unterscheidet sie
über den Namespace, `this.applyCacheFolderVisibility()` ruft die Methode, die intern die
importierte Funktion aufruft. Falls das im Editor verwirrend ist, spricht nichts dagegen,
die Methode `syncCacheFolderVisibility` zu nennen — dann auch den Aufruf in
`settings-tab.ts` weiter oben entsprechend anpassen.)

- [ ] **Schritt 4: Typecheck**

Run: `npm run typecheck`
Erwartet: keine Fehler.

- [ ] **Schritt 5: Lint**

Run: `npm run lint`
Erwartet: keine Fehler — insbesondere keine `no-static-styles-assignment`-Meldung (das
`<style>`-`textContent` ist kein `.style.x`-Zugriff und fällt nicht unter diese Regel).

- [ ] **Schritt 6: Commit**

```bash
git add src/obsidian/settings-tab.ts src/obsidian/hide-folder.ts src/obsidian/main.ts
git commit -m "feat: restliche Einstellungen und Cache-Ordner-Ausblenden"
```

---

## Aufgabe 17: Embed-Höhe anwenden

**Dateien:**
- Ändern: `src/obsidian/render-core.ts`

**Interfaces:**
- Konsumiert: `PaperlessSettings.embedHeight` (Aufgabe 13)

- [ ] **Schritt 1: Höhe setzen, bevor der PDF-Viewer aufgerufen wird**

In `src/obsidian/render-core.ts`, `renderStub` — direkt nach `containerEl.empty();`:

```typescript
export async function renderStub(
  deps: RenderDeps,
  stubFile: TFile,
  containerEl: HTMLElement,
  parent: Component,
): Promise<void> {
  containerEl.empty();
  const settings = deps.settings();

  // Dynamische Zuweisung aus einer Variablen — vom obsidianmd-Lint ausdruecklich erlaubt
  // (nur STATISCHE style-Literale sind verboten, PROF-OBS-13).
  if (settings.embedHeight !== null) {
    containerEl.style.height = `${settings.embedHeight}px`;
  }

  if (!isConfigured(settings)) {
    message(containerEl, t("notConfigured"));
    return;
  }
  // … Rest der Funktion unveraendert …
```

- [ ] **Schritt 2: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Erwartet: beide grün.

- [ ] **Schritt 3: Bestehende Tests laufen lassen**

Run: `npx vitest run`
Erwartet: weiterhin alle grün — `render-core.ts` hat keine dedizierten Unit-Tests (Phase-1-
Präzedenzfall), diese Änderung darf aber keine der `core/`-Tests brechen.

- [ ] **Schritt 4: Commit**

```bash
git add src/obsidian/render-core.ts
git commit -m "feat: konfigurierbare Embed-Hoehe anwenden"
```

---

## Aufgabe 18: Titel-Synchronisation

**Dateien:**
- Anlegen: `src/obsidian/title-sync-runner.ts`
- Ändern: `src/obsidian/main.ts`

**Interfaces:**
- Konsumiert: `planTitleSync`/`StubRecord` (Aufgabe 14), `sanitizeStubFilename`/
  `uniqueStubPath` (Aufgabe 11), `parseStub`/`serializeStub`/`StubParseError` (Phase 1),
  `documentMetaRequest`/`parseDocumentMeta` (Phase 1)
- Liefert: `runTitleSync(deps: TitleSyncDeps): Promise<void>`, Befehl
  `"Synchronize document titles"`

- [ ] **Schritt 1: `src/obsidian/title-sync-runner.ts` schreiben**

```typescript
// Fuehrt den Befehl "Synchronize document titles" aus: alle .paperless-Stubs im Vault
// lesen, aktuelle Titel vom Server holen, das reine planTitleSync() (core/title-sync.ts)
// entscheiden lassen, dann per app.fileManager.renameFile umbenennen — Obsidian zieht
// darueber alle Links im Vault selbst nach (Spec §3.6).

import { Notice, TFile, type App } from "obsidian";
import { parseStub, serializeStub, sanitizeStubFilename, uniqueStubPath, StubParseError } from "../core/stub";
import { documentMetaRequest, parseDocumentMeta, type DocumentMeta } from "../core/paperless-api";
import { planTitleSync, type StubRecord } from "../core/title-sync";
import { isConfigured, type PaperlessSettings } from "../core/settings";
import { t } from "../core/i18n";
import type { Transport } from "./http";

export interface TitleSyncDeps {
  app: App;
  transport: Transport;
  settings: () => PaperlessSettings;
}

export async function runTitleSync(deps: TitleSyncDeps): Promise<void> {
  const settings = deps.settings();
  if (!isConfigured(settings)) {
    new Notice(t("notConfigured"));
    return;
  }
  const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };

  const files = deps.app.vault.getFiles().filter((f) => f.extension === "paperless");
  const stubs: StubRecord[] = [];
  for (const file of files) {
    try {
      const stub = parseStub(await deps.app.vault.cachedRead(file));
      stubs.push({ path: file.path, stub });
    } catch (e) {
      if (e instanceof StubParseError) continue; // kaputte Stubs bleiben liegen (Spec §5)
      throw e;
    }
  }

  const metaById = new Map<number, DocumentMeta>();
  for (const { stub } of stubs) {
    if (metaById.has(stub.id)) continue;
    try {
      const meta = parseDocumentMeta(await deps.transport.text(documentMetaRequest(cfg, stub.id)));
      metaById.set(stub.id, meta);
    } catch {
      // Nicht erreichbar/geloescht — planTitleSync ueberspringt Stubs ohne Eintrag hier.
    }
  }

  const plans = planTitleSync(stubs, metaById);
  const stubByPath = new Map(stubs.map((s) => [s.path, s.stub]));
  let renamed = 0;

  for (const plan of plans) {
    const file = deps.app.vault.getAbstractFileByPath(plan.path);
    const oldStub = stubByPath.get(plan.path);
    if (!(file instanceof TFile) || !oldStub) continue;

    const dir = plan.path.includes("/") ? plan.path.slice(0, plan.path.lastIndexOf("/")) : "";
    const base = sanitizeStubFilename(plan.newTitle);
    const existingPaths = new Set(
      deps.app.vault.getFiles().map((f) => f.path).filter((p) => p !== plan.path),
    );
    const newPath = uniqueStubPath(dir, base, existingPaths);

    await deps.app.fileManager.renameFile(file, newPath);
    const renamedFile = deps.app.vault.getAbstractFileByPath(newPath);
    if (renamedFile instanceof TFile) {
      await deps.app.vault.modify(renamedFile, serializeStub({ ...oldStub, title: plan.newTitle }));
    }
    renamed++;
  }

  new Notice(`Paperless storage: ${renamed} title(s) synchronized.`);
}
```

- [ ] **Schritt 2: Befehl in `main.ts` registrieren**

In `src/obsidian/main.ts`, Import ergänzen und nach dem `clear-cache`-Befehl:

```typescript
import { runTitleSync } from "./title-sync-runner";
// …
    this.addCommand({
      id: "sync-titles",
      name: "Synchronize document titles",
      callback: () => {
        void runTitleSync(deps);
      },
    });
```

- [ ] **Schritt 3: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Erwartet: beide grün.

- [ ] **Schritt 4: Bestehende Tests laufen lassen**

Run: `npx vitest run`
Erwartet: alle grün (keine neuen Unit-Tests hier — obsidian-Layer, Präzedenzfall Phase 1;
die Entscheidungslogik ist bereits in Aufgabe 14 getestet).

- [ ] **Schritt 5: Commit**

```bash
git add src/obsidian/title-sync-runner.ts src/obsidian/main.ts
git commit -m "feat: Befehl Titel-Synchronisation"
```

---

## Aufgabe 19: Suchmodal zum Einfügen

**Dateien:**
- Anlegen: `src/obsidian/insert-modal.ts`
- Ändern: `src/obsidian/main.ts`

**Interfaces:**
- Konsumiert: `searchRequest` (Phase 1), `parseSearchResults`/`DocumentSearchResult`
  (Aufgabe 12), `sanitizeStubFilename`/`uniqueStubPath` (Aufgabe 11), `serializeStub`/
  `parseStub` (Phase 1)
- Liefert: `class InsertDocumentModal extends SuggestModal<DocumentSearchResult>`,
  Befehl `"Insert document"`

**Bewusste Abweichung vom Stichwort „FuzzySuggestModal" in der Nach-Phase-1-Notiz:**
`FuzzySuggestModal` matcht lokal-fuzzy über eine synchron gelieferte, feste Liste — hier
wird aber serverseitig gegen paperless gesucht (`searchRequest`), das Ergebnis kommt
asynchron und pro Tastenanschlag neu. Das passende native Bauelement ist `SuggestModal`
(UI-STANDARD §2 nennt ausdrücklich „`SuggestModal` / `FuzzySuggestModal`" als das native
Paar für „Auswahl aus Liste" — beide sind zulässig, `SuggestModal` ist hier die korrekte
Wahl).

**Bewusst nicht in dieser Aufgabe:** Filter nach Tag/Korrespondent (Spec §3.6 erwähnt
sie). Reine Titel-/Volltextsuche deckt den Kernfall „Dokument einfügen" ab; Filter-UI
wäre eigener Aufwand ohne Bezug zu den übrigen elf Aufgaben dieses Plans — offener Punkt
für einen dritten Plan, falls die Praxis es verlangt.

- [ ] **Schritt 1: `src/obsidian/insert-modal.ts` schreiben**

```typescript
// Befehl "Insert document": durchsucht paperless serverseitig (SuggestModal, siehe
// Begruendung im Plan gegen die dort zunaechst genannte FuzzySuggestModal), legt bei
// Bedarf einen Stub an (oder findet den vorhandenen fuer dieselbe id wieder) und fuegt
// ![[…]] an der Cursorposition ein.

import { Notice, SuggestModal, TFile, type App, type Editor } from "obsidian";
import { parseStub, serializeStub, sanitizeStubFilename, uniqueStubPath, StubParseError } from "../core/stub";
import { searchRequest, parseSearchResults, type DocumentSearchResult } from "../core/paperless-api";
import { isConfigured, type PaperlessSettings } from "../core/settings";
import { t } from "../core/i18n";
import type { Transport } from "./http";

export interface InsertModalDeps {
  app: App;
  transport: Transport;
  settings: () => PaperlessSettings;
  /** Pfad der Notiz, in die eingefuegt wird — fuer den kollisionsfreien Stub-Ordner und
   *  fuer app.metadataCache.fileToLinktext(). */
  sourcePath: string;
}

export class InsertDocumentModal extends SuggestModal<DocumentSearchResult> {
  constructor(
    private readonly deps: InsertModalDeps,
    private readonly editor: Editor,
  ) {
    super(deps.app);
    this.setPlaceholder("Search paperless documents…");
  }

  async getSuggestions(query: string): Promise<DocumentSearchResult[]> {
    if (query.trim() === "") return [];
    const settings = this.deps.settings();
    const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };
    try {
      const text = await this.deps.transport.text(searchRequest(cfg, query));
      return parseSearchResults(text).slice(0, 20);
    } catch {
      return [];
    }
  }

  renderSuggestion(item: DocumentSearchResult, el: HTMLElement): void {
    el.createDiv({ text: item.title === "" ? `Document ${item.id}` : item.title });
  }

  onChooseSuggestion(item: DocumentSearchResult): void {
    void this.insert(item);
  }

  private async insert(item: DocumentSearchResult): Promise<void> {
    try {
      const file = await this.resolveStubFile(item);
      const linktext = this.deps.app.metadataCache.fileToLinktext(file, this.deps.sourcePath);
      this.editor.replaceSelection(`![[${linktext}]]`);
    } catch (e) {
      new Notice(`Paperless storage: could not insert document (${String(e)}).`);
    }
  }

  private async findExistingStub(id: number): Promise<TFile | null> {
    const candidates = this.deps.app.vault.getFiles().filter((f) => f.extension === "paperless");
    for (const file of candidates) {
      try {
        const stub = parseStub(await this.deps.app.vault.cachedRead(file));
        if (stub.id === id) return file;
      } catch (e) {
        if (e instanceof StubParseError) continue; // fremde/kaputte .paperless-Datei
        throw e;
      }
    }
    return null;
  }

  private async resolveStubFile(item: DocumentSearchResult): Promise<TFile> {
    const existing = await this.findExistingStub(item.id);
    if (existing) return existing;

    const base = sanitizeStubFilename(item.title === "" ? `Document ${item.id}` : item.title);
    const dir = this.deps.sourcePath.includes("/")
      ? this.deps.sourcePath.slice(0, this.deps.sourcePath.lastIndexOf("/"))
      : "";
    const existingPaths = new Set(this.deps.app.vault.getFiles().map((f) => f.path));
    const path = uniqueStubPath(dir, base, existingPaths);
    return await this.deps.app.vault.create(path, serializeStub({ id: item.id, title: item.title }));
  }
}
```

- [ ] **Schritt 2: Befehl in `main.ts` registrieren**

`editorCallback` statt `callback`, da der Befehl einen aktiven Editor braucht:

```typescript
import { InsertDocumentModal } from "./insert-modal";
// …
    this.addCommand({
      id: "insert-document",
      name: "Insert document",
      editorCallback: (editor, ctx) => {
        if (!isConfigured(this.settings)) {
          new Notice(t("notConfigured"));
          return;
        }
        new InsertDocumentModal(
          { app: this.app, transport: deps.transport, settings: () => this.settings, sourcePath: ctx.file?.path ?? "" },
          editor,
        ).open();
      },
    });
```

`isConfigured` und `t` sind bereits importiert bzw. leicht zu ergänzen (`import { isConfigured } from "../core/settings"` steht schon für `resolveCacheFolder` da — `isConfigured` dazuschreiben; `t` aus `../core/i18n` importieren).

- [ ] **Schritt 3: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Erwartet: beide grün.

- [ ] **Schritt 4: Bestehende Tests laufen lassen**

Run: `npx vitest run`
Erwartet: alle grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/obsidian/insert-modal.ts src/obsidian/main.ts
git commit -m "feat: Suchmodal zum Einfuegen von Dokumenten"
```

---

## Aufgabe 20: FileView im Pane

**Dateien:**
- Anlegen: `src/obsidian/file-view.ts`
- Ändern: `src/obsidian/main.ts`

**Interfaces:**
- Konsumiert: `renderStub`/`RenderDeps` aus `render-core.ts` (Phase 1, unverändert)
- Liefert: `VIEW_TYPE_PAPERLESS`, `class PaperlessFileView extends FileView`

**UI-STANDARD §1** verlangt „genau ein `registerView`-Type pro Plugin" — dies ist der
**einzige** `registerView`-Aufruf in diesem Plugin, keine Ausnahme nötig.

**Lifecycle-Falle, die diese Aufgabe bewusst vermeidet:** Übergibt man `this` (die
FileView) direkt als `parent`-Component an `renderStub`, addiert jeder Dateiwechsel im
selben Pane einen weiteren PDF-Viewer-Child, ohne den vorigen abzumelden — der alte Child
wird nie `unload()`-et (Speicherleck, Duplikat-Ressourcen). Lösung: ein pro Ladevorgang
frisches `Component` als Zwischen-Parent, das vor jedem neuen Laden per `removeChild()`
abgemeldet wird — `removeChild` ruft `unload()` auf der ganzen Kette darunter auf. Analoges
Muster: `3d-codeblocks/src/obsidian/file-view.ts` (`teardown()`).

- [ ] **Schritt 1: `src/obsidian/file-view.ts` schreiben**

```typescript
// Oeffnet eine .paperless-Datei im ganzen Pane (Datei-Explorer-Klick statt Embed) — wie
// Obsidians eigener PDF-Viewer. Duenner Adapter um denselben renderStub()-Kern wie
// embed.ts (Kommentar in render-core.ts: "Embed und (spaeter) FileView").

import { Component, FileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { renderStub, type RenderDeps } from "./render-core";

export const VIEW_TYPE_PAPERLESS = "paperless-storage-file-view";

export class PaperlessFileView extends FileView {
  /** Zwischen-Parent fuer den aktuell geladenen PDF-Viewer-Child — siehe Plan-Begruendung
   *  zur Lifecycle-Falle. Ohne dieses Zwischenglied haeuften sich bei jedem Dateiwechsel
   *  im selben Pane nicht abgemeldete Children an. */
  private current: Component | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly deps: RenderDeps,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PAPERLESS;
  }

  getIcon(): string {
    return "file-text";
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Paperless document";
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.teardown();
    const holder = new Component();
    this.addChild(holder);
    this.current = holder;
    await renderStub(this.deps, file, this.contentEl, holder);
  }

  async onUnloadFile(): Promise<void> {
    this.teardown();
    this.contentEl.empty();
  }

  private teardown(): void {
    if (this.current) {
      this.removeChild(this.current);
      this.current = null;
    }
  }
}
```

- [ ] **Schritt 2: In `main.ts` registrieren**

```typescript
import { PaperlessFileView, VIEW_TYPE_PAPERLESS } from "./file-view";
// … nach den anderen nicht-werfenden Registrierungen:
    this.registerView(VIEW_TYPE_PAPERLESS, (leaf) => new PaperlessFileView(leaf, deps));
    try {
      this.registerExtensions(["paperless"], VIEW_TYPE_PAPERLESS);
    } catch (e) {
      console.warn("[paperless-storage] could not claim '.paperless' as a file view:", e);
    }
```

Try/catch, weil `registerExtensions` wirft, falls ein anderes Plugin die Endung schon für
sich beansprucht (PROF-OBS-13) — das Embed über `embedRegistry` bleibt davon unberührt,
beide Registries sind unabhängig (REGISTRY „Vier Wege, denselben Viewer zu zeigen").

- [ ] **Schritt 3: Typecheck + Lint**

Run: `npm run typecheck && npm run lint`
Erwartet: beide grün.

- [ ] **Schritt 4: Bestehende Tests laufen lassen**

Run: `npx vitest run`
Erwartet: alle grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/obsidian/file-view.ts src/obsidian/main.ts
git commit -m "feat: FileView oeffnet .paperless-Dateien im Pane"
```

---

## Aufgabe 21: Gates, Abnahme im echten Obsidian, Abschluss-Commit

**Dateien:**
- Ändern (bei Bedarf, je nach Befund): `docs/superpowers/specs/2026-08-06-spike-ergebnis.md`

**Interfaces:**
- Konsumiert: alles aus Aufgabe 11–21

- [ ] **Schritt 1: Alle Gates laufen lassen**

```bash
npm run check:pure && npm run typecheck && npm run lint && npx vitest run && npm run build
```

Erwartet: alle Schritte grün, `main.js` entsteht.

- [ ] **Schritt 2: Plugin ins Testvault deployen**

Wie in Phase-1-Aufgabe 10 — `main.js`, `manifest.json`, `styles.css` ins ProtoVault unter
`.obsidian/plugins/paperless-storage/` kopieren (oder Symlink, falls in Phase 1 schon
eingerichtet), Obsidian neu laden lassen (Befehl „Reload app without saving" oder
Plugin aus-/einschalten).

- [ ] **Schritt 3: Im echten Obsidian prüfen** *(die eigentliche Abnahme)*

1. Befehl „Insert document" in einer Notiz ausführen, nach einem bekannten Dokument
   suchen, auswählen → `![[…]]` erscheint an der Cursorposition und zeigt das PDF.
2. Denselben Befehl erneut für **dasselbe** Dokument ausführen → es wird der
   vorhandene Stub wiederverwendet (kein zweiter `.paperless`-Stub mit ähnlichem Namen).
3. Eine `.paperless`-Datei im Datei-Explorer anklicken → öffnet sich im ganzen Pane,
   PDF ist sichtbar und scrollbar (nicht nur im Embed).
4. Im selben Pane zu einer **anderen** `.paperless`-Datei wechseln (z. B. über die
   Datei-Explorer-Liste) → das neue PDF erscheint, keine Konsolenfehler, keine
   sichtbaren Reste des vorigen Viewers.
5. In den Einstellungen den Cache-Ordner über die Autovervollständigung ändern → der
   alte Ordner wird im Explorer wieder sichtbar, der neue verschwindet (bei aktivem
   „Hide cache folder"-Toggle).
6. „Hide cache folder" ausschalten → Ordner erscheint sofort wieder, ohne Neustart.
7. Dateiversion auf „Original" umstellen, eine Notiz mit Embed neu laden → das
   Original-PDF wird geladen (am Dateinamen im Cache-Ordner erkennbar: `-original.pdf`-Suffix).
8. Eine Embed-Höhe (z. B. `600`) setzen, betroffene Notiz neu öffnen → der Embed-Container
   hat sichtbar diese Höhe (nicht die vorige Standardhöhe).
9. In paperless den Titel eines Dokuments ändern, dessen Stub im Vault liegt. Befehl
   „Synchronize document titles" ausführen → die Stub-Datei wird umbenannt, bestehende
   `![[…]]`-Links im Vault zeigen weiterhin auf dasselbe Dokument (Obsidian hat sie über
   `renameFile` nachgezogen).
10. Entwicklertools prüfen: keine Fehler in der Konsole nach den obigen Schritten.

- [ ] **Schritt 4: Abnahme protokollieren**

Die zehn Prüfpunkte mit Befund und Datum an
`docs/superpowers/specs/2026-08-06-spike-ergebnis.md` anhängen, neuer Abschnitt
„## Abnahme Phase 2". Bei Abweichungen vom erwarteten Verhalten: hier den tatsächlichen
Befund samt Fix in derselben Sitzung festhalten (Präzedenzfall: Phase-1-Aufgabe-10-Commit
`5c86d5b`, das während der Abnahme selbst noch einen Fix mitbrachte).

- [ ] **Schritt 5: Commit**

```bash
git add -A
git commit -m "feat: Bedienung Phase 2 abgenommen — Suchmodal, FileView, Titel-Sync, Einstellungen"
```

---

## Nach Phase 2

1. **GUI-Smoke** über den Dach-Skill `gui-smoke-setup` — verwandelt die manuelle
   Abnahme aus Aufgabe 21 in einen wiederholbaren CDP-Treiber (`scripts/gui-smoke.ts`).
   Sinnvoll jetzt, weil ab hier alle Bedienpfade existieren, die ein Smoke-Test abdecken
   soll.
2. **Release-Infrastruktur** über den Dach-Skill `plugin-release-setup` +
   `tools/release-template/`, README, MIT-Lizenz (Design-Spec §10). Erst danach ist die
   Store-Einreichung über das Developer Dashboard möglich — der Tag ist nicht das Ende
   (`obsidian-plugins/AGENTS.md` § „Store-Einreichung: der PR-Flow ist tot").
3. Offene Punkte aus dem Design-Spec §11, die bisher unberührt blieben: Verhalten
   mehrerer Vaults gegen dieselbe Instanz, Umgang mit gelöschten Dokumenten
   (Aufräum-Befehl „verwaiste Stubs finden"?), Filter nach Tag/Korrespondent im
   Suchmodal (bewusst aus Aufgabe 19 ausgeklammert).
