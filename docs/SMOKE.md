# GUI-Smoke — paperless-storage

Getrackter CDP-Treiber (`npm run smoke:gui`, Quelle `scripts/gui-smoke.ts`) gegen ein
**laufendes** Obsidian. Erfüllt CORE-TEST-02 (b) — was gegen einen Mock geprüft ist, ist
spezifiziert, nicht getestet. Prüft die Naht zum Host, die die 74 vitest-Tests
strukturell nicht sehen können: `embedRegistry`-Verhalten, Obsidians eigenen
PDF-Viewer, echte Datei-Explorer-DOM-Mutationen.

CDP-Brücke seit 2026-08-18 aus dem Dach importiert (`tools/obsidian-cdp/`, s. dortige
`CLAUDE.md`), nicht mehr inline getragen — sie ist plugin-neutral und lag zuvor
byte-identisch in sechs Repos.

## Vault

Läuft seit 2026-08-18 gegen einen eigenen, getrackten Fixture-Vault
(`docs/images/fixture/`) statt gegen einen geteilten Arbeits-Vault. Grund: mehrere
gleichzeitig offene Obsidian-Fenster teilen sich einen Prozess, und Chromium drosselt
jedes nicht fokussierte massiv (`document.visibilityState: hidden`, auch nach
`Page.bringToFront` + `osascript activate`) — bei drei offenen Vaults ließ sich das
Ziel-Fenster in einer Fernsitzung nicht zuverlässig nach vorn holen. Ein einzeln
gestarteter, eigener Vault umgeht das strukturell. Derselbe Fixture dient später auch
`scripts/shots.ts` (Skill `readme-shots`, noch nicht eingerichtet).

**Zugangsdaten stehen NICHT im Fixture** (git-getrackt, ginge sonst mit jedem Push um
die Welt) — `--setup` schreibt sie aus der Umgebung in die `data.json` des extern
liegenden Vaults.

## Vorbereitung

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

```bash
export STAGING_VAULTS_DIR=/Users/Shared/60_StagingVaults   # einmalig
export PAPERLESS_URL=https://paperless.jkaindl.de
export PAPERLESS_TOKEN=…
npm run build
npm run smoke:gui -- --setup      # baut/aktualisiert den Vault
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
open "obsidian://open?vault=paperless-storage"   # erster Start: Vault vorher unter
                                                  # diesem Namen in Obsidian registrieren
```

Braucht mindestens ein per Token erreichbares Dokument (Default `--doc 1`).
Referenz-Testinstanz: `https://paperless.jkaindl.de`, Dokument-ID 1 ("notes-to-media").

⚠️ **Cold-Start-Effekt auf einem frischen Vault:** Checks 1/2 (Cache-Ordner-Sichtbarkeit)
schlagen im allerersten Lauf gegen einen neu gebauten Vault fehl
(„Ordner-Element nicht im Explorer gefunden") — der Cache-Ordner existiert erst, nachdem
ein Dokument einmal geladen wurde. Ein zweiter Lauf direkt danach ist grün. Kein Defekt,
kein Migrations-Regress — gemessen 2026-08-18 bei der Umstellung auf den Fixture-Vault.

## Lauf

```bash
npm run smoke:gui -- --port 9222 --vault paperless-storage
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

### 2026-08-18 — Obsidian 1.13.7, Plugin 0.1.2 — CDP-Brücke zentralisiert + Fixture-Vault

CDP-Brücke aus dem inline getragenen Nachbau auf den zentralen Import aus
`tools/obsidian-cdp/` umgestellt (`attachTo` statt `Cdp.attach`, `pollUntil` statt dem
renderer-seitigen `waitFor`). Baseline vor der Migration: 8/8 grün gegen `00_ProtoVault`.

Beim Verifizieren der Migration zusätzlich auf einen eigenen Fixture-Vault
(`docs/images/fixture/`) umgestellt, weil sich `00_ProtoVault` in dieser Sitzung nicht
zuverlässig nach vorn holen ließ (drei gleichzeitig offene Vault-Fenster, alle
`document.visibilityState: hidden`, auch nach `Page.bringToFront` + `osascript activate`
— vermutlich eine Eigenheit von Remote-/Fernsitzungen ohne durchgehenden Display-Fokus).
Erster Lauf gegen den frischen Fixture-Vault: 5/8 grün, drei Fehlschläge — zwei davon der
oben dokumentierte Cold-Start-Effekt (Cache-Ordner existiert noch nicht), einer ein
echter Fixture-Mangel: `core-plugins.json` hatte `bookmarks` nicht explizit
deaktiviert, wodurch Obsidians Standard-Lesezeichen-Panel eine zweite
`.view-content`-Instanz vor der Haupt-Ansicht in den DOM setzte — Check 5 (`.view-content`
als „eindeutig" vorausgesetzt) fand dadurch das falsche Element. Nach dem Fix (`bookmarks`,
`properties`, `canvas` ergänzt) und einem zweiten Lauf: **8/8 grün**, identisch zur
Baseline. `npm run gate` durchgehend grün.

## Abweichungen zur `3d-codeblocks`-Vorlage (Material für spätere Extraktion)

- **CDP-Brücke**: seit 2026-08-18 zentraler Import aus `tools/obsidian-cdp/`
  (`attachTo`, `pollUntil`), nicht mehr inline getragen — s. Durchlauf oben.
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
