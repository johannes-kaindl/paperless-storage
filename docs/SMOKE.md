# GUI-Smoke — paperless-storage

Getrackter CDP-Treiber (`npm run smoke:gui`, Quelle `scripts/gui-smoke.ts`) gegen ein
**laufendes** Obsidian. Erfüllt CORE-TEST-02 (b) — was gegen einen Mock geprüft ist, ist
spezifiziert, nicht getestet. Prüft die Naht zum Host, die die 74 vitest-Tests
strukturell nicht sehen können: `embedRegistry`-Verhalten, Obsidians eigenen
PDF-Viewer, echte Datei-Explorer-DOM-Mutationen.

Vendored aus `3d-codeblocks/scripts/gui-smoke.ts` (Skill `gui-smoke-setup`, Dach-`AGENTS.md`
Extraktions-Schwelle — CDP-Brücke verbatim übernommen, Prüfpunkte plugin-eigen).

## Vorbereitung

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
open "obsidian://open?vault=<vault>"   # z. B. 00_ProtoVault
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/paperless-storage" npm run deploy
```

Braucht einen im Vault konfigurierten Server + Token (`data.json`: `serverUrl`,
`apiToken`) und mindestens ein per Token erreichbares Dokument (Default `--doc 1`).
Referenz-Testinstanz: `https://paperless.jkaindl.de`, Dokument-ID 1 ("notes-to-media").

## Lauf

```bash
npm run smoke:gui -- --port 9222 --vault 00_ProtoVault
```

## Prüfpunkte

1. Cache-Ordner ausgeblendet bei `hideCacheFolder=true` (`hide-folder.ts`, Constructable
   Stylesheet — `.nav-folder-title[data-path=…]` auf `display:none`).
2. Cache-Ordner wieder sichtbar bei `hideCacheFolder=false`.
3. `![[…paperless]]`-Embed lädt Obsidians eigenen PDF-Viewer (`embedRegistry`-Adapter,
   Signal: `.pdf-toolbar` im `.internal-embed`-Span).
4. Embed-Höhe (`embedHeight`-Setting) bleibt stabil, auch nachdem Obsidians PDF-Viewer
   sie in zwei Schüben zu überschreiben versucht (`render-core.ts` `applyEmbedHeight`,
   ~300–600 ms und ~1 s nach dem Laden — gemessen bei der Phase-2-Abnahme).
5. FileView öffnet eine `.paperless`-Datei im ganzen Pane (dasselbe Signal wie 3, aber
   auf `.view-content` statt `.internal-embed`).

Nicht automatisiert (Hand-Runde bleibt nötig): Suchmodal-Bedienung, Titel-Synchronisation
(`renameFile`-Dialog blockiert unbegrenzt, s. `_docs/docs/obsidian-api-gotchas.md`),
Einstellungs-UI-Feinheiten (Autocomplete-Dropdown-Optik).

## Durchläufe

### 2026-08-06 — Obsidian 1.13.5, Plugin 0.1.0 — Ersteinrichtung

**Erster Lauf:** 3/5 grün. Zwei Fehlschläge, beide **im Treiber selbst**, nicht im
Plugin — `scrollHeight > clientHeight` als Ladesignal ist für `.internal-embed` und
`.view-content` falsch: Obsidians PDF-Viewer *sitzt* den Container passgenau
(`style.height` wird gesetzt), er wächst nicht über den Container hinaus. Fix:
`.pdf-toolbar`-Präsenz als Signal (erscheint erst nach echter Viewer-Initialisierung).
Nach dem Fix zusätzlich ein zweiter Treiber-Mangel gefunden: ein bereits offenes
Ziel-File (Leftover aus einem vorherigen `--keep`-Lauf) rendert seine Embeds beim
erneuten `openFile()` **nicht neu** — Check 4 maß dadurch eine veraltete Höhe. Fix:
vor dem Zielfile immer erst zu einem neutralen File navigieren.

**Nach beiden Treiber-Fixes:** 5/5 grün.

**Gegenprobe:** Fix aus `hide-folder.ts` (Commit `7e9071d`, Constructable-Stylesheet-
Umstellung) temporär durch ein frühes `return` ausgebaut, deployt, Plugin per
`disablePlugin`/`enablePlugin` neu geladen (kein Obsidian-Neustart nötig) → **4/5**,
genau Check 1 rot (`display: flex` statt `none`) — exakt der erwartete Befund am
erwarteten Punkt, alle anderen vier Checks unbeeinflusst. Fix zurückgesetzt, `git diff`
bestätigt leer, neu deployt/geladen → wieder **5/5**.

Vault-Zustand nach dem Lauf geprüft: `data.json` (`hideCacheFolder: true`,
`embedHeight: null`) unverändert gegenüber vor dem Lauf, keine `_pls-gui-smoke.*`-
Leftover-Dateien im Vault.

## Abweichungen zur `3d-codeblocks`-Vorlage (Material für spätere Extraktion)

- **CDP-Brücke** (`Cdp`-Klasse, `waitFor`, `record`, Fenster-Auswahl per `--vault`):
  **byte-nah identisch** übernommen, keine Anpassung nötig.
- **Kein Test-Content im Vault gesucht** — 3d-codeblocks sucht eine vorhandene `.glb`
  im Vault; paperless-storage legt Stub **und** Note selbst an (`_pls-gui-smoke.paperless`
  + `.md`), weil das Dokument über eine Server-ID kommt, nicht über einen Vault-Pfad.
  Braucht dafür `--doc <id>` statt `--model <pfad>`.
  needs einen erreichbaren Server; ohne Konfiguration bricht der Treiber früh mit einer
  eigenen Fehlermeldung ab (`plugin.configured`-Check), statt spät und unklar zu scheitern.
- **Kein `previousViewMode`-Pendant nötig**, aber zwei State-Variablen statt einer
  (`hideCacheFolder` UND `embedHeight`) — paperless-storage mutiert zwei unabhängige
  Settings während des Laufs, 3d-codeblocks nur eine (`viewMode`).
- **Ladesignal ist `.pdf-toolbar`, nicht `scrollHeight>clientHeight`** — 3d-codeblocks
  prüft WebGL-Canvas-Präsenz und CSS-Farbwerte, hat keine Analogie zu Obsidians
  "Container sitzt passgenau"-Verhalten. Für jedes Plugin, das Obsidians eingebauten
  PDF-Viewer über `embedRegistry` einbindet, ist `.pdf-toolbar` vermutlich das robustere
  generische Signal als ein Größenvergleich.
- **Neutral-Navigation vor jedem Ziel-`openFile()`** — nötig, weil ein bereits offenes
  Ziel-File seine Embeds nicht neu rendert. Bei 3d-codeblocks nicht nötig, weil dessen
  Smoke-Note bei jedem Lauf frisch erzeugt und nie mit `--keep` wiederverwendet über
  mehrere Läufe hinweg im selben Zustand offen war.
