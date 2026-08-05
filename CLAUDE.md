# CLAUDE.md — paperless-storage

Obsidian-Plugin, das Dokumente aus einer **paperless-ngx**-Instanz nativ in Notizen
einbettet: `![[Mietvertrag.paperless]]` zeigt das PDF im Lesefluss, geladen per
API-Token statt über öffentliche Share-Links.

**Stand 05.08.2026: Spec und Plan liegen, kein Code.** Erster Handgriff ist der Spike
(Aufgabe 2 des Plans) — er ist ein **Gate**, kein Aufwärmen.

## Vor dem Anfangen lesen

| Was | Wo |
|---|---|
| Design und Begründungen | `docs/superpowers/specs/2026-08-05-paperless-storage-design.md` |
| Umsetzungsplan Phase 1 | `docs/superpowers/plans/2026-08-05-paperless-storage-phase-1.md` |
| Dach-Konventionen (**verbindlich**) | `../AGENTS.md`, `../UI-STANDARD.md`, `../REGISTRY.md` |
| Globale Standards | `/Users/Shared/code/_docs/CONVENTIONS.md` (PROF-OBS-Regeln) |

**Kit-first-Regel:** Vor dem Lösen eines Problems `../REGISTRY.md` und
`../obsidian-kit/README.md` prüfen — ist es in einem Nachbar-Plugin schon gelöst, wird
die bestehende Lösung übernommen. Nach dem Lösen eines nicht-trivialen Problems:
Registry-Eintrag ergänzen.

## Das Gate

Der ganze Entwurf hängt an einer **ungemessenen** Annahme:

> Lässt sich Obsidians nativer PDF-Viewer aus einem `embedRegistry`-Adapter heraus auf
> eine Cache-Datei im Vault ansetzen?

Trägt der Spike nicht, wird der Plan ab Aufgabe 9 neu geschrieben (pdf.js bündeln oder
Codeblock-Weg). Die Entscheidungstabelle steht in Aufgabe 2. **Nicht darüber
hinwegplanen.** Der Spike beantwortet zugleich `isDesktopOnly` fürs Manifest.

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

Server-Betrieb, Backup und Ressourcenlage sind hier nicht Thema; sie stehen in
`/Users/Shared/40_Tools/paperless-ngx/CLAUDE.md` und im Vault-Hub
`10_Pallas/60_Bereiche/70_Lernen/paperless-ngx/paperless-ngx.md`.

## Sprache

Prosa, Kommentare und Commit-Messages **Deutsch**; nutzersichtbare Strings **Englisch**
(EN kanonisch, DE daneben — PROF-OBS-07).
