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

Der Smoke läuft in einer **Zweitinstanz** mit eigenem Profil und eigenem Port, nie in der regulären Instanz: die aktuelle `.asar` der regulären Instanz ins `--user-data-dir` kopieren, den Vault `paperless-storage` aus `$STAGING_VAULTS_DIR` und `"language":"en"` in dessen `obsidian.json` eintragen, mit `--remote-debugging-port=<port>` starten und den CDP-Lock für den eigenen Port halten. Vertrauensdialog und Restricted Mode erledigt der Treiber (`bereiteInstanzVor`).

```bash
export PAPERLESS_URL=https://…      # Test-Server, optional; ohne beide Variablen fährt der Smoke gegen den Demo-Server
export PAPERLESS_TOKEN=…
npm run smoke:gui -- --setup        # baut/aktualisiert den Vault aus dem Fixture; nur beim ersten Mal oder bei geändertem Fixture
OBSIDIAN_PLUGIN_DIR="$STAGING_VAULTS_DIR/paperless-storage/.obsidian/plugins/paperless-storage" \
  npm run deploy                    # baut UND deployt — der Herkunfts-Guard vergleicht beides
```

Die Embed-Punkte 3–5 brauchen eine Gegenstelle. Sind Server und Token in den Einstellungen gesetzt (`--setup` mit den Variablen), ist es die **echte** Instanz und braucht mindestens ein per Token erreichbares Dokument (Default `--doc 1`; Referenz-Testinstanz `https://paperless.jkaindl.de`, Dokument-ID 1). Sonst, oder mit `--demo`, fährt der Smoke gegen den lokalen Demo-Server aus `scripts/demo-paperless.ts` (Port vom Betriebssystem, Dokument 101): Er ersetzt Server und Token der Einstellungen für den Lauf und stellt sie danach zurück. Der Demo-Server prüft die Naht zum Host (`embedRegistry`, PDF-Viewer), nicht paperless selbst; die Abschlusszeile nennt die Gegenstelle („Demo“ oder „echt“).

Der Cache-Ordner im Explorer ist eine Vorbedingung der Punkte 1–2c. Das Fixture hat ihn nicht, ohne Embed legt ihn niemand an. Der Treiber legt ihn bei Bedarf selbst an und räumt ihn danach wieder ab; der frühere Kaltstart-Effekt (Punkte 1/2 rot im ersten Lauf) entfällt damit.

## Lauf

```bash
npm run smoke:gui -- --port <port>
```

Die Bilanz hat vier Zustände (grün, rot, übersprungen, nichts gemessen); die Soll-Liste ist der Nenner. Exit 1 bei Rot oder "nichts gemessen", Exit 2 bei Abbruch.

## Prüfpunkte

1. Cache-Ordner ausgeblendet bei `hideCacheFolder=true` (Kit `folder-hide`, Constructable
   Stylesheet — `.nav-folder-title[data-path=…]` auf `display:none`; bis 0.3.0 eine eigene
   `hide-folder.ts`).
2. Cache-Ordner wieder sichtbar bei `hideCacheFolder=false`.
2b. Die Kinder des aufgeklappten Ordners (`.nav-folder-children`) sind mit ausgeblendet.
2c. Das Stylesheet hängt am Hauptfenster-Dokument (`rootSplit.doc`), auch bei offenem Pop-out.
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

### 2026-10-12 — Obsidian 1.14.4, Plugin 0.3.2 — Treiber in vier Zuständen

Baseline vor dem Umbau, ohne `PAPERLESS_URL`/`PAPERLESS_TOKEN`: Abbruch vor dem ersten Punkt ("keinen Server/Token in den Settings"), Exit 1, 12 Aufrufstellen nie erreicht. Nach dem Umbau (`createBilanz` mit 12 Soll-Punkten, `bereiteInstanzVor`, `requireVisible`, Pflicht-Port) ohne Gegenstelle: 9 grün · 0 rot · 0 übersprungen · 3 nichts gemessen (3–5), Exit 1. Mit dem Demo-Server als Gegenstelle: **12 grün · 0 rot · 0 übersprungen · 0 nichts gemessen**, Exit 0; Gegenprobe (Vorschau-Route des Demo-Servers auf 404): genau 3 und 5 rot („Server unreachable and no cached copy available“), Punkt 4 bleibt grün (die Höhe wird unabhängig vom Viewer gesetzt). Ein erster Lauf ohne die Cache-Ordner-Vorbedingung zeigte 1, 2, 2b rot ("Ordner-Element nicht im Explorer gefunden") — der dokumentierte Kaltstart-Effekt; mit der Vorbedingung grün.

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
