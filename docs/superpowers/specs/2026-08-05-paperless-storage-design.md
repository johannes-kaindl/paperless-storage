# paperless-storage — Design

**Datum:** 2026-08-05 · **Status:** Entwurf, vor Implementierung
**Repo:** `/Users/Shared/code/obsidian-plugins/paperless-storage/`

## 1 Ausgangslage

Im Pallas-Vault liegen **70 PDFs mit 159 MB**, davon 39 als echte Embeds
(`![[x.pdf]]`) und rund 40 als reine Links. Verteilung: 31 in
`50_Ressourcen/30_Storage` (allgemeine Ablage), 18 in der Projektakte
`26-010 Rechtstreit BU-Versicherung`, der Rest verstreut. Seitenanker
(`#page=`) kommen praktisch nicht vor.

Seit dem 05.08.2026 läuft **paperless-ngx v3.0.5** unter
`https://paperless.jkaindl.de` auf dem VPS `git-jkaind`. Damit gibt es einen
besseren Ort für diese PDFs: OCR, Volltextsuche, Tags, Korrespondenten,
Aufbewahrung auf einem eigenen Cloud-Volume.

**Das Ziel:** PDFs leben künftig in paperless, bleiben aber in Notizen
einbettbar wie bisher. Die maßgebliche Anforderung ist **Lesen im Fluss** —
das PDF wird in der Notiz durchgescrollt, während daneben geschrieben wird.
Ein bloßer Link wäre ein Kontextwechsel und damit ein Rückschritt.

### Warum kein bestehendes Plugin

| Plugin | Befund |
|---|---|
| [Talal-A/obsidian-paperless](https://github.com/Talal-A/obsidian-paperless) | Erfüllt den Lesefluss (Inline-PDF via PDF++), aber über **öffentliche Share-Links** und mit PDF++ als Zwangsabhängigkeit |
| [ahn1/obsidian-paperless-link](https://github.com/ahn1/obsidian-paperless-link) | Nur Referenzkarten mit Thumbnail, kein Inline-PDF. 1 Star, faktisch verwaist |
| [hogmoff/obsidian-paperless-ngx](https://github.com/hogmoff/obsidian-paperless-ngx) | Verlinkt ohne Duplikate, kein Inline-Lesefluss |

Share-Links sind in paperless öffentlich erreichbare URLs ohne Login
(`/share/<slug>`, Modell `ShareLink` mit optionalem `expiration`). Der Slug ist
unerratbar, aber wer die URL hat, hat das Dokument — und die URL stünde im
Klartext in der Notiz und damit im Vault-Git. Für Gesundheits- und Rechtsdaten
ist das der falsche Mechanismus. **Der Eigenbau existiert genau wegen dieses
Unterschieds: API-Token statt öffentlicher URL.**

## 2 Nicht-Ziele

- **Kein Ersatz für die paperless-Oberfläche.** Tagging, Korrespondenten,
  Regeln und Volltextsuche bleiben dort. Das Plugin ist eine Leseschicht.
- **Kein Upload aus Obsidian** in v1. Zuführung läuft über den Consume-Ordner
  oder die paperless-Oberfläche.
- **Kein Migrationswerkzeug.** Das Plugin ist ein Store-Plugin für beliebige
  Nutzer. Der Umzug der 70 Bestands-PDFs ist ein **persönlicher Rollout** und
  steht deshalb in §9 getrennt vom Produkt — kein Pallas-Pfad, keine
  Vault-Struktur und keine Ordnernamen aus diesem Vault gehören in den Code.
- **Keine LLM-Funktionen.** paperless bringt einen eigenen LLM-Index mit
  (`llm_backend`: `openai-like`/`ollama`); das ist ein separates Thema.

## 3 Architektur

Zwei Entscheidungen, die sich nicht ausschließen: die **Referenzform** in der
Notiz und die **Byte-Quelle** für die Anzeige.

### 3.1 Referenzform — Stub-Datei

Im Vault liegt pro referenziertem Dokument eine kleine Datei:

```
50_Ressourcen/30_Storage/Mietvertrag 2024.paperless
```

Inhalt (JSON, ~150 Byte):

```json
{
  "id": 42,
  "title": "Mietvertrag 2024",
  "checksum": "a1b2c3…",
  "added": "2026-08-05"
}
```

In der Notiz steht dann `![[Mietvertrag 2024.paperless]]`.

**Warum eine Datei und kein Codeblock:** Für Obsidian ist der Stub eine echte
Datei. Damit funktionieren Autovervollständigung beim Tippen, Backlinks,
Graph-Ansicht, „Nicht verlinkte Erwähnungen" und automatische Link-Aktualisierung
beim Umbenennen — die komplette Wikilink-Semantik, ohne dass wir sie nachbauen.
Ein Codeblock hätte nichts davon.

`title` und `checksum` im Stub sind ein Anzeige-Cache, nicht die Wahrheit.
Maßgeblich ist allein `id`.

### 3.2 Anzeige — embedRegistry

Registrierung der Endung `paperless` bei `app.embedRegistry`. Diese API ist
**inoffiziell**, aber laut REGISTRY (Z. 164, aus `3d-codeblocks`) der einzige
zuverlässige Weg für echte Datei-Embeds — `registerMarkdownPostProcessor`
greift nicht, weil er vor Obsidians Embed-Laden läuft.

Übernommen wird aus `3d-codeblocks/src/obsidian/embed.ts`:

- **Feature-Detection:** nur registrieren, wenn `app.embedRegistry` existiert;
  fehlt sie, entfallen nur die Embeds, das Plugin lädt weiter.
- **Minimale eigene Typ-Deklaration** statt einer Dependency auf
  `obsidian-typings`. Signatur verifiziert: der Creator bekommt die Datei,
  `loadFile()` ist parameterlos.
- **Adapter-um-einen-Kern:** Embed, FileView und ein etwaiger dritter Weg sind
  dünne Adapter um einen gemeinsamen Renderkern.

Zusätzlich `registerExtensions(["paperless"], VIEW_TYPE)` — ein Klick auf den
Stub öffnet das Dokument als eigene View im Pane, wie beim PDF-Viewer.
Nach PROF-OBS-13 gehört dieser Aufruf in `try/catch` mit `Notice`, weil er
wirft, wenn die Endung bereits belegt ist.

### 3.3 Byte-Quelle — Lazy-Cache

Das PDF wird beim ersten Anzeigen per API geholt und als Datei im Vault
abgelegt. Danach rendert **Obsidians eigener PDF-Viewer** diese Datei.

Das ist der wichtigste Zug des Entwurfs: Wir bauen keinen PDF-Renderer und
bündeln kein pdf.js (~1 MB), sondern nutzen, was Obsidian bereits kann.

**Constraint — der Cache darf kein Dot-Ordner sein.** Obsidian ignoriert
Verzeichnisse mit führendem Punkt vollständig; darin liegende Dateien sind
keine `TFile` und für den nativen Viewer unsichtbar.

Der Cache liegt deshalb sichtbar, standardmäßig **`_paperless-storage/` im
Vault-Root** — Muster aus `vim-dojo` (`missionFolder: '_neurovim/'`): Der
Unterstrich sortiert ihn im Dateibaum nach oben und markiert ihn als
Plugin-Bereich. Der Pfad ist in den Einstellungen frei wählbar
(`FolderSuggest` aus dem Kit @0.18.0); eine leere Eingabe fällt auf den Default
zurück, statt Dateien im Vault-Root zu materialisieren.

Dazu:

- **Setting „Cache-Ordner ausblenden"** (Default: an) — blendet den Ordner im
  Dateibaum aus. Umsetzung über ein plugin-eigenes `<style>`-Element mit einer
  Regel auf `[data-path]`, das bei Pfadänderung neu geschrieben und im
  `onunload` entfernt wird (PROF-OBS-13: Cleanup-Disziplin, kein
  `innerHTML`-Write). **Der Pfad muss CSS-escaped werden** — ein Ordnername mit
  Anführungszeichen bräche sonst den Attributselektor auf.
  Obsidians „Ausgeschlossene Dateien" wird **nicht** angefasst: das ist fremde
  Vault-Konfiguration, ein Store-Plugin schreibt dort nicht hinein.
- Der Ordner ist jederzeit löschbar, ohne dass etwas verloren geht — nur
  Wiederherstellbares liegt darin. Das gehört so in die Setting-Beschreibung.
- Empfehlung an Git-Nutzer im README: Ordner in `.gitignore` aufnehmen.
  Das Plugin schreibt **keine** `.gitignore` selbst.

**Ehrlich benannt:** Das ist ein Lazy-Cache, kein Verzicht auf Duplikate.
Angesehene Dokumente liegen doppelt. Der Unterschied zu einem Vollspiegel: nur
was tatsächlich gelesen wurde, ohne Sync-Prozess, jederzeit verwerfbar, und
nicht im Git.

Invalidierung über `checksum` aus `/api/documents/<id>/`: weicht sie vom Stub
ab, wird neu geladen.

### 3.4 API-Client

Verifiziert gegen die laufende Instanz (`documents/views.py`, `paperless/urls.py`):

| Zweck | Route |
|---|---|
| Metadaten | `GET /api/documents/<id>/` |
| Liste/Suche | `GET /api/documents/?query=…` |
| Archiv-PDF | `GET /api/documents/<id>/preview/` |
| Original | `GET /api/documents/<id>/download/?original=true` |
| Vorschaubild | `GET /api/documents/<id>/thumb/` |

Authentifizierung per DRF-Token im Header `Authorization: Token <key>`; der
Token wird in der paperless-Oberfläche erzeugt (`generate_auth_token/`).

Nach **PROF-OBS-12** läuft jeder Call über einen **injizierten Transport** mit
`requestUrl` — nie globales `fetch` (nicht CORS- und nicht mobilsicher),
Antwort über `{ok, status, text}` und `JSON.parse(text)`, nie `await r.json()`.
Streaming braucht das Plugin nicht.

**Aus der REGISTRY übernommen (Z. 18):** Transportfehler werden **mit Status und
Rohbody** geworfen, nicht als `Error("HTTP 401")`. Wer den Body verwirft,
zwingt die Anzeigeschicht zum Raten — in `vault-rag` erschien dadurch ein 401
als „nicht erreichbar (lokal/VPN)" und war nicht diagnostizierbar. Beim
Auslesen der Fehlermeldung sind vier Quellen zu prüfen: `error.message`,
`error`, `message`, `detail`.

### 3.5 Schichten

Nach PROF-OBS-03/04 ist `src/core/` frei von obsidian-Imports und in Node
testbar; ein `check:pure`-Gate erzwingt das (Muster aus `obsidian-paperize`,
inklusive Gegenprobe in beiden Quote-Stilen).

```
src/
  core/                     ← pur, keine obsidian-Imports
    stub.ts                 Stub-Format lesen/schreiben/validieren
    paperless-api.ts        Routen, Request-Bau, Antwort-Parsing
    errors.ts               Status + Rohbody, vier Fehlerquellen
    cache-policy.ts         Cache-Pfad, Checksum-Vergleich, Invalidierung
    settings.ts             Typen, DEFAULT_SETTINGS, mergeSettings
    i18n.ts                 EN kanonisch + DE (PROF-OBS-07)
  obsidian/
    http.ts                 requestUrl-Transport (Muster: image-to-markdown)
    embed.ts                embedRegistry-Adapter
    file-view.ts            FileView für Pane-Ansicht
    render-core.ts          gemeinsamer Kern beider Adapter
    cache-store.ts          Vault-I/O für den Cache
    folder-visibility.ts    <style>-Regel zum Ausblenden, mit Cleanup
    insert-modal.ts         Suchmodal zum Einfügen
    settings-tab.ts         Einstellungen
  main.ts
```

### 3.6 Bedienung

- **Befehl „Dokument einfügen":** Suchmodal über die paperless-Dokumente
  (Filter nach Tag und Korrespondent), legt bei Bedarf den Stub an und fügt
  `![[…]]` an der Cursorposition ein.
- **Befehl „Titel synchronisieren":** benennt Stubs um, deren Titel in
  paperless geändert wurde — über `app.fileManager.renameFile`, damit Obsidian
  alle Links selbst nachzieht.
- **Befehl „Cache leeren".**
- **Einstellungen:**

  | Setting | Default |
  |---|---|
  | Server-URL | leer — ohne sie meldet das Plugin „nicht eingerichtet" statt eines Netzfehlers |
  | API-Token | leer |
  | Cache-Ordner (`FolderSuggest`) | `_paperless-storage/` |
  | Cache-Ordner ausblenden | an |
  | Dateiversion | Archiv-PDF (Alternative: Original) |
  | Embed-Standardhöhe | Obsidian-Default |

**Erstkontakt zählt.** Ein Fremdnutzer installiert das Plugin ohne Server-URL
und Token. Alle Einstiegspunkte — Embed, Modal, Befehl — müssen in diesem
Zustand denselben klaren Hinweis „In den Einstellungen einrichten" zeigen,
nicht einen Netz- oder Auth-Fehler.

Nach UI-STANDARD §1 gibt es **genau einen** `registerView`-Type. Modal und
Einstellungen sind keine Views und fallen nicht darunter.

## 4 Schritt 0 — Spike vor dem Design-Freeze

Eine Annahme trägt den ganzen Entwurf und ist bislang **ungemessen**:

> Lässt sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter
> heraus auf eine Cache-Datei im Vault ansetzen?

Der Spike ist ein Wegwerf-Plugin, das genau das prüft:

1. `.paperless`-Endung bei `embedRegistry` registrieren, Embed rendert einen Kasten.
2. Eine bestehende PDF-Datei aus dem Vault darin über Obsidians Mechanik anzeigen.
3. Prüfen, ob Scrollen, Zoom und Seitennavigation funktionieren.
4. Gegenprobe im Pane über `registerExtensions`.

**Positiv** → dieses Design gilt.
**Negativ** → Ausweichpfad: pdf.js gebündelt (~1 MB, kostet Bundle-Größe und
Store-Review-Aufmerksamkeit) oder Rückfall auf V2 (Codeblock) mit eigenem
Renderer. Die Entscheidung fällt dann mit Messwert statt Vermutung.

Zeitrahmen: eine Sitzung. Ergebnis wird in der REGISTRY vermerkt — die Frage
„kann man Obsidians PDF-Viewer fremdansteuern?" ist über dieses Plugin hinaus
wiederverwendbar.

## 5 Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| Server nicht erreichbar, Cache vorhanden | Aus Cache rendern, dezenter Hinweis „offline" |
| Server nicht erreichbar, kein Cache | Platzhalter mit Titel aus dem Stub, Grund, Wiederholen-Schaltfläche |
| 401/403 | Klartext „Token ungültig", Verweis auf die Einstellungen — **nicht** als Netzfehler ausgeben |
| 404 | „Dokument existiert in paperless nicht mehr" mit ID; Stub bleibt liegen |
| Stub unlesbar/kaputt | Fehlerkasten mit Dateipfad, kein stiller Fallback |
| Cache-Schreiben scheitert (Platz) | Einmalig rendern ohne Cache, Meldung |

## 6 Sicherheit

- Der API-Token liegt in `data.json` unter
  `.obsidian/plugins/paperless-storage/`. Wer seinen Vault versioniert, muss
  wissen, dass der Token dort im Klartext steht — **gehört ins README**, weil
  Vaults unterschiedlich mit `.obsidian/` umgehen.
  *(Im Pallas-Vault ist `.obsidian/` vom Commit ausgeschlossen —
  `git add -A -- ':(exclude).obsidian'` im `clean-shutdown` —, der Token liegt
  dort also nicht im Git. Vor der ersten Konfiguration einmal bestätigen statt
  annehmen.)*
- Ein Token hat die Rechte seines Benutzers. Ein eigener Lesebenutzer in
  paperless ist die sauberere Form; als Empfehlung ins README, nicht erzwungen.
- Es entstehen **keine** Share-Links. Kein Dokument wird öffentlich erreichbar.
  Das ist der Kernunterschied zu den bestehenden Plugins.
- Der Cache enthält Klartext-PDFs im Vault. Für sensible Dokumente ist der
  Pane-Weg ohne Cache vorzusehen — als Einstellung, nicht als Vorgabe.
- Der Token wird **nur** an die konfigurierte Server-URL gesendet, an keine
  dritte Adresse. Keine Telemetrie, keine automatischen Verbindungen — der
  Store-Review prüft genau das.

## 7 Test

- **Unit** auf `src/core/` mit vitest nach dem Skill
  `obsidian-plugin-test-pattern` (Obsidian-Mock aus `obsidian-kit/testing`).
- **CORE-TEST-02 (a)+(b):** Ein Lauf gegen die **echte** paperless-Instanz ist
  Pflicht, bevor ein Pfad als abgesichert gilt, und das Werkzeug gehört
  **getrackt ins Repo** — nicht in einen Scratchpad. Vorgesehen:
  `scripts/paperless-lab.ts`, das denselben Produktionscode aus `src/core/`
  gegen eine echte Instanz fährt (Metadaten, Preview-Bytes, 401-Verhalten mit
  falschem Token, 404 mit unbekannter ID), angebunden an `typecheck`. Ein
  gemockter paperless-Server würde genau die Eigenschaft verbergen, für die es
  die Gegenstelle gibt.
  **Instanz-URL und Token kommen aus Umgebungsvariablen** (`PAPERLESS_URL`,
  `PAPERLESS_TOKEN`), nicht hartkodiert — sonst wandert eine private Adresse in
  ein öffentliches Repo und das Skript ist für Mitlesende wertlos.
- **GUI-Smoke** über den Skill `gui-smoke-setup` (CDP gegen ein laufendes
  Obsidian), sobald das Embed steht. Ohne `Page.bringToFront` bleibt die View
  leer und man debuggt ein Phantom.

## 8 Wiederverwendung aus dem Bestand

Kit-first-Regel Punkt 1 erfüllt — REGISTRY und `obsidian-kit/README.md` geprüft:

| Baustein | Quelle | Nutzung |
|---|---|---|
| `endpoint_config` (`EndpointConfig{url, apiKey}`, `authHeaders()`) | Kit @0.23.0 | Server-URL + Token |
| i18n-Engine (`defineStrings`, `t`, `pickLang`) | Kit | PROF-OBS-07 |
| `collapsibleSection`, `confirmAction` | Kit | Einstellungen, „Cache leeren" |
| `createObsidianMock` | Kit `testing` | Unit-Tests |
| embedRegistry-Adapter samt Typ-Deklaration | `3d-codeblocks/src/obsidian/embed.ts` | §3.2 — **übernehmen, nicht neu bauen** |
| Adapter-um-einen-Kern | `3d-codeblocks/src/obsidian/viewer-host.ts` | §3.5 |
| `requestUrl`-Transport | `image-to-markdown/src/http.ts` | §3.4 |
| Fehlerbody-Auswertung (vier Quellen) | `vault-crews/src/core/chat-response.ts`, `vault-rag/src/chat_error.ts` | §3.4 |
| `check:pure`-Gate mit Gegenprobe | `obsidian-paperize/scripts/check-pure.mjs` | §3.5 |
| Release-Infra | Skill `plugin-release-setup` + `tools/release-template/` | PROF-OBS-09 |

Nach dem Bau: Registry-Eintrag für den PDF-Anzeige-Befund (Kit-first Punkt 2).

## 9 Persönlicher Rollout — **kein Produktbestandteil**

> Dieser Abschnitt beschreibt den Umzug der Bestands-PDFs im Pallas-Vault.
> Er ist Betriebsvorgang, nicht Feature: nichts davon wird ausgeliefert, und
> keine der hier genannten Pfade oder Ordnernamen gehört in den Code.

**Stufe 1 — allgemeine Ablage (31 PDFs in `50_Ressourcen/30_Storage`).**
Nach paperless hochladen, Stubs erzeugen, `![[x.pdf]]` durch
`![[x.paperless]]` ersetzen, Original erst nach Sichtprüfung löschen.
Aus dem **Vault-Git** verschwindet dabei der Großteil der 159 MB dauerhaft; auf
der Platte kehrt ein Teil als Cache zurück (§3.3), aber nur für tatsächlich
gelesene Dokumente und jederzeit verwerfbar.

**Stufe 2 — verstreute Einzeldokumente.** Fallweise, ohne Automatik.

**Stufe 3 — Projektakten (`26-010 Rechtstreit BU-Versicherung`,
`26-007 ASS Diagnostik BKH`).** Vorerst **nicht** migrieren. Laufendes
Verfahren und Gesundheitsdaten; die Entscheidung fällt, wenn das Plugin sich
im Alltag bewährt hat und der Backup-Timer steht.

**Vorbedingung für jede Stufe:** Sobald PDFs nur noch auf dem VPS liegen,
hängen die Notizen an dessen Backup. Der Backup-Timer nach dem Muster
`forgejo-backup`/`n8n-backup` mit Off-Site-Ziel ist damit **Voraussetzung der
Migration**, nicht ihr Nachklapp. Vor Stufe 1 zu erledigen.

## 10 Veröffentlichung

Das Plugin geht in den Community-Store, muss also für fremde Vaults ohne
Vorwissen funktionieren.

- **Release-Infra** über den Dach-Skill `plugin-release-setup` +
  `tools/release-template/` (PROF-OBS-09): Ein-Befehl-Release, drei Dateien
  synchron (`package.json`/`manifest.json`/`versions.json`), Forgejo als
  `origin`, GitHub als CI-Trigger.
- **Der Tag ist nicht das Ende.** Seit *Obsidian Community* (Mai 2026) läuft der
  Store-Review **nicht** von selbst an — er ist im Developer Dashboard als
  Rescan anzustoßen (gemessen 2026-08-05 an vault-rag 0.19.0). Fällt eine
  Version durch, verschwindet **das Plugin** binnen 24 h aus der Suche.
- **`npm run lint` vor jedem Tag** — der Scanner ist `eslint-plugin-obsidianmd`
  und lokal reproduzierbar. Per-file-Overrides machen diese Vorschau blind.
- **Kein `eval`/`new Function`** im Bundle (PROF-OBS-12), sonst flaggt das
  Portal „Dynamic Code Execution".
- **Die inoffizielle `embedRegistry`-API ist store-verträglich**, solange sie
  per Feature-Detection abgesichert ist — `3d-codeblocks` ist damit im Store.
  Fehlt sie, entfallen nur die Embeds.
- **README** trägt: Einrichtung (URL + Token erzeugen), die Token-Ablage in
  `data.json`, die Empfehlung eines eigenen Lesebenutzers, den
  `.gitignore`-Hinweis für den Cache-Ordner, und die ausdrückliche Abgrenzung
  „liest nur, lädt nichts hoch".
- **Lizenz:** MIT, wie die übrigen Plugins des Dachs.

## 11 Offene Punkte

- **Ergebnis des Spikes aus §4** — alles Weitere hängt daran.
- **`isDesktopOnly` im Manifest: noch nicht entscheidbar.** Ob `embedRegistry`
  und der native PDF-Viewer auf Obsidian Mobile tragen, ist ungeprüft. Der
  Spike sollte es mitbeantworten; bis dahin ist der Manifest-Wert offen. Ein
  Store-Plugin, das auf Mobile still nichts tut, ist ein Review-Risiko —
  lieber ehrlich `isDesktopOnly: true` als eine leere Fläche.
- **Verhalten mehrerer Vaults gegen dieselbe Instanz** — Cache und Stubs sind
  vault-lokal, das sollte tragen, ist aber ungeprüft.
- **Umgang mit gelöschten Dokumenten:** Der Stub bleibt liegen und zeigt einen
  404-Platzhalter (§5). Ob es zusätzlich einen Aufräum-Befehl braucht
  („verwaiste Stubs finden"), entscheidet die Praxis.
- Die rund 40 reinen `[[x.pdf]]`-Links (ohne `!`) im Pallas-Vault sind im
  Rollout (§9) noch nicht betrachtet.
