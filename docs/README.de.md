# Paperless Storage — Dokumentation

Gegliedert nach [Diátaxis](https://diataxis.fr/): Lernen, Tun, Nachschlagen und Verstehen sind vier verschiedene Bedürfnisse. Das Plugin ist klein, deshalb stehen die zwei wichtigsten Teile auf dieser einen Seite.

**Neu hier?** → [Erste Schritte](#erste-schritte) — von der Installation bis zum ersten eingebetteten Dokument.

**Etwas funktioniert nicht?** → [Fehlerbehebung](#fehlerbehebung) — Symptome, Ursachen, Abhilfe und wo es Hilfe gibt.

English: [documentation in English](README.md). Bei Abweichungen gilt die englische Fassung.

`SMOKE.md` und `superpowers/` in diesem Ordner sind Material für Maintainer (GUI-Smoke-Checkliste, Entwurfs-Specs), keine Nutzer-Doku.

## Erste Schritte

Du brauchst eine laufende paperless-ngx-Instanz, die dein Obsidian-Gerät erreicht, und ein Benutzerkonto darauf.

1. Plugin installieren: Einstellungen → Community-Plugins → Durchsuchen → „Paperless Storage" → Installieren → Aktivieren.
2. In paperless einen API-Token anlegen: Benutzermenü → Mein Profil → API-Authentifizierungs-Token, und den Token kopieren (der Kreispfeil erzeugt einen neuen).
3. Einstellungen → Paperless Storage öffnen. **Server URL** eintragen (die Adresse, unter der du paperless öffnest, z. B. `https://paperless.example.org`) und den Token bei **API token** einfügen. Das Token-Feld ist maskiert; beide Werte werden beim Tippen gespeichert.
4. Eine beliebige Notiz im Editor öffnen und die Befehlspalette (Strg/Cmd+P) → **Paperless Storage: Insert document** ausführen.
5. Einen Suchbegriff tippen. Die Treffer kommen aus der Volltextsuche von paperless (höchstens 20). Ein Dokument wählen.

Das Plugin legt neben der Notiz eine kleine Datei `<Titel>.paperless` an und setzt `![[<Titel>.paperless]]` an die Cursorposition. Beim ersten Anzeigen steht kurz „Loading document…" (bzw. „Dokument wird geladen…"), dann erscheint Obsidians eigener PDF-Betrachter in der Notiz. Jetzt siehst du das Dokument, scroll- und zoombar, in der Notiz.

Als Nächstes:

- Ein Klick auf die `.paperless`-Datei im Dateibaum öffnet das Dokument in einem eigenen Tab.
- **Paperless Storage: Synchronize document titles** ausführen, nachdem du Dokumente in paperless umbenannt hast — der Befehl benennt die Stub-Dateien passend um. Obsidian zeigt dabei je Umbenennung ggf. „Interne Links aktualisieren?"; bestätige den Dialog, der Befehl wartet darauf.
- **Paperless Storage: Clear document cache** entfernt die heruntergeladenen PDFs (beim nächsten Anzeigen werden sie neu geladen).

Heruntergeladene PDFs liegen im Cache-Ordner (Standard `_paperless-storage/` im Vault-Wurzelordner). Ein einmal geöffnetes Dokument bleibt offline lesbar. Das Plugin prüft beim Server nicht, ob es eine neuere Fassung eines gecachten Dokuments gibt — zum erneuten Laden den Cache leeren.

Die Befehlsnamen sind englisch, auch bei deutscher Obsidian-Oberfläche.

## Fehlerbehebung

Die meisten Meldungen erscheinen in der Einbettung selbst, einige als Hinweis oben rechts. Die deutschen Texte gelten bei deutscher Obsidian-Sprache; bei englischer erscheinen die englischen Fassungen aus der [englischen Doku](README.md#troubleshooting).

### „Paperless Storage ist noch nicht eingerichtet — bitte in den Plugin-Einstellungen konfigurieren."

**Ursache:** Server URL oder API token ist leer.

**Abhilfe:** Beides unter Einstellungen → Paperless Storage ausfüllen.

### „API-Token abgelehnt. Bitte in den Plugin-Einstellungen prüfen."

**Ursache:** paperless antwortete mit 401 oder 403. Der Token ist falsch, wurde neu erzeugt, gehört zu einem Benutzer ohne Recht auf das Dokument, oder eine Anmeldeseite vor paperless (ein Reverse-Proxy mit eigener Anmeldung) antwortet statt paperless.

**Abhilfe:** Den Token neu erzeugen (Mein Profil → API-Authentifizierungs-Token) und ohne Leerzeichen am Anfang oder Ende einfügen. Die Server URL im Browser öffnen und prüfen, dass dort direkt paperless erscheint. Ein bereits gecachtes Dokument siehst du weiterhin, mit diesem Text darüber.

**Symptom in der Suche:** Eine leere Trefferliste ist das übliche Zeichen für einen falschen Token; der Hinweis oben erscheint einmal je Suchfenster.

### „Server nicht erreichbar, keine zwischengespeicherte Fassung vorhanden."

**Ursache:** Das Dokument wurde auf diesem Gerät noch nie geladen, und der Server war nicht erreichbar (oder antwortete mit einem Fehler) — falsche Adresse, http statt https, falscher Port, Server aus, ein Zertifikat, dem Obsidian nicht traut, oder das Handy ist außerhalb des Netzes, das paperless erreicht.

**Abhilfe:** Die Server URL im Browser desselben Geräts öffnen. Dieselbe Adresse in den Einstellungen eintragen, ohne Pfad wie `/api`. Am Handy mit dem VPN bzw. dem Netz verbinden, in dem paperless liegt.

### „Server nicht erreichbar — zwischengespeicherte Fassung."

**Ursache:** Das Dokument ist gecacht, aber die Metadaten vom Server waren nicht zu bekommen (offline, Server down oder ein anderer Fehler). Der Text erscheint auch, wenn das Dokument in paperless gelöscht wurde, während eine gecachte Kopie im Vault liegt.

**Abhilfe:** Nichts geht verloren — die gecachte Kopie wird angezeigt. Ist der Server wieder erreichbar, verschwindet der Text beim nächsten Anzeigen der Einbettung.

### „Dokument 42 existiert in paperless nicht mehr."

**Ursache:** paperless antwortete für diese Dokumentnummer mit 404 und es gibt keine gecachte Kopie: das Dokument wurde gelöscht, oder die `.paperless`-Datei zeigt auf eine andere paperless-Instanz.

**Abhilfe:** Das Dokument mit **Insert document** neu einfügen oder die `.paperless`-Datei öffnen und die `id` korrigieren.

### „Diese .paperless-Datei ist nicht lesbar: Invalid .paperless stub: …"

**Ursache:** Eine `.paperless`-Datei muss ein JSON-Objekt mit ganzzahliger `id` sein. Der Grund nach dem Doppelpunkt sagt, was fehlt: `not valid JSON`, `not an object` oder `missing or non-integer 'id'`.

**Abhilfe:** Die Datei korrigieren, zum Beispiel:

```json
{
  "id": 123,
  "title": "Mietvertrag"
}
```

`id` ist die Nummer in der paperless-Adresse des Dokuments (`/documents/123/details`). `title` ist nur eine Beschriftung.

### „Geladen, konnte aber nicht zwischengespeichert werden: …"

**Ursache:** Das Dokument wurde geladen, aber Obsidian konnte es nicht in den Cache-Ordner schreiben — Platte voll, schreibgeschützter Vault oder ein Ordner, den dein Sync-Werkzeug sperrt. Das Dokument wird in diesem Fall nicht angezeigt.

**Abhilfe:** Speicherplatz schaffen oder die Ordnerrechte korrigieren, dann die Notiz neu laden. Prüfen, dass **Cache folder** auf einen Ordner im Vault zeigt.

### „Paperless storage: embeds unavailable in this Obsidian version." oder „PDF viewer unavailable in this Obsidian version."

**Ursache:** Das Plugin erreicht Obsidians PDF-Betrachter über eine Schnittstelle, die Obsidian nicht dokumentiert. Diese Obsidian-Version bietet sie nicht, also lassen sich Einbettungen nicht zeichnen. Beide Texte erscheinen immer auf Englisch.

**Abhilfe:** Obsidian aktualisieren. Die Befehle laufen weiter; Vollansicht und Einbettung brauchen denselben PDF-Betrachter.

### „Insert document" findet nichts

**Ursache:** Die Suche nutzt den Volltextindex von paperless, zeigt höchstens 20 Treffer und zeigt bei jedem Fehler außer einem abgelehnten Token eine leere Liste (falsche Adresse, Server aus). Dokumente, die paperless noch nicht indexiert hat, werden nicht gefunden.

**Abhilfe:** Dieselbe Suche in der Weboberfläche von paperless versuchen. Findet sie das Dokument dort, Server URL und Token wie oben prüfen. Der Befehl funktioniert nur, solange eine Notiz im Editor offen ist.

### Die Einbettung zeigt eine alte Fassung des Dokuments

**Ursache:** Ein bereits gecachtes Dokument wird nicht erneut mit dem Server verglichen.

**Abhilfe:** **Paperless Storage: Clear document cache** ausführen und die Einbettung erneut anzeigen.

### Der Cache-Ordner ist im Dateibaum noch sichtbar — oder verschwunden

**Ursache:** **Hide cache folder** blendet nur die Ordnerzeile im Dateibaum aus; Ordner und Dateien bleiben im Vault und werden wie alles andere synchronisiert. Es gilt für den unter **Cache folder** eingetragenen Ordner. Benennst du den Cache-Ordner in den Einstellungen um, wird der alte Ordner weder verschoben noch gelöscht und ist wieder sichtbar; neue Downloads landen im neuen Ordner.

**Abhilfe:** **Hide cache folder** nach Bedarf an- oder ausschalten. Einen alten Cache-Ordner von Hand löschen, wenn du ihn nicht mehr brauchst. **Clear document cache** entfernt nur die PDFs im aktuell eingestellten Ordner.

### Ein Umbenennen wirkt eingefroren

**Ursache:** Obsidian fragt „Interne Links aktualisieren?", sobald eine `.paperless`-Datei umbenannt wird, weil es die Dateiendung nicht kennt — auch bei aktivem „Links immer aktualisieren". Der Titel-Abgleich wartet hinter diesem Dialog.

**Abhilfe:** Den Dialog suchen und bestätigen, dann läuft der Befehl weiter.

## Hilfe bekommen

Kommst du nicht weiter? [Eröffne ein Issue](https://github.com/johannes-kaindl/paperless-storage/issues) mit deiner Obsidian-Version, der Plugin-Version (Einstellungen → Community-Plugins) und dem, was du erwartet hast. Füge deinen API-Token nicht ein.
