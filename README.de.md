# Paperless Storage

**Dokumente aus deiner [paperless-ngx](https://docs.paperless-ngx.com/)-Instanz direkt
in Notizen einbetten — im Lesefluss, nicht über einen Link.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/paperless-storage?label=release)](https://github.com/johannes-kaindl/paperless-storage/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20Desktop%20%26%20Mobil-7c3aed)

> [🇬🇧 English](https://github.com/johannes-kaindl/paperless-storage/blob/main/README.md) · 🇩🇪 Deutsch

> **Hinweis:** Diese Übersetzung folgt der englischen README. Bei Abweichungen gilt die englische Fassung.

paperless-ngx kann öffentliche Freigabe-Links für ein Dokument erzeugen, aber so ein
Link kennt keine Anmeldung — wer die URL hat, hat das Dokument, und sie stünde im
Klartext in deiner Notiz (und in der Git-Historie deines Vaults). Für Steuerunterlagen,
Verträge oder Arztbriefe ist das der falsche Handel. Dieses Plugin holt Dokumente
stattdessen mit deinem **API-Token** und legt außer einer kleinen Stub-Datei nichts im
Vault ab — und gibt nichts nach außen.

## Features

- **PDF-Einbettung in der Notiz** — `![[Mietvertrag.paperless]]` rendert das Dokument
  direkt in der Notiz, über Obsidians eigenen PDF-Betrachter (scrollbar, zoombar, kein
  mitgelieferter Renderer).
- **Befehl „Insert document"** (Befehlspalette, bei geöffneter Notiz) öffnet eine Suche über deine paperless-Bibliothek und
  setzt die Einbettung an der Cursorposition ein.
- **In eigenem Tab öffnen** — ein Klick auf eine `.paperless`-Datei im Dateibaum öffnet
  das Dokument wie jede andere Datei, nicht nur als Einbettung.
- **Titel-Abgleich** — der Befehl „Synchronize document titles“ benennt Stub-Dateien nach dem aktuellen Dokumenttitel
  auf dem Server um.
- **Lokaler Cache** — heruntergeladene PDFs liegen im Vault, ein einmal geöffnetes
  Dokument bleibt also offline lesbar; ein Befehl leert den Cache bei Bedarf.
- **API-Token statt öffentlicher Links** — nichts verlässt deinen Vault und deine
  eigene paperless-Instanz.

## Voraussetzungen

- **Obsidian 1.8.7+**, Desktop und Mobil (`isDesktopOnly: false` — das Plugin nutzt keine Node- oder Electron-API: es holt über Obsidians `requestUrl`, cacht über die Vault-API und zeigt Dokumente im eingebauten PDF-Betrachter).
- Eine erreichbare **paperless-ngx**-Instanz und ein **API-Token** dafür (in den
  Einstellungen von paperless selbst anzulegen).

## Installation

### Community-Plugins

Einstellungen → Community-Plugins → Durchsuchen → „Paperless Storage“ → Installieren → Aktivieren.

### Von Hand

`main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://github.com/johannes-kaindl/paperless-storage/releases) herunterladen, nach `<vault>/.obsidian/plugins/paperless-storage/` kopieren und das Plugin aktivieren.

### BRAT (Beta)

`johannes-kaindl/paperless-storage` in [BRAT](https://github.com/TfTHacker/obsidian42-brat) eintragen.

### Aus dem Quelltext

```bash
git clone https://git.jkaindl.de/jkaindl/paperless-storage
cd paperless-storage && npm install && npm run build
# main.js manifest.json styles.css nach <vault>/.obsidian/plugins/paperless-storage/ kopieren
```

## Verwendung

1. **Einstellungen → Paperless Storage** öffnen und Server-URL sowie API-Token
   eintragen.
2. **Paperless Storage: Insert document** aus der Befehlspalette ausführen, in der paperless-Bibliothek suchen und die Einbettung an der Cursorposition einsetzen. (Die Befehlsnamen sind englisch.)
3. Die Einbettung lädt das Dokument beim ersten Anzeigen herunter und legt es im Cache ab; danach rendert sie aus dem Cache, auch offline. Für eine neuere Fassung **Clear document cache** ausführen.
4. Ein Klick auf eine `.paperless`-Datei im Dateibaum öffnet sie in einem eigenen Tab, genau wie eine native Datei.
5. **Synchronize document titles** benennt Stub-Dateien nach ihrem aktuellen Titel auf dem Server um.
6. **Clear document cache** entfernt die heruntergeladenen PDFs.

### Zum Umbenennen

Obsidian zeigt beim Umbenennen einer `.paperless`-Datei seinen eigenen Dialog
„Interne Links aktualisieren?" — auch beim Titel-Abgleich oben, und auch dann, wenn in
Obsidians Einstellungen „Links immer aktualisieren" aktiv ist. Grund ist, dass
`.paperless` eine nicht registrierte Dateiendung ist. Wirkt ein Umbenennen-Befehl wie
eingefroren, lohnt der Blick auf diesen Dialog.

### Konfiguration

| Einstellung | Wirkung | Standard |
|---|---|---|
| Server-URL | Basis-URL deiner paperless-ngx-Instanz. | *(leer)* |
| API-Token | Token für diese Instanz, in paperless selbst angelegt. | *(leer)* |
| Cache-Ordner | Vault-Ordner, in dem heruntergeladene PDFs liegen. | `_paperless-storage/` |
| Cache-Ordner ausblenden | Blendet den Cache-Ordner im Dateibaum aus (er bleibt ein normaler, synchronisierbarer Ordner — nur die Anzeige wird unterdrückt). | an |
| Dateiversion | Welche Fassung eingebettet und gecacht wird — das durchsuchbare Archiv-PDF oder die Originaldatei. | Archiv |
| Standardhöhe der Einbettung | Feste Höhe in Pixeln für eingebettete Dokumente; leer lassen, damit Obsidian selbst skaliert. | *(leer)* |

## Funktionsweise

Eine `.paperless`-Stub-Datei (eine kleine JSON-Datei mit der Dokument-ID) ist eine
echte Datei in deinem Vault — sie bekommt Backlinks, taucht im Graph auf und
funktioniert mit der Autovervollständigung wie jede andere Datei. Gerendert wird sie
über einen Adapter an Obsidians (undokumentierter) `embedRegistry`: die Dokumentbytes
werden mit deinem API-Token von paperless-ngx geholt, im Vault gecacht und Obsidians
eigenem PDF-Betrachter übergeben — dieses Plugin bringt keinen eigenen PDF-Renderer
mit. Architektur: [`AGENTS.md`](AGENTS.md).

## Dokumentation

- [Doku-Index (Deutsch)](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.de.md)
- [Erste Schritte](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.de.md#erste-schritte) — von der Installation bis zum ersten eingebetteten Dokument
- [Fehlerbehebung](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.de.md#fehlerbehebung) — Meldungen, Ursachen, Abhilfe

## Mitwirken

Issues auf [GitHub](https://github.com/johannes-kaindl/paperless-storage/issues); die kanonische Quelle ist [git.jkaindl.de](https://git.jkaindl.de/jkaindl/paperless-storage).
Das Projekt ist testgetrieben (`npm test`, `npm run gate`); der weitere
Entwicklungs-Workflow steht in [`AGENTS.md`](AGENTS.md).

## Lizenz

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE)).
- **Doku/Text:** CC BY-SA 4.0 ([`LICENSE-DOCS`](LICENSE-DOCS)).

Copyright © 2026 Johannes Kaindl.
