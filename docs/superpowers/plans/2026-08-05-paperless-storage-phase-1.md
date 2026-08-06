# paperless-storage — Umsetzungsplan Phase 1

> **Für agentische Bearbeiter:** ERFORDERLICHER SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe
> umzusetzen. Die Schritte nutzen Checkbox-Syntax (`- [ ]`) zur Nachverfolgung.

**Ziel:** Ein `![[Dokument.paperless]]` in einer Notiz zeigt das PDF aus einer
paperless-ngx-Instanz inline an — geladen per API-Token, lokal zwischengespeichert,
gerendert von Obsidians eigenem PDF-Viewer.

**Architektur:** Eine Stub-Datei (`.paperless`, ~150 Byte JSON mit der Dokument-ID) ist
für Obsidian eine echte Datei und trägt damit die volle Wikilink-Semantik. Ein Adapter an
der inoffiziellen `app.embedRegistry`-API rendert sie: Bytes kommen per `requestUrl` mit
`Authorization: Token …` von der Instanz, landen im konfigurierbaren Cache-Ordner und
werden von Obsidians vorhandenem PDF-Embed angezeigt — wir bauen keinen PDF-Renderer.
`src/core/` bleibt frei von obsidian-Imports und ist in Node testbar.

**Tech-Stack:** TypeScript (strict, ES2020, `moduleResolution: bundler`) · esbuild → `main.js` ·
vitest + happy-dom · eslint mit `eslint-plugin-obsidianmd` · `obsidian-kit` **gevendored**
(nicht als npm-Dependency)

**Vorbedingung:** Eine erreichbare paperless-ngx-Instanz (≥ 3.0) mit API-Token und
mindestens einem Dokument. Für Aufgabe 8 sind `PAPERLESS_URL` und `PAPERLESS_TOKEN` als
Umgebungsvariablen nötig.

**Spec:** `docs/superpowers/specs/2026-08-05-paperless-storage-design.md`

## Umfang dieses Plans

Phase 1 endet an einem klaren Meilenstein: **ein PDF erscheint im Embed.** Nicht enthalten
und einem zweiten Plan vorbehalten: Suchmodal zum Einfügen, FileView im Pane,
Titel-Synchronisation, Ordner-Ausblenden, Release-Infrastruktur, README.

## Globale Rahmenbedingungen

Diese gelten für **jede** Aufgabe, ohne dass sie dort wiederholt werden:

- **PROF-OBS-03/04** — `src/core/` und `src/vendor/kit/` enthalten **keine** obsidian-Importe.
  Das Gate `npm run check:pure` erzwingt es.
- **PROF-OBS-12** — Jeder Netz-Call über einen **injizierten** Transport mit `requestUrl`.
  **Nie** globales `fetch`, nie `await r.json()` (stattdessen `JSON.parse(res.text)`),
  kein `eval`/`new Function`.
- **PROF-OBS-13** — Kein `innerHTML`/`outerHTML`-Write (`el.empty()`, `createEl()`),
  keine JS-Styles (CSS-Klassen statt `el.style.x`), popout-sicher (`activeDocument`/
  `activeWindow` statt `document`/`window`), `registerExtensions` in `try/catch` + `Notice`,
  kein Leaf-Detach in `onunload`.
- **PROF-OBS-07** — Nutzersichtbare Strings über `t()`, **EN kanonisch**, DE daneben.
  Keine i18n-Library.
- **Kit wird gevendored**, nie als npm-Dependency eingebunden: eine git-Dependency auf
  `git.jkaindl.de` könnten weder Store-Nutzer noch die GitHub-CI auflösen.
- **Kit-Version 0.23.0** (`obsidian-kit`, aktueller Stand).
- **Sprache im Repo:** Prosa und Kommentare Deutsch, nutzersichtbare Strings Englisch.
- **Commits** nach jedem Task-Ende, Conventional-Commits-Präfix (`feat:`, `test:`, `chore:`, `docs:`).

---

## Aufgabe 1: Repo-Fundament und Toolchain

**Dateien:**
- Anlegen: `package.json`, `tsconfig.json`, `vitest.config.ts`, `esbuild.config.mjs`,
  `manifest.json`, `.gitignore`, `eslint.config.mjs`
- Anlegen: `scripts/check-pure.mjs`, `tools/sync-kit.sh`
- Anlegen: `src/obsidian/main.ts`, `tests/__mocks__/obsidian.ts`
- Anlegen: `src/vendor/kit/` (gevendorte pure Kit-Module)

**Schnittstellen:**
- Liefert: Ein ladendes Obsidian-Plugin mit grünem `npm run typecheck && npm test && npm run check:pure`.
  Alle folgenden Aufgaben setzen diese Skripte voraus.

- [ ] **Schritt 1: `package.json` anlegen**

```json
{
  "name": "paperless-storage",
  "version": "0.1.0",
  "description": "Embed documents from your paperless-ngx instance directly in your notes.",
  "keywords": ["obsidian", "obsidian-plugin", "paperless", "paperless-ngx", "pdf", "documents"],
  "type": "module",
  "scripts": {
    "build": "node esbuild.config.mjs --production",
    "dev": "node esbuild.config.mjs",
    "check:pure": "node scripts/check-pure.mjs",
    "test": "npm run check:pure && vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "eslint": "^9.39.4",
    "eslint-plugin-obsidianmd": "^0.3.0",
    "happy-dom": "^14.0.0",
    "obsidian": "^1.5.0",
    "typescript": "^5.4.0",
    "typescript-eslint": "^8.61.1",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Schritt 2: `tsconfig.json` anlegen**

```json
{
  "compilerOptions": {
    "target": "ES2020", "module": "ESNext", "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"], "strict": true, "esModuleInterop": true,
    "skipLibCheck": true, "isolatedModules": true, "noImplicitAny": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Schritt 3: `vitest.config.ts` anlegen**

`pool: "forks"` ist nicht optional — mit dem vitest-1.6-Default `threads` crasht der
CJS-Preparser unter Nebenläufigkeit, sobald der obsidian-Mock aus dem Kit re-exportiert
(gemessen in `image-to-markdown`: threads 4/30 Crashes, forks 0/30).

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    pool: "forks",
  },
  resolve: { alias: { obsidian: path.resolve(__dirname, "./tests/__mocks__/obsidian.ts") } },
});
```

- [ ] **Schritt 4: `esbuild.config.mjs` anlegen**

```javascript
// Build → main.js. obsidian/electron stellt der Host bereit und sind deshalb extern.
import esbuild from "esbuild";

const prod = process.argv.includes("--production");

const ctx = await esbuild.context({
  entryPoints: ["src/obsidian/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "node:*"],
  format: "cjs",
  target: "es2022",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  outfile: "main.js",
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log("esbuild: watching…");
}
```

- [ ] **Schritt 5: `manifest.json` anlegen**

`isDesktopOnly` steht vorerst auf `true` — ob `embedRegistry` und der native PDF-Viewer
auf Mobile tragen, misst Aufgabe 2. Ein Plugin, das auf Mobile still nichts tut, ist ein
Review-Risiko; der Wert wird nach dem Spike korrigiert, nicht vorher geraten.

```json
{
  "id": "paperless-storage",
  "name": "Paperless Storage",
  "version": "0.1.0",
  "minAppVersion": "1.8.7",
  "description": "Embed documents from your paperless-ngx instance directly in your notes.",
  "author": "Johannes Kaindl",
  "authorUrl": "https://jkaindl.de",
  "helpUrl": "https://git.jkaindl.de/jkaindl/paperless-storage",
  "isDesktopOnly": true
}
```

- [ ] **Schritt 6: `.gitignore` anlegen**

```
node_modules/
main.js
data.json
*.log
.DS_Store
```

- [ ] **Schritt 7: `scripts/check-pure.mjs` anlegen**

Bewusst ein Script und kein grep-Einzeiler in `package.json`: Der Einzeiler erfasst nur
einen Quote-Stil und liefert bei fehlendem Verzeichnis exit 2, das `!` dreht das zu
„bestanden". Beides macht das Gate blind.

```javascript
// `src/core/` und der gevendorte Kit-Code muessen frei von obsidian-Importen bleiben —
// das ist die Zusicherung, dass die Rechenlogik in Node/vitest testbar ist.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/core", "src/vendor/kit"];
const FORBIDDEN = /(?:from|import)\s*\(?\s*["']obsidian(\/[^"']*)?["']/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = ROOTS.flatMap(walk)
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")));

if (offenders.length > 0) {
  console.error("check:pure FAILED — obsidian-Import in reinem Code:");
  for (const f of offenders) console.error("  " + f);
  process.exit(1);
}
console.log("check:pure OK");
```

- [ ] **Schritt 8: Gegenprobe des Gates — in beiden Quote-Stilen**

Ein Gate, das nie rot wird, ist keins. Diese Gegenprobe ist Teil des Schrittes, nicht
optional.

```bash
mkdir -p src/core
printf 'import { App } from "obsidian";\nexport const a = 1;\n' > src/core/_probe.ts
node scripts/check-pure.mjs; echo "exit=$? (erwartet: 1)"
printf "import { App } from 'obsidian';\nexport const a = 1;\n" > src/core/_probe.ts
node scripts/check-pure.mjs; echo "exit=$? (erwartet: 1)"
rm src/core/_probe.ts
node scripts/check-pure.mjs; echo "exit=$? (erwartet: 0)"
```

Erwartung: zweimal `exit=1` mit genannter Fundstelle, dann `exit=0`.

- [ ] **Schritt 9: Kit vendoren — `tools/sync-kit.sh` anlegen**

```sh
#!/bin/sh
# Vendort die benoetigten obsidian-kit-Module. Nach Kit-Updates erneut ausfuehren.
# Der Header entsteht erst beim Vendoring — ein blankes `cp` verliert ihn still.
set -e

KIT=../obsidian-kit
VER=$(node -p "require('$KIT/package.json').version")
SHA=$(git -C "$KIT" rev-parse --short HEAD)

mkdir -p src/vendor/kit src/vendor/kit-obsidian

stamp() { # stamp <vendored-file> <kit-relative-path>
  header="// vendored from obsidian-kit@$VER, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

for m in i18n; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts → src/vendor/kit/$m.ts"
done

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "i18n.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. endpoint_config bewusst NICHT vendored: sein authHeaders() erzeugt 'Bearer', paperless braucht 'Token'."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
```

**Warum `endpoint_config` trotz Spec §8 nicht mitkommt:** Sein `authHeaders()` erzeugt
`Authorization: Bearer <key>` — paperless verlangt `Token <key>`. Außerdem modelliert es
eine priorisierte Endpunkt-**Liste** mit Modellwahl (für LLM-Failover); paperless hat
genau einen Server. Der Nutzen wäre negativ. Die Spec ist an dieser Stelle korrigiert.

Ausführen:

```bash
chmod +x tools/sync-kit.sh && ./tools/sync-kit.sh
```

- [ ] **Schritt 10: `tests/__mocks__/obsidian.ts` anlegen**

```typescript
export * from "../../src/vendor/kit-testing/obsidian-mock";
```

Dazu den Test-Mock vendoren:

```bash
mkdir -p src/vendor/kit-testing
cp ../obsidian-kit/src/testing/obsidian-mock.ts src/vendor/kit-testing/
```

- [ ] **Schritt 11: Minimales `src/obsidian/main.ts` anlegen**

```typescript
import { Plugin } from "obsidian";

export default class PaperlessStoragePlugin extends Plugin {
  async onload(): Promise<void> {
    console.log("paperless-storage loaded");
  }
}
```

- [ ] **Schritt 12: Installieren und alle Gates laufen lassen**

```bash
npm install
npm run typecheck && npm run check:pure && npm run build
```

Erwartung: alle drei ohne Fehler, `main.js` entsteht.

- [ ] **Schritt 13: Commit**

```bash
git add -A
git commit -m "chore: Repo-Fundament, Toolchain und Kit-Vendoring"
```

---

## Aufgabe 2: Spike — trägt die Kernannahme? **(Gate)**

Diese Aufgabe schreibt **keinen** Produktionscode. Sie beantwortet die eine Frage, an der
das ganze Design hängt:

> Lässt sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter heraus auf
> eine beliebige Datei im Vault ansetzen?

**Fällt der Spike negativ aus, wird der Plan ab Aufgabe 9 neu geschrieben** — dann kommt
gebündeltes pdf.js (~1 MB) oder der Codeblock-Weg. Deshalb steht der Spike vor allem
anderen und nicht mittendrin.

**Dateien:**
- Ändern: `src/obsidian/main.ts` (temporär, wird in Aufgabe 10 ersetzt)
- Anlegen: `docs/superpowers/specs/2026-08-06-spike-ergebnis.md`

- [ ] **Schritt 1: Testvault vorbereiten**

Ein beliebiger Vault mit einer PDF-Datei unter `_probe/muster.pdf` und einer Notiz, die
`![[probe.paperless]]` enthält. Dazu eine leere Datei `probe.paperless` im selben Ordner.

- [ ] **Schritt 2: Spike-Code in `src/obsidian/main.ts` schreiben**

Der Kern der Messung: Obsidian registriert für `pdf` selbst einen Embed-Creator. Wenn wir
den abgreifen und mit einer anderen `TFile` aufrufen können, ist die Annahme belegt.

```typescript
import { Notice, Plugin, TFile, MarkdownRenderer, Component } from "obsidian";

interface EmbedContext {
  app: unknown;
  containerEl: HTMLElement;
  linktext?: string;
  sourcePath?: string;
}
type EmbedCreator = (ctx: EmbedContext, file: TFile, subpath?: string) => { loadFile(): void };
interface EmbedRegistry {
  embedByExtension?: Record<string, EmbedCreator>;
  registerExtension(ext: string, creator: EmbedCreator): void;
  unregisterExtension(ext: string): void;
}

export default class SpikePlugin extends Plugin {
  async onload(): Promise<void> {
    const registry = (this.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;

    // MESSUNG 1: Existiert die Registry und kennt sie einen PDF-Creator?
    console.log("[spike] embedRegistry vorhanden:", !!registry);
    console.log("[spike] pdf-Creator vorhanden:", !!registry?.embedByExtension?.["pdf"]);

    if (!registry) {
      new Notice("[spike] embedRegistry fehlt — Weg A ausgeschlossen");
      return;
    }

    registry.registerExtension("paperless", (ctx, _file) => ({
      loadFile: () => {
        void this.render(ctx);
      },
    }));
    this.register(() => registry.unregisterExtension("paperless"));
  }

  private async render(ctx: EmbedContext): Promise<void> {
    const target = this.app.vault.getAbstractFileByPath("_probe/muster.pdf");
    if (!(target instanceof TFile)) {
      console.log("[spike] Testdatei _probe/muster.pdf nicht gefunden");
      return;
    }

    // WEG A: Obsidians eigenen PDF-Creator mit unserer Datei aufrufen.
    const registry = (this.app as unknown as { embedRegistry: EmbedRegistry }).embedRegistry;
    const pdfCreator = registry.embedByExtension?.["pdf"];
    if (pdfCreator) {
      try {
        const child = pdfCreator({ ...ctx, linktext: target.path }, target);
        child.loadFile();
        console.log("[spike] WEG A: Creator lief ohne Wurf");
      } catch (e) {
        console.log("[spike] WEG A gescheitert:", e);
      }
    }

    // WEG B: MarkdownRenderer das Embed selbst bauen lassen.
    const fallback = ctx.containerEl.createDiv();
    try {
      await MarkdownRenderer.render(
        this.app,
        `![[${target.path}]]`,
        fallback,
        ctx.sourcePath ?? "",
        new Component(),
      );
      console.log("[spike] WEG B: gerendert, Kind-Elemente:", fallback.childElementCount);
    } catch (e) {
      console.log("[spike] WEG B gescheitert:", e);
    }
  }
}
```

- [ ] **Schritt 3: Bauen, ins Testvault deployen, Obsidian neu laden**

```bash
npm run build
cp main.js manifest.json "$OBSIDIAN_PLUGIN_DIR/paperless-storage/"
```

- [ ] **Schritt 4: Messen und protokollieren**

Notiz mit `![[probe.paperless]]` öffnen, Entwicklertools (`Cmd+Opt+I`) öffnen und für
**beide** Wege festhalten:

1. Erscheint sichtbar ein PDF im Embed?
2. Lässt es sich **scrollen**? (Das ist die eigentliche Anforderung — ein statisches
   erstes Seitenbild genügt nicht.)
3. Funktioniert Zoom bzw. Seitennavigation?
4. Wirft die Konsole Fehler?
5. Was passiert beim Schließen der Notiz — bleiben Elemente oder Listener zurück?

- [ ] **Schritt 5: Gegenprobe Mobile**

Falls ein iPad oder iPhone mit Obsidian verfügbar ist: dasselbe dort prüfen. Ergebnis
entscheidet `isDesktopOnly` im Manifest. Ist kein Gerät verfügbar, wird das ausdrücklich
als „ungemessen" protokolliert und `isDesktopOnly: true` bleibt stehen — eine Vermutung
wird nicht als Messung ausgegeben.

- [ ] **Schritt 6: Ergebnis in `docs/superpowers/specs/2026-08-06-spike-ergebnis.md` festhalten**

Struktur: Frage · Vorgehen · Befund pro Weg (A/B/Mobile) mit Konsolenausgabe im Wortlaut ·
Entscheidung · Datum. Ohne diese Datei ist der Spike wertlos, weil das Ergebnis in einer
Sitzung verschwindet.

- [ ] **Schritt 7: Entscheidung fällen**

| Befund | Konsequenz |
|---|---|
| Weg A trägt (scrollbar) | Plan gilt. Aufgabe 10 nutzt Weg A. |
| Nur Weg B trägt | Plan gilt, Aufgabe 10 nutzt `MarkdownRenderer`. Dann in Aufgabe 10 zusätzlich Lifecycle prüfen: die `Component` muss ein Kind des Embeds sein, sonst leakt sie. |
| Keiner trägt | **Stopp.** Plan ab Aufgabe 9 neu schreiben, Optionen: pdf.js bündeln oder Codeblock-Weg (Spec §4). |

- [ ] **Schritt 8: Commit**

```bash
git add -A
git commit -m "docs: Spike-Ergebnis zur PDF-Anzeige im Embed"
```

---

## Aufgabe 3: `core/errors.ts` — Transportfehler mit Status und Rohbody

**Dateien:**
- Anlegen: `src/core/errors.ts`
- Test: `tests/core/errors.test.ts`

**Schnittstellen:**
- Liefert: `class PaperlessHttpError extends Error { status: number; body: string }` ·
  `extractErrorMessage(body: string): string | null` · `describeHttpError(err: PaperlessHttpError): string`

Aus der REGISTRY übernommen: Wer den Response-Body verwirft und nur
`Error("HTTP 401")` wirft, zwingt die Anzeigeschicht zum Raten — in `vault-rag` erschien
ein 401 dadurch als „nicht erreichbar (lokal/VPN)" und war nicht diagnostizierbar. Vier
Quellen sind zu prüfen: `error.message`, `error`, `message`, `detail` (letzteres ist die
FastAPI-Form und fehlte im ersten Exemplar).

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { PaperlessHttpError, extractErrorMessage, describeHttpError } from "../../src/core/errors";

describe("extractErrorMessage", () => {
  it("liest error.message", () => {
    expect(extractErrorMessage('{"error":{"message":"kaputt"}}')).toBe("kaputt");
  });
  it("liest error als String", () => {
    expect(extractErrorMessage('{"error":"kaputt"}')).toBe("kaputt");
  });
  it("liest message", () => {
    expect(extractErrorMessage('{"message":"kaputt"}')).toBe("kaputt");
  });
  it("liest detail (DRF/FastAPI-Form)", () => {
    expect(extractErrorMessage('{"detail":"Invalid token."}')).toBe("Invalid token.");
  });
  it("gibt null bei unlesbarem Body", () => {
    expect(extractErrorMessage("<html>502</html>")).toBeNull();
    expect(extractErrorMessage("")).toBeNull();
  });
  it("bevorzugt error.message vor detail", () => {
    expect(extractErrorMessage('{"error":{"message":"a"},"detail":"b"}')).toBe("a");
  });
});

describe("PaperlessHttpError", () => {
  it("traegt Status und Rohbody", () => {
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(err.status).toBe(401);
    expect(err.body).toBe('{"detail":"Invalid token."}');
    expect(err).toBeInstanceOf(Error);
  });
  it("describeHttpError nennt Status und Servermeldung", () => {
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(describeHttpError(err)).toContain("401");
    expect(describeHttpError(err)).toContain("Invalid token.");
  });
  it("describeHttpError faellt ohne lesbaren Body auf den Status zurueck", () => {
    expect(describeHttpError(new PaperlessHttpError(502, "<html>"))).toContain("502");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/core/errors.test.ts`
Erwartung: FAIL — Modul `src/core/errors` existiert nicht.

- [ ] **Schritt 3: Implementieren**

```typescript
// Transportfehler tragen Status UND Rohbody. Wer den Body verwirft, zwingt die
// Anzeigeschicht zum Raten — ein 401 sah in vault-rag dadurch aus wie „Server nicht
// erreichbar" und war nicht diagnostizierbar.

export class PaperlessHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Paperless HTTP ${status}`);
    this.name = "PaperlessHttpError";
  }
}

/** Vier Quellen, in dieser Reihenfolge: error.message, error, message, detail. */
export function extractErrorMessage(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const err = obj["error"];
  if (typeof err === "object" && err !== null) {
    const msg = (err as Record<string, unknown>)["message"];
    if (typeof msg === "string" && msg) return msg;
  }
  if (typeof err === "string" && err) return err;
  for (const key of ["message", "detail"]) {
    const v = obj[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export function describeHttpError(err: PaperlessHttpError): string {
  const detail = extractErrorMessage(err.body);
  return detail ? `HTTP ${err.status}: ${detail}` : `HTTP ${err.status}`;
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Ausführen: `npx vitest run tests/core/errors.test.ts`
Erwartung: PASS, 9 Tests.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/errors.ts tests/core/errors.test.ts
git commit -m "feat: Transportfehler mit Status und Rohbody"
```

---

## Aufgabe 4: `core/stub.ts` — Stub-Format

**Dateien:**
- Anlegen: `src/core/stub.ts`
- Test: `tests/core/stub.test.ts`

**Schnittstellen:**
- Liefert: `interface DocumentStub { id: number; title: string; checksum?: string; added?: string }` ·
  `parseStub(text: string): DocumentStub` (wirft `StubParseError`) ·
  `serializeStub(stub: DocumentStub): string` · `class StubParseError extends Error`

Maßgeblich ist allein `id`. `title` und `checksum` sind Anzeige- und Invalidierungs-Cache.

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { parseStub, serializeStub, StubParseError } from "../../src/core/stub";

describe("parseStub", () => {
  it("liest id und title", () => {
    const s = parseStub('{"id":42,"title":"Mietvertrag 2024"}');
    expect(s.id).toBe(42);
    expect(s.title).toBe("Mietvertrag 2024");
  });
  it("liest optionale Felder", () => {
    const s = parseStub('{"id":1,"title":"x","checksum":"abc","added":"2026-08-05"}');
    expect(s.checksum).toBe("abc");
    expect(s.added).toBe("2026-08-05");
  });
  it("wirft bei fehlender id", () => {
    expect(() => parseStub('{"title":"x"}')).toThrow(StubParseError);
  });
  it("wirft bei nicht-numerischer id", () => {
    expect(() => parseStub('{"id":"42","title":"x"}')).toThrow(StubParseError);
  });
  it("wirft bei kaputtem JSON", () => {
    expect(() => parseStub("nicht json")).toThrow(StubParseError);
  });
  it("wirft bei leerem Text", () => {
    expect(() => parseStub("")).toThrow(StubParseError);
  });
  it("faellt auf leeren title zurueck, wenn er fehlt", () => {
    expect(parseStub('{"id":7}').title).toBe("");
  });
});

describe("serializeStub", () => {
  it("erzeugt wieder parsebares JSON", () => {
    const stub = { id: 42, title: "Mietvertrag 2024", checksum: "abc" };
    expect(parseStub(serializeStub(stub))).toEqual(stub);
  });
  it("endet mit Zeilenumbruch", () => {
    expect(serializeStub({ id: 1, title: "x" }).endsWith("\n")).toBe(true);
  });
  it("laesst undefinierte Felder weg", () => {
    expect(serializeStub({ id: 1, title: "x" })).not.toContain("checksum");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/core/stub.test.ts`
Erwartung: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```typescript
// Der Stub ist die Datei, die im Vault liegt: `<Titel>.paperless`. Fuer Obsidian ist er
// eine echte Datei und traegt damit Backlinks, Graph und Autovervollstaendigung.
// Maszgeblich ist allein `id` — `title` und `checksum` sind Anzeige- und
// Invalidierungs-Cache und duerfen vom Server abweichen.

export interface DocumentStub {
  id: number;
  title: string;
  checksum?: string;
  added?: string;
}

export class StubParseError extends Error {
  constructor(reason: string) {
    super(`Invalid .paperless stub: ${reason}`);
    this.name = "StubParseError";
  }
}

export function parseStub(text: string): DocumentStub {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StubParseError("not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null) throw new StubParseError("not an object");

  const obj = parsed as Record<string, unknown>;
  const id = obj["id"];
  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw new StubParseError("missing or non-integer 'id'");
  }

  const stub: DocumentStub = { id, title: typeof obj["title"] === "string" ? obj["title"] : "" };
  if (typeof obj["checksum"] === "string") stub.checksum = obj["checksum"];
  if (typeof obj["added"] === "string") stub.added = obj["added"];
  return stub;
}

export function serializeStub(stub: DocumentStub): string {
  const out: Record<string, unknown> = { id: stub.id, title: stub.title };
  if (stub.checksum !== undefined) out["checksum"] = stub.checksum;
  if (stub.added !== undefined) out["added"] = stub.added;
  return JSON.stringify(out, null, 2) + "\n";
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Ausführen: `npx vitest run tests/core/stub.test.ts`
Erwartung: PASS, 10 Tests.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/stub.ts tests/core/stub.test.ts
git commit -m "feat: Stub-Format lesen und schreiben"
```

---

## Aufgabe 5: `core/settings.ts` und `core/i18n.ts`

**Dateien:**
- Anlegen: `src/core/settings.ts`, `src/core/i18n.ts`
- Test: `tests/core/settings.test.ts`

**Schnittstellen:**
- Liefert: `interface PaperlessSettings` · `DEFAULT_SETTINGS` · `mergeSettings(raw: unknown): PaperlessSettings` ·
  `isConfigured(s: PaperlessSettings): boolean` · `resolveCacheFolder(s: PaperlessSettings): string`
- Liefert: `t(key, ...args)` aus `src/core/i18n.ts`

Der Cache-Ordner folgt dem `vim-dojo`-Muster (`missionFolder: '_neurovim/'`): Unterstrich
im Vault-Root, konfigurierbar, **leere Eingabe fällt auf den Default zurück** statt Dateien
im Vault-Root zu materialisieren.

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```typescript
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
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/core/settings.test.ts`
Erwartung: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: `src/core/settings.ts` implementieren**

```typescript
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
}

export const DEFAULT_SETTINGS: PaperlessSettings = {
  serverUrl: "",
  apiToken: "",
  cacheFolder: "_paperless-storage/",
  hideCacheFolder: true,
  fileVersion: "archive",
};

export function mergeSettings(raw: unknown): PaperlessSettings {
  const partial = (raw ?? {}) as Partial<PaperlessSettings>;
  return { ...DEFAULT_SETTINGS, ...partial };
}

/** Normalisierter Ordner ohne fuehrende/abschlieszende Schraegstriche. */
export function resolveCacheFolder(settings: PaperlessSettings): string {
  const raw = settings.cacheFolder.trim();
  const chosen = raw === "" ? DEFAULT_SETTINGS.cacheFolder : raw;
  return chosen.replace(/^\/+|\/+$/g, "");
}

export function isConfigured(settings: PaperlessSettings): boolean {
  return settings.serverUrl.trim() !== "" && settings.apiToken.trim() !== "";
}
```

- [ ] **Schritt 4: `src/core/i18n.ts` implementieren**

EN ist kanonisch, DE steht daneben (PROF-OBS-07). Die Sprachdetektion lebt in der
obsidian-Schicht und setzt die Sprache einmalig beim `onload` — nicht hier.

Signatur gegen `obsidian-kit@0.23.0` verifiziert: `defineStrings(dicts): void` registriert
global, `t`/`setLang`/`getLang`/`pickLang` sind eigene Exporte. `t` ersetzt `{0}`, `{1}`…
aus den Argumenten, Fallback ist `aktuelle Sprache → en → key`.

```typescript
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
```

- [ ] **Schritt 5: Tests laufen lassen**

Ausführen: `npx vitest run tests/core/settings.test.ts && npm run check:pure`
Erwartung: PASS, 14 Tests; `check:pure OK`.

- [ ] **Schritt 6: Commit**

```bash
git add src/core/settings.ts src/core/i18n.ts tests/core/settings.test.ts
git commit -m "feat: Einstellungen mit Default-Cache-Ordner und i18n-Strings"
```

---

## Aufgabe 6: `core/paperless-api.ts` — Requests beschreiben, Antworten lesen

**Dateien:**
- Anlegen: `src/core/paperless-api.ts`
- Test: `tests/core/paperless-api.test.ts`

**Schnittstellen:**
- Liefert: `interface RequestSpec { url: string; headers: Record<string, string> }` ·
  `documentMetaRequest(cfg, id)` · `documentFileRequest(cfg, id, version)` ·
  `searchRequest(cfg, query)` · `parseDocumentMeta(text): DocumentMeta` ·
  `interface DocumentMeta { id: number; title: string; checksum: string; created: string }` ·
  `interface ApiConfig { serverUrl: string; apiToken: string }`

Dieses Modul führt **keine** Requests aus — es beschreibt sie nur. Dadurch bleibt es rein
und in Node testbar; das Ausführen übernimmt der injizierte Transport aus Aufgabe 8.
Routen gegen die laufende Instanz verifiziert (`documents/views.py`: `preview`, `thumb`,
`download`, `metadata` als Actions am DocumentViewSet).

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import {
  documentMetaRequest, documentFileRequest, searchRequest, parseDocumentMeta,
} from "../../src/core/paperless-api";

const cfg = { serverUrl: "https://paperless.example.org", apiToken: "geheim" };

describe("Request-Bau", () => {
  it("baut die Metadaten-URL", () => {
    expect(documentMetaRequest(cfg, 42).url)
      .toBe("https://paperless.example.org/api/documents/42/");
  });
  it("setzt den Token-Header", () => {
    expect(documentMetaRequest(cfg, 42).headers["Authorization"]).toBe("Token geheim");
  });
  it("vertraegt einen abschlieszenden Schraegstrich in der Server-URL", () => {
    expect(documentMetaRequest({ ...cfg, serverUrl: "https://x.tld/" }, 7).url)
      .toBe("https://x.tld/api/documents/7/");
  });
  it("baut die Archiv-URL", () => {
    expect(documentFileRequest(cfg, 42, "archive").url)
      .toBe("https://paperless.example.org/api/documents/42/preview/");
  });
  it("baut die Original-URL", () => {
    expect(documentFileRequest(cfg, 42, "original").url)
      .toBe("https://paperless.example.org/api/documents/42/download/?original=true");
  });
  it("kodiert die Suchanfrage", () => {
    expect(searchRequest(cfg, "Miet vertrag").url)
      .toBe("https://paperless.example.org/api/documents/?query=Miet%20vertrag");
  });
});

describe("parseDocumentMeta", () => {
  it("liest die relevanten Felder", () => {
    const meta = parseDocumentMeta(
      '{"id":42,"title":"Mietvertrag","checksum":"abc","created":"2026-08-05","extra":1}',
    );
    expect(meta).toEqual({ id: 42, title: "Mietvertrag", checksum: "abc", created: "2026-08-05" });
  });
  it("wirft bei kaputtem JSON", () => {
    expect(() => parseDocumentMeta("<html>")).toThrow();
  });
  it("wirft bei fehlender id", () => {
    expect(() => parseDocumentMeta('{"title":"x"}')).toThrow();
  });
  it("vertraegt fehlende optionale Felder", () => {
    const meta = parseDocumentMeta('{"id":1}');
    expect(meta.title).toBe("");
    expect(meta.checksum).toBe("");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/core/paperless-api.test.ts`
Erwartung: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```typescript
// Beschreibt Requests, fuehrt sie nicht aus — dadurch bleibt das Modul rein und in Node
// testbar (PROF-OBS-03/04). Das Ausfuehren uebernimmt der injizierte Transport.
//
// Routen gegen paperless-ngx 3.0.5 verifiziert (documents/views.py: preview, thumb,
// download, metadata als Actions am DocumentViewSet).

import type { FileVersion } from "./settings";

export interface ApiConfig {
  serverUrl: string;
  apiToken: string;
}

export interface RequestSpec {
  url: string;
  headers: Record<string, string>;
}

export interface DocumentMeta {
  id: number;
  title: string;
  checksum: string;
  created: string;
}

function base(cfg: ApiConfig): string {
  return cfg.serverUrl.trim().replace(/\/+$/, "");
}

function headers(cfg: ApiConfig): Record<string, string> {
  return { Authorization: `Token ${cfg.apiToken}` };
}

export function documentMetaRequest(cfg: ApiConfig, id: number): RequestSpec {
  return { url: `${base(cfg)}/api/documents/${id}/`, headers: headers(cfg) };
}

export function documentFileRequest(
  cfg: ApiConfig,
  id: number,
  version: FileVersion,
): RequestSpec {
  const path =
    version === "original"
      ? `/api/documents/${id}/download/?original=true`
      : `/api/documents/${id}/preview/`;
  return { url: `${base(cfg)}${path}`, headers: headers(cfg) };
}

export function searchRequest(cfg: ApiConfig, query: string): RequestSpec {
  return {
    url: `${base(cfg)}/api/documents/?query=${encodeURIComponent(query)}`,
    headers: headers(cfg),
  };
}

export function parseDocumentMeta(text: string): DocumentMeta {
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unexpected paperless response: not an object");
  }
  const obj = parsed as Record<string, unknown>;
  const id = obj["id"];
  if (typeof id !== "number") {
    throw new Error("Unexpected paperless response: missing 'id'");
  }
  return {
    id,
    title: typeof obj["title"] === "string" ? obj["title"] : "",
    checksum: typeof obj["checksum"] === "string" ? obj["checksum"] : "",
    created: typeof obj["created"] === "string" ? obj["created"] : "",
  };
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Ausführen: `npx vitest run tests/core/paperless-api.test.ts && npm run check:pure`
Erwartung: PASS, 10 Tests; `check:pure OK`.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/paperless-api.ts tests/core/paperless-api.test.ts
git commit -m "feat: paperless-Requests beschreiben und Antworten lesen"
```

---

## Aufgabe 7: `core/cache-policy.ts` — Cache-Pfad und Invalidierung

**Dateien:**
- Anlegen: `src/core/cache-policy.ts`
- Test: `tests/core/cache-policy.test.ts`

**Schnittstellen:**
- Liefert: `cachePath(folder: string, id: number, version: FileVersion): string` ·
  `needsRefresh(stub: DocumentStub, meta: DocumentMeta | null, cached: boolean): boolean`

Der Dateiname trägt die **ID**, nicht den Titel: Ein Titelwechsel in paperless darf den
Cache nicht verwaisen lassen.

- [ ] **Schritt 1: Fehlschlagenden Test schreiben**

```typescript
import { describe, it, expect } from "vitest";
import { cachePath, needsRefresh } from "../../src/core/cache-policy";

describe("cachePath", () => {
  it("nutzt die ID, nicht den Titel", () => {
    expect(cachePath("_paperless-storage", 42, "archive")).toBe("_paperless-storage/42.pdf");
  });
  it("unterscheidet Original von Archiv", () => {
    expect(cachePath("_paperless-storage", 42, "original"))
      .toBe("_paperless-storage/42-original.pdf");
  });
  it("vertraegt einen abschlieszenden Schraegstrich im Ordner", () => {
    expect(cachePath("cache/", 7, "archive")).toBe("cache/7.pdf");
  });
});

describe("needsRefresh", () => {
  const stub = { id: 1, title: "x", checksum: "abc" };
  it("verlangt Laden, wenn nichts im Cache liegt", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "abc", created: "" }, false))
      .toBe(true);
  });
  it("nutzt den Cache bei gleicher Pruefsumme", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "abc", created: "" }, true))
      .toBe(false);
  });
  it("laedt neu bei abweichender Pruefsumme", () => {
    expect(needsRefresh(stub, { id: 1, title: "x", checksum: "NEU", created: "" }, true))
      .toBe(true);
  });
  it("nutzt den Cache, wenn die Metadaten unerreichbar sind", () => {
    expect(needsRefresh(stub, null, true)).toBe(false);
  });
  it("verlangt Laden ohne Metadaten und ohne Cache", () => {
    expect(needsRefresh(stub, null, false)).toBe(true);
  });
  it("nutzt den Cache, wenn der Stub keine Pruefsumme kennt", () => {
    expect(needsRefresh({ id: 1, title: "x" }, { id: 1, title: "x", checksum: "abc", created: "" }, true))
      .toBe(false);
  });
});
```

**Zur letzten Erwartung:** Ein Stub ohne Prüfsumme ist ein Altbestand. Ihn bei jeder
Anzeige neu zu laden wäre teuer und brächte nichts — die Prüfsumme wird beim nächsten
erfolgreichen Laden nachgetragen.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

Ausführen: `npx vitest run tests/core/cache-policy.test.ts`
Erwartung: FAIL — Modul existiert nicht.

- [ ] **Schritt 3: Implementieren**

```typescript
// Der Cache-Dateiname traegt die ID, nicht den Titel: ein Titelwechsel in paperless
// darf den Cache nicht verwaisen lassen.

import type { FileVersion } from "./settings";
import type { DocumentStub } from "./stub";
import type { DocumentMeta } from "./paperless-api";

export function cachePath(folder: string, id: number, version: FileVersion): string {
  const dir = folder.replace(/\/+$/, "");
  const suffix = version === "original" ? "-original" : "";
  return `${dir}/${id}${suffix}.pdf`;
}

/**
 * `meta === null` bedeutet: Server nicht erreichbar. Dann gilt der Cache, falls vorhanden —
 * offline lesbar zu bleiben ist wichtiger als aktuell zu sein.
 */
export function needsRefresh(
  stub: DocumentStub,
  meta: DocumentMeta | null,
  cached: boolean,
): boolean {
  if (!cached) return true;
  if (meta === null) return false;
  if (!stub.checksum || !meta.checksum) return false;
  return stub.checksum !== meta.checksum;
}
```

- [ ] **Schritt 4: Tests laufen lassen**

Ausführen: `npx vitest run tests/core/cache-policy.test.ts && npm run check:pure`
Erwartung: PASS, 9 Tests; `check:pure OK`.

- [ ] **Schritt 5: Commit**

```bash
git add src/core/cache-policy.ts tests/core/cache-policy.test.ts
git commit -m "feat: Cache-Pfad und Invalidierung ueber Pruefsumme"
```

---

## Aufgabe 8: Transport und Lauf gegen die echte Instanz

**Dateien:**
- Anlegen: `src/obsidian/http.ts`
- Anlegen: `scripts/paperless-lab.ts`
- Ändern: `package.json` (Skript `lab`, `typecheck:scripts`)

**Schnittstellen:**
- Konsumiert: `RequestSpec` aus Aufgabe 6, `PaperlessHttpError` aus Aufgabe 3
- Liefert: `interface Transport { text(spec: RequestSpec): Promise<string>; binary(spec: RequestSpec): Promise<ArrayBuffer> }` ·
  `obsidianTransport(): Transport`

**CORE-TEST-02 (a)+(b):** Was gegen eine gemockte Gegenstelle geprüft ist, ist nicht
getestet, sondern spezifiziert. Ein Lauf gegen die echte Instanz ist Pflicht, bevor
dieser Pfad als abgesichert gilt — und das Werkzeug gehört **getrackt ins Repo**, nicht
in einen Scratchpad, sonst existiert die Praxis genau einmal.

- [ ] **Schritt 1: `src/obsidian/http.ts` schreiben**

```typescript
// PROF-OBS-12: `requestUrl` statt globalem `fetch` (nicht CORS- und nicht mobilsicher).
// Der Transport wird injiziert, nie global gegriffen — dadurch bleibt der Kern testbar.
//
// `throw: false` ist entscheidend: sonst wirft requestUrl bei 4xx/5xx eine eigene
// Fehlerform und der Rohbody geht verloren. Genau der wird fuer die Diagnose gebraucht.

import { requestUrl } from "obsidian";
import type { RequestSpec } from "../core/paperless-api";
import { PaperlessHttpError } from "../core/errors";

export interface Transport {
  text(spec: RequestSpec): Promise<string>;
  binary(spec: RequestSpec): Promise<ArrayBuffer>;
}

export function obsidianTransport(): Transport {
  return {
    async text(spec) {
      const res = await requestUrl({ url: spec.url, headers: spec.headers, throw: false });
      if (res.status < 200 || res.status >= 300) {
        throw new PaperlessHttpError(res.status, res.text ?? "");
      }
      return res.text;
    },
    async binary(spec) {
      const res = await requestUrl({ url: spec.url, headers: spec.headers, throw: false });
      if (res.status < 200 || res.status >= 300) {
        throw new PaperlessHttpError(res.status, res.text ?? "");
      }
      return res.arrayBuffer;
    },
  };
}
```

- [ ] **Schritt 2: `scripts/paperless-lab.ts` schreiben**

Instanz und Token kommen aus Umgebungsvariablen — eine hartkodierte Adresse würde in ein
öffentliches Repo wandern und wäre für Mitlesende wertlos. Das Skript nutzt Node-`fetch`,
weil es außerhalb von Obsidian läuft; geprüft wird der **Produktionscode aus `src/core/`**,
nicht eine Nachbildung.

```typescript
// Lauf gegen eine echte paperless-Instanz (CORE-TEST-02). Getrackt, nicht Scratchpad.
//
//   PAPERLESS_URL=https://… PAPERLESS_TOKEN=… npm run lab -- <dokument-id>
//
// Geprueft wird derselbe Request-Bau und dasselbe Antwort-Parsing wie im Plugin.

import {
  documentMetaRequest, documentFileRequest, parseDocumentMeta,
} from "../src/core/paperless-api";
import { extractErrorMessage } from "../src/core/errors";

const serverUrl = process.env["PAPERLESS_URL"];
const apiToken = process.env["PAPERLESS_TOKEN"];
if (!serverUrl || !apiToken) {
  console.error("PAPERLESS_URL und PAPERLESS_TOKEN setzen.");
  process.exit(2);
}
const cfg = { serverUrl, apiToken };
const id = Number(process.argv[2] ?? "1");

async function run(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  OK   ${label}`);
  } catch (e) {
    console.log(`  FAIL ${label}: ${String(e)}`);
  }
}

console.log(`Lab gegen ${serverUrl}, Dokument ${id}\n`);

await run("Metadaten lesen", async () => {
  const spec = documentMetaRequest(cfg, id);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = parseDocumentMeta(await res.text());
  console.log(`       title="${meta.title}" checksum=${meta.checksum.slice(0, 12)}…`);
});

await run("Archiv-PDF holen", async () => {
  const spec = documentFileRequest(cfg, id, "archive");
  const res = await fetch(spec.url, { headers: spec.headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder().decode(buf.slice(0, 5));
  if (head !== "%PDF-") throw new Error(`kein PDF-Header, sondern "${head}"`);
  console.log(`       ${buf.byteLength} Bytes, PDF-Header vorhanden`);
});

await run("401 bei falschem Token", async () => {
  const spec = documentMetaRequest({ ...cfg, apiToken: "ungueltig" }, id);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (res.status !== 401 && res.status !== 403) throw new Error(`erwartet 401/403, war ${res.status}`);
  const msg = extractErrorMessage(await res.text());
  console.log(`       Status ${res.status}, Servermeldung: ${msg ?? "(nicht lesbar)"}`);
});

await run("404 bei unbekannter ID", async () => {
  const spec = documentMetaRequest(cfg, 999999);
  const res = await fetch(spec.url, { headers: spec.headers });
  if (res.status !== 404) throw new Error(`erwartet 404, war ${res.status}`);
  console.log(`       Status 404 wie erwartet`);
});
```

- [ ] **Schritt 3: Skripte in `package.json` ergänzen**

```json
"lab": "node --experimental-strip-types scripts/paperless-lab.ts",
"typecheck:scripts": "tsc --noEmit --moduleResolution bundler --target ES2022 --module ESNext --strict scripts/paperless-lab.ts"
```

Ohne `typecheck`-Anbindung verrottet das Werkzeug — deshalb ist es kein optionales Extra.

- [ ] **Schritt 4: Lab gegen die echte Instanz laufen lassen**

```bash
PAPERLESS_URL=https://paperless.jkaindl.de PAPERLESS_TOKEN=<token> npm run lab -- 1
```

Erwartung: vier Zeilen `OK`. Die **401-Zeile ist die wichtigste** — sie belegt, dass der
Server eine lesbare Meldung liefert und `extractErrorMessage` sie findet. Weicht das
Verhalten ab (etwa 403 statt 401 oder ein HTML-Body statt JSON), wird `src/core/errors.ts`
danach korrigiert und Aufgabe 3 nachgezogen. **Der Befund gewinnt gegen die Annahme.**

- [ ] **Schritt 5: Ergebnis des Laufs festhalten**

Datum und Befund in `docs/superpowers/specs/2026-08-06-spike-ergebnis.md` ergänzen
(Abschnitt „Lab-Lauf"). Ein behaupteter Lauf ist kein geführter Nachweis.

- [ ] **Schritt 6: Commit**

```bash
git add src/obsidian/http.ts scripts/paperless-lab.ts package.json docs/
git commit -m "feat: requestUrl-Transport und Lab-Lauf gegen echte paperless-Instanz"
```

---

## Aufgabe 9: `obsidian/cache-store.ts` — Vault-I/O für den Cache

**Dateien:**
- Anlegen: `src/obsidian/cache-store.ts`

**Schnittstellen:**
- Konsumiert: `cachePath` (Aufgabe 7), `Transport` (Aufgabe 8), `documentFileRequest` (Aufgabe 6)
- Liefert: `class CacheStore` mit
  `has(path: string): boolean` · `file(path: string): TFile | null` ·
  `store(path: string, bytes: ArrayBuffer): Promise<TFile>` · `clear(): Promise<number>`

Der Cache liegt bewusst in einem **sichtbaren** Ordner: Obsidian ignoriert Verzeichnisse
mit führendem Punkt vollständig, darin liegende Dateien sind keine `TFile` und für den
nativen PDF-Viewer unsichtbar.

- [ ] **Schritt 1: Implementieren**

```typescript
// Der Cache liegt in einem sichtbaren Ordner: Obsidian ignoriert Dot-Ordner vollstaendig,
// darin liegende Dateien sind keine TFile und fuer den nativen PDF-Viewer unsichtbar.

import { normalizePath, TFile, type Vault } from "obsidian";

export class CacheStore {
  constructor(
    private readonly vault: Vault,
    private readonly folder: () => string,
  ) {}

  file(path: string): TFile | null {
    const found = this.vault.getAbstractFileByPath(normalizePath(path));
    return found instanceof TFile ? found : null;
  }

  has(path: string): boolean {
    return this.file(path) !== null;
  }

  async store(path: string, bytes: ArrayBuffer): Promise<TFile> {
    const normalized = normalizePath(path);
    await this.ensureFolder(normalized);
    const existing = this.file(normalized);
    if (existing) {
      await this.vault.modifyBinary(existing, bytes);
      return existing;
    }
    return await this.vault.createBinary(normalized, bytes);
  }

  /** Loescht alle gecachten Dateien. Gibt die Anzahl zurueck. */
  async clear(): Promise<number> {
    const dir = normalizePath(this.folder());
    const victims = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(dir + "/") && f.extension === "pdf");
    for (const f of victims) await this.vault.delete(f);
    return victims.length;
  }

  private async ensureFolder(filePath: string): Promise<void> {
    const dir = filePath.slice(0, filePath.lastIndexOf("/"));
    if (!dir) return;
    if (this.vault.getAbstractFileByPath(dir)) return;
    try {
      await this.vault.createFolder(dir);
    } catch {
      // Nebenlaeufig bereits angelegt — der naechste Zugriff findet ihn.
    }
  }
}
```

- [ ] **Schritt 2: Typecheck und Build**

```bash
npm run typecheck && npm run build && npm run check:pure
```

Erwartung: alle drei ohne Fehler. `cache-store.ts` liegt in `src/obsidian/` und **darf**
obsidian importieren — `check:pure` prüft nur `src/core/` und `src/vendor/kit/`.

- [ ] **Schritt 3: Commit**

```bash
git add src/obsidian/cache-store.ts
git commit -m "feat: Cache-Speicher im Vault"
```

---

## Aufgabe 10: Embed-Adapter — das PDF erscheint

**Dateien:**
- Anlegen: `src/obsidian/render-core.ts`, `src/obsidian/embed.ts`, `src/obsidian/settings-tab.ts`
- Ändern: `src/obsidian/main.ts` (ersetzt den Spike-Code vollständig)
- Anlegen: `styles.css`

**Schnittstellen:**
- Konsumiert: alles aus den Aufgaben 3–9
- Liefert: ein Plugin, bei dem `![[X.paperless]]` das PDF anzeigt

**Vor Beginn — Aufgabe 2 ist gemessen (2026-08-06):** Weg A trägt, dieser Plan gilt.
Befunde in `docs/superpowers/specs/2026-08-06-spike-ergebnis.md`.

⚠️ **Der unten stehende `showPdf()` ist so nicht lauffähig** — gemessen, nicht vermutet:
`creator(...)` + `child.loadFile()` läuft ohne Wurf durch und rendert **nichts**
(`innerHTMLLength: 0`), weil Obsidians PDF-Viewer sein DOM erst in `onload()` aufbaut.
Der zurückgegebene Child muss per `addChild()` registriert werden — das ist es, was
`load()` auslöst. Der Code unten ist entsprechend korrigiert: `showPdf()` bekommt den
`MarkdownRenderChild` als Parameter, weil eine freie Funktion `addChild()` nicht
aufrufen kann.

- [ ] **Schritt 1: `src/obsidian/render-core.ts` schreiben**

```typescript
// Ein Renderkern, den Embed und (spaeter) FileView als duenne Adapter benutzen —
// Muster „Adapter um einen Kern" aus 3d-codeblocks. Fehlerbehandlung, Ladezustand und
// Cache-Logik liegen dadurch an genau einer Stelle.

import { Component, TFile, type App } from "obsidian";
import { parseStub, StubParseError } from "../core/stub";
import { cachePath, needsRefresh } from "../core/cache-policy";
import { documentFileRequest, documentMetaRequest, parseDocumentMeta } from "../core/paperless-api";
import type { DocumentMeta } from "../core/paperless-api";
import { PaperlessHttpError } from "../core/errors";
import { isConfigured, resolveCacheFolder, type PaperlessSettings } from "../core/settings";
import { t } from "../core/i18n";
import type { Transport } from "./http";
import type { CacheStore } from "./cache-store";

export interface RenderDeps {
  app: App;
  transport: Transport;
  cache: CacheStore;
  settings: () => PaperlessSettings;
}

/** Zeigt das Dokument des Stubs in `containerEl`. Wirft nie — Fehler werden gerendert. */
export async function renderStub(
  deps: RenderDeps,
  stubFile: TFile,
  containerEl: HTMLElement,
  parent: Component,
): Promise<void> {
  containerEl.empty();
  const settings = deps.settings();

  if (!isConfigured(settings)) {
    message(containerEl, t("notConfigured"));
    return;
  }

  let stub;
  try {
    stub = parseStub(await deps.app.vault.cachedRead(stubFile));
  } catch (e) {
    message(containerEl, t("brokenStub", e instanceof StubParseError ? e.message : String(e)));
    return;
  }

  const loading = message(containerEl, t("loading"));
  const cfg = { serverUrl: settings.serverUrl, apiToken: settings.apiToken };
  const path = cachePath(resolveCacheFolder(settings), stub.id, settings.fileVersion);

  // Metadaten sind optional: ohne sie gilt der Cache. Offline lesbar zu bleiben ist
  // wichtiger als aktuell zu sein.
  let meta: DocumentMeta | null = null;
  let authFailed = false;
  let missing = false;
  try {
    meta = parseDocumentMeta(await deps.transport.text(documentMetaRequest(cfg, stub.id)));
  } catch (e) {
    if (e instanceof PaperlessHttpError) {
      if (e.status === 401 || e.status === 403) authFailed = true;
      if (e.status === 404) missing = true;
    }
  }

  if (authFailed && !deps.cache.has(path)) {
    loading.setText(t("invalidToken"));
    return;
  }
  if (missing && !deps.cache.has(path)) {
    loading.setText(t("notFound", String(stub.id)));
    return;
  }

  if (needsRefresh(stub, meta, deps.cache.has(path))) {
    let bytes: ArrayBuffer | null = null;
    try {
      bytes = await deps.transport.binary(
        documentFileRequest(cfg, stub.id, settings.fileVersion),
      );
    } catch {
      if (!deps.cache.has(path)) {
        loading.setText(t("noCacheOffline"));
        return;
      }
      loading.setText(t("offline"));
    }
    if (bytes) {
      // Schreibfehler (volle Platte, schreibgeschuetzter Vault) sind KEIN Netzproblem —
      // sonst meldet das Plugin „offline", waehrend der Server einwandfrei antwortet
      // (Spec §5). Die Bytes sind da, also wird einmalig ohne Cache angezeigt.
      try {
        await deps.cache.store(path, bytes);
      } catch (e) {
        loading.remove();
        showUncachedNotice(containerEl, e);
        return;
      }
    }
  }

  const cached = deps.cache.file(path);
  if (!cached) {
    loading.setText(t("noCacheOffline"));
    return;
  }

  loading.remove();
  showPdf(deps.app, containerEl, cached, parent);
}

function message(containerEl: HTMLElement, text: string): HTMLElement {
  return containerEl.createDiv({ cls: "paperless-storage-message", text });
}

/** Der Download lief, nur das Ablegen im Vault schlug fehl — als solches benennen. */
function showUncachedNotice(containerEl: HTMLElement, error: unknown): void {
  message(containerEl, t("cacheWriteFailed", String(error)));
}

/**
 * Weg A aus dem Spike: Obsidians eigenen PDF-Embed-Creator mit unserer Cache-Datei
 * aufrufen. Inoffizielle API — mit Feature-Detection, damit ihr Verschwinden nur die
 * Anzeige kostet und nicht das Plugin.
 */
function showPdf(
  app: App,
  containerEl: HTMLElement,
  file: TFile,
  parent: Component,
): void {
  const registry = (app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
  const creator = registry?.embedByExtension?.["pdf"];
  if (!creator) {
    message(containerEl, "PDF viewer unavailable in this Obsidian version.");
    return;
  }
  const child = creator({ app, containerEl, linktext: file.path, sourcePath: file.path }, file);
  // Ohne addChild() laeuft loadFile() durch und rendert NICHTS: der Viewer baut sein DOM
  // erst in onload(), und geladen wird eine Component nur als Kind (gemessen 2026-08-06).
  parent.addChild(child as unknown as Component);
  child.loadFile();
}

interface EmbedRegistry {
  embedByExtension?: Record<
    string,
    (ctx: { app: App; containerEl: HTMLElement; linktext?: string; sourcePath?: string }, file: TFile) => { loadFile(): void }
  >;
  registerExtension(ext: string, creator: unknown): void;
  unregisterExtension(ext: string): void;
}
```

- [ ] **Schritt 2: `src/obsidian/embed.ts` schreiben**

```typescript
// `![[x.paperless]]`-Embeds ueber Obsidians embedRegistry.
//
// WICHTIG — inoffizielle API: `app.embedRegistry` ist nicht Teil der oeffentlichen
// Obsidian-Typen. Sie ist der EINZIGE zuverlaessige Weg fuer echte Datei-Embeds; der
// Markdown-Postprocessor greift nicht (er laeuft vor Obsidians Embed-Laden).
// Deshalb: Feature-Detection + eigene minimale Typ-Deklaration statt einer Dependency.
// Verschwindet die API, fehlen nur Embeds — das Plugin laedt weiter.
//
// Signatur verifiziert gegen obsidian-typings: der Creator bekommt die Datei,
// `loadFile()` ist parameterlos.

import { MarkdownRenderChild, type App, type TFile } from "obsidian";
import { renderStub, type RenderDeps } from "./render-core";

interface EmbedContext {
  app: App;
  containerEl: HTMLElement;
  linktext?: string;
  sourcePath?: string;
}
interface EmbedComponentLike {
  loadFile(): void;
}
interface EmbedRegistry {
  isExtensionRegistered?(extension: string): boolean;
  registerExtension(
    extension: string,
    creator: (ctx: EmbedContext, file: TFile, subpath?: string) => EmbedComponentLike,
  ): void;
  unregisterExtension(extension: string): void;
}

class PaperlessEmbed extends MarkdownRenderChild implements EmbedComponentLike {
  constructor(
    containerEl: HTMLElement,
    private readonly deps: RenderDeps,
    private readonly file: TFile,
  ) {
    super(containerEl);
  }

  loadFile(): void {
    void renderStub(this.deps, this.file, this.containerEl, this);
  }
}

/**
 * Registriert die Endung. Gibt eine Abmeldefunktion zurueck, oder `null`, wenn die
 * Registry fehlt oder die Endung bereits belegt ist.
 */
export function registerPaperlessEmbed(deps: RenderDeps): (() => void) | null {
  const registry = (deps.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
  if (!registry) {
    console.warn("[paperless-storage] embedRegistry unavailable — ![[…]] embeds disabled.");
    return null;
  }
  if (registry.isExtensionRegistered?.("paperless")) {
    console.warn("[paperless-storage] extension 'paperless' already registered.");
    return null;
  }
  registry.registerExtension("paperless", (ctx, file) => new PaperlessEmbed(ctx.containerEl, deps, file));
  return () => registry.unregisterExtension("paperless");
}
```

- [ ] **Schritt 3: `src/obsidian/settings-tab.ts` schreiben (minimal)**

Nur was Phase 1 zum Testen braucht. Cache-Ordner, Ausblenden und Dateiversion folgen in
Phase 2.

```typescript
import { App, PluginSettingTab, Setting, type Plugin } from "obsidian";
import type { PaperlessSettings } from "../core/settings";

export interface SettingsHost extends Plugin {
  settings: PaperlessSettings;
  saveSettings(): Promise<void>;
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
      .setDesc("Create one in paperless under Settings. Stored in this plugin's data.json.")
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setValue(this.host.settings.apiToken)
          .onChange(async (value) => {
            this.host.settings.apiToken = value;
            await this.host.saveSettings();
          });
      });
  }
}
```

- [ ] **Schritt 4: `src/obsidian/main.ts` ersetzen**

```typescript
import { getLanguage, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, mergeSettings, resolveCacheFolder, type PaperlessSettings } from "../core/settings";
import { pickLang, setLang } from "../core/i18n";
import { obsidianTransport } from "./http";
import { CacheStore } from "./cache-store";
import { registerPaperlessEmbed } from "./embed";
import { PaperlessSettingTab } from "./settings-tab";

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

    const unregister = registerPaperlessEmbed(deps);
    if (unregister) {
      this.register(unregister);
    } else {
      new Notice("Paperless Storage: embeds unavailable in this Obsidian version.");
    }

    this.addCommand({
      id: "clear-cache",
      name: "Clear document cache",
      callback: async () => {
        const n = await cache.clear();
        new Notice(`Paperless Storage: ${n} cached file(s) removed.`);
      },
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

- [ ] **Schritt 5: `styles.css` anlegen**

Nur Theme-Variablen, kein `!important` (UI-STANDARD §3, PROF-OBS-13).

```css
.paperless-storage-message {
  padding: var(--size-4-3);
  color: var(--text-muted);
  background-color: var(--background-secondary);
  border-radius: var(--radius-s);
  font-size: var(--font-ui-small);
}
```

- [ ] **Schritt 6: Alle Gates laufen lassen**

```bash
npm run typecheck && npm test && npm run lint && npm run build
```

Erwartung: alle vier ohne Fehler.

- [ ] **Schritt 7: Im echten Obsidian prüfen** *(die eigentliche Abnahme)*

```bash
cp main.js manifest.json styles.css "$OBSIDIAN_PLUGIN_DIR/paperless-storage/"
```

Dann im Testvault, in dieser Reihenfolge:

1. Plugin aktivieren **ohne** Server-URL → Embed zeigt „Paperless Storage is not set up yet".
   *(Der Erstkontakt eines Fremdnutzers — er darf keinen Netzfehler sehen.)*
2. Server-URL und Token eintragen.
3. Datei `Test.paperless` mit `{"id":1,"title":"Test"}` anlegen, in einer Notiz
   `![[Test.paperless]]` schreiben.
4. **PDF erscheint und lässt sich scrollen** → Phase 1 erreicht.
5. Prüfen, dass `_paperless-storage/1.pdf` im Vault entstanden ist.
6. Falschen Token setzen, Notiz neu öffnen → „API token rejected", **kein** „Server nicht
   erreichbar". Das ist der Fall, den `describeHttpError` verhindern soll.
7. Netzwerk trennen, Notiz neu öffnen → PDF kommt weiter aus dem Cache, Hinweis „offline".
8. Befehl „Clear document cache" ausführen → Ordner ist leer.
9. Notiz schließen, Entwicklertools prüfen: keine Fehler, keine zurückbleibenden Elemente.

- [ ] **Schritt 8: Abnahme protokollieren**

Die neun Prüfpunkte mit Befund und Datum in
`docs/superpowers/specs/2026-08-06-spike-ergebnis.md` (Abschnitt „Abnahme Phase 1")
festhalten. Ein grüner Testlauf ist kein Beleg für die Anzeige — die entsteht erst im
echten Obsidian.

- [ ] **Schritt 9: Commit**

```bash
git add -A
git commit -m "feat: paperless-Dokumente als ![[x.paperless]] einbetten"
```

---

## Nach Phase 1

Nicht in diesem Plan, in dieser Reihenfolge sinnvoll:

1. **REGISTRY-Eintrag** im Dach (`obsidian-plugins/REGISTRY.md`) für den Befund
   „Obsidians PDF-Viewer aus einem Embed-Adapter ansteuern" — Kit-first-Regel Punkt 2,
   und die Frage ist über dieses Plugin hinaus wiederverwendbar.
2. **Suchmodal** zum Einfügen von Dokumenten (`insert-modal.ts`, `FuzzySuggestModal`).
3. **FileView** im Pane (`registerExtensions` in `try/catch`, UI-STANDARD §1: genau ein
   `registerView`-Type).
4. **Restliche Einstellungen**: Cache-Ordner mit `FolderSuggest`, Ausblenden per
   `<style>`-Element mit CSS-escaptem Pfad, Dateiversion, Embed-Höhe.
5. **Titel-Synchronisation** über `app.fileManager.renameFile`.
6. **GUI-Smoke** über den Dach-Skill `gui-smoke-setup` (CDP; ohne `Page.bringToFront`
   bleibt die View leer und man debuggt ein Phantom).
7. **Release-Infrastruktur** über `plugin-release-setup`, README, MIT-Lizenz — Spec §10.
   Erst danach ist die Store-Einreichung möglich.
