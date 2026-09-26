# Aufnahme-Vertrag — README-Bilder

Dieser Ordner hält die Bilder, die `README.md` und `README.de.md` einbetten. Diese Datei ist der **Vertrag** dafür: welche Bilder es gibt, was jedes zeigen muss, in welcher Klasse es steht und wie man sie reproduzierbar neu aufnimmt. Geprüft wird er von `readme_lint.py` (`npm run shots:check`): Vertrag, Dateien und README-Einbettungen werden in alle Richtungen abgeglichen.

## Status

Stand 2026-09-26: alle vier Bilder stehen, aufgenommen in einer Zweitinstanz (Obsidian 1.14.2, Oberflächensprache Englisch, helles Theme) gegen den Demo-Server aus `scripts/demo-paperless.ts`. Die echte Test-Instanz wird für Bilder **nicht** benutzt: sie hält private Unterlagen, und jeder lesbare Titel ginge mit dem Repo um die Welt. Die Bilder zeigen deshalb erfundene Dokumente (*Acme Consulting*, *Jane Doe*); der Demo-Server spricht nur die vier Routen, die das Plugin braucht.

Zwei Eingriffe des Treibers, die in den Bildern stecken und hier stehen, damit sie nicht als Auslieferungszustand gelesen werden: **Default embed height** ist für `hero.png` und `offline-cache.png` auf 520 px gesetzt (eine A4-Seite ist sonst höher als das Fenster), und `settings.png` zeigt statt der Demo-Adresse `https://paperless.lan` — nur in der Darstellung, der gespeicherte Wert wird nicht angefasst. Das Einstellungsbild läuft mit dem Auslieferungszustand (Embed-Höhe leer).

## Bilder

| Datei | Klasse | Referenziert von | Muss zeigen |
|---|---|---|---|
| `hero.png` | hero | `README.md`, `README.de.md` (Kopf) | Die Notiz **Home office** in der Leseansicht: über- und unterhalb des Embeds Text, dazwischen das PDF **Service Agreement** in Obsidians eigenem PDF-Betrachter (Werkzeugleiste, Seite 1 von 1). Im Dateibaum links die Stub-Datei `Acme Consulting — Service…` mit der Marke PAPERLESS, der Cache-Ordner ist ausgeblendet. Keine Meldung im Embed. |
| `insert-document.png` | feature | `README.md`, `README.de.md` (Usage) | Das Suchfenster des Befehls **Paperless Storage: Insert document** mit der Eingabe `2026` und vier Treffern (Titel, keine weiteren Spalten). Eng auf das Fenster beschnitten. |
| `offline-cache.png` | feature | `README.md`, `README.de.md` (Usage) | Dieselbe Notiz mit abgeschaltetem Server: über dem PDF steht **Server unreachable — showing cached copy.** — das Dokument bleibt lesbar. |
| `settings.png` | feature | `README.md`, `README.de.md` (Configuration) | Der Einstellungen-Tab mit allen sechs Zeilen: **Server URL**, **API token** (maskiert), **Cache folder**, **Hide cache folder** (an), **File version** (Archive), **Default embed height** (leer, Platzhalter „Obsidian default“). |

## Einbettung

| Klasse | Einbettung | Grenze |
|---|---|---|
| `hero` | `width="820"`, zentriert, nach dem Kontextabsatz | Querformat (H ≤ B) |
| `feature` | `width="820"` | H/B ≤ 1.6 |

## Reproduktion

Aufgenommen wird in einer **Zweitinstanz** auf eigenem Port; die reguläre Instanz (9222) bleibt unberührt. Ein Prozess-Neustart der Zweitinstanz ist gefahrlos, weil er nur sie trifft.

```bash
# 1. Vault aus dem Fixture bauen (Notizen, Stub, Konfiguration) + Demo-Zugangsdaten schreiben
npm run build && npm run shots -- --setup

# 2. Zweitinstanz: eigenes Profil, Sprache Englisch (obsidian.json UND localStorage "language"),
#    aktuelle obsidian-*.asar ins Profil, Vault in obsidian.json eintragen, dann starten
/Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=<port> &

# 3. Lock für den eigenen Port, aufnehmen, freigeben
python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label paperless-storage --intent "shots.ts" --exclusive focus --port <port> --ttl 600
npm run shots -- --port <port>            # alles; --only hero.png für eines
python3 ~/.claude/hooks/obsidian-cdp-lock.py release

# 4. Vertrag, Dateien und README abgleichen
npm run shots:check
```

Der Vault entsteht unter `$STAGING_VAULTS_DIR/paperless-storage` und ist jederzeit wegwerfbar: sein Inhalt kommt vollständig aus `fixture/`. Der Treiber bricht ab, wenn die Oberflächensprache nicht Englisch ist. Wird das Fenster nach dem ersten Lauf `visibilityState=hidden`, hilft ein Neustart der Zweitinstanz. Nach der Aufnahme steht im Vault die Demo-Adresse in `data.json`; für den GUI-Smoke gegen die echte Instanz `npm run smoke:gui -- --setup` neu fahren.

## UI-Strings (verbatim aus `src/`)

- Befehle (die Befehlspalette stellt „Paperless Storage: “ voran): **Insert document** · **Synchronize document titles** · **Clear document cache**
- Meldung im Embed: **Loading document…** · **Server unreachable — showing cached copy.**
- Einstellungen: **Server URL** · **API token** · **Cache folder** · **Hide cache folder** · **File version** (**Archive (searchable PDF)** / **Original**) · **Default embed height**
