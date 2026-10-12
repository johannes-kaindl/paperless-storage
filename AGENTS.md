# paperless-storage — AGENTS.md

Obsidian-Plugin, das Dokumente aus einer **paperless-ngx**-Instanz nativ in Notizen
einbettet: `![[Mietvertrag.paperless]]` zeigt das PDF im Lesefluss, geladen per
API-Token statt über öffentliche Share-Links.

**Stand 0.3.2 (2026-10-03), im Community Store.** Das Plugin bettet paperless-Dokumente per `![[…paperless]]` (embedRegistry-Adapter) und als eigene FileView ein, hat einen lokalen Cache mit konfigurierbarem, ausblendbarem Cache-Ordner, die Befehle "Insert document", "Clear document cache" und "Synchronize document titles" sowie einen deklarativen Settings-Tab mit Hilfe-Zeile. Der GUI-Smoke (`npm run smoke:gui -- --port <port>`, `docs/SMOKE.md`) fährt in einer Zweitinstanz und zählt in vier Zuständen; ohne `PAPERLESS_URL`/`PAPERLESS_TOKEN` fährt er gegen den Demo-Server (`scripts/demo-paperless.ts`), mit ihnen gegen die echte Instanz; die Abschlusszeile nennt die Gegenstelle.

## Vor dem Anfangen lesen

| Was | Wo |
|---|---|
| Design, Pläne und Spikes | Specs und Pläne liegen im Vault-Cockpit unter `_SDD/` (CORE-META-14): `2026-08-05-paperless-storage-design.md`, `2026-08-05-paperless-storage-phase-1.md` |
| Dach-Konventionen (**verbindlich**) | `../AGENTS.md`, `../UI-STANDARD.md`, `../REGISTRY.md` |
| Globale Standards | `../../_docs/CONVENTIONS.md` (PROF-OBS-Regeln) — maintainer-lokal, nicht Teil dieses Repos |

**Kit-first-Regel:** Vor dem Lösen eines Problems `../REGISTRY.md` und
`../obsidian-kit/README.md` prüfen — ist es in einem Nachbar-Plugin schon gelöst, wird
die bestehende Lösung übernommen. Nach dem Lösen eines nicht-trivialen Problems:
Registry-Eintrag ergänzen.

## Das Gate (Spike, beantwortet)

Der Entwurf hing zu Beginn (August 2026) an einer **ungemessenen** Annahme:

> Lässt sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter heraus auf
> eine Cache-Datei im Vault ansetzen?

Beantwortet: ja, der Viewer trägt (GUI-Smoke Punkt 3 seit 2026-08-06 grün gegen die echte Instanz), `isDesktopOnly` steht im Manifest auf `false`. Fällt Punkt 3 künftig rot, ist das ein Befund an dieser Annahme, kein Treiberfehler.

## Was dieses Plugin von den Nachbarn unterscheidet

- **Es spricht mit einem fremden Server.** Damit gilt CORE-TEST-02 scharf: Ein Lauf gegen
  die echte Instanz ist Pflicht, bevor ein Pfad als abgesichert gilt, und das Werkzeug
  gehört getrackt ins Repo (`scripts/paperless-lab.ts`, Aufgabe 8). Ein gemockter
  paperless-Server verbirgt genau das, wofür es die Gegenstelle gibt.
- **Es nutzt eine inoffizielle API** (`app.embedRegistry`). Immer mit Feature-Detection —
  Muster und Typ-Deklaration aus `../3d-codeblocks/src/obsidian/embed.ts` übernehmen,
  nicht neu erfinden.
- **Es geht in den Community-Store.** Keine Pfade, Ordnernamen oder Annahmen aus dem
  Pallas-Vault im Code. Der Cache-Ordner heißt per Default `_paperless-storage/` im
  Vault-Root und ist konfigurierbar (Muster: `vim-dojo`, `missionFolder: '_neurovim/'`).
- **Kit wird gevendored, nie als npm-Dependency eingebunden** — eine git-Dependency auf
  `git.jkaindl.de` könnten weder Store-Nutzer noch die GitHub-CI auflösen.

## Test-Instanz

`https://paperless.jkaindl.de` (paperless-ngx v3.0.5). Zugangsdaten im Passwort-Manager;
API-Token in der paperless-Oberfläche erzeugen. Das Lab-Skript liest `PAPERLESS_URL` und
`PAPERLESS_TOKEN` aus der Umgebung — **keine Adresse und kein Token in den Code.**
Derselbe Umgebungsvertrag gilt für `scripts/gui-smoke.ts -- --setup` (s. `docs/SMOKE.md`):
der getrackte Fixture-Vault (`docs/images/fixture/`) enthält nie Zugangsdaten, die kommen
erst beim Vault-Aufbau aus der Umgebung in die (nicht getrackte) `data.json`.

Server-Betrieb, Backup und Ressourcenlage sind hier nicht Thema; sie stehen in
`40_Tools/paperless-ngx/CLAUDE.md` (maintainer-lokal) und im Vault-Hub
`10_Pallas/60_Bereiche/70_Lernen/paperless-ngx/paperless-ngx.md`.

## Sprache

Prosa, Kommentare und Commit-Messages **Deutsch**; nutzersichtbare Strings **Englisch**
(EN kanonisch, DE daneben — PROF-OBS-07).
