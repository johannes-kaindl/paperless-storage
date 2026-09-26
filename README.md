# Paperless Storage

**Embed documents from your [paperless-ngx](https://docs.paperless-ngx.com/) instance
directly in your notes — read in the flow of your writing, not through a link.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docs: CC BY-SA 4.0](https://img.shields.io/badge/docs-CC%20BY--SA%204.0-lightgrey.svg)](LICENSE-DOCS)
[![Release](https://img.shields.io/github/v/release/johannes-kaindl/paperless-storage?label=release)](https://github.com/johannes-kaindl/paperless-storage/releases)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20%26%20mobile-7c3aed)

> 🇬🇧 English · [🇩🇪 Deutsch](https://github.com/johannes-kaindl/paperless-storage/blob/main/README.de.md)

paperless-ngx can generate public share links for a document, but a link like that has
no login — anyone who has the URL has the document, and it would sit in plain text in
your note (and in your vault's git history). For tax records, contracts, or medical
paperwork that's the wrong trade-off. This plugin embeds documents by fetching them
with your **API token** instead, so nothing beyond a small stub file is stored in the
vault or shared outside it.

<p align="center"><img src="https://raw.githubusercontent.com/johannes-kaindl/paperless-storage/main/docs/images/hero.png" width="820" alt="An Obsidian note with a paperless-ngx document embedded in the text: the PDF viewer shows the Service Agreement between two paragraphs"></p>

## Features

- **Inline PDF embeds** — `![[Mietvertrag.paperless]]` renders the document right in
  the note, using Obsidian's own PDF viewer (scrollable, zoomable, no bundled renderer).
- **Insert document** command (command palette, while a note is open) opens a search modal over your paperless library and
  inserts an embed at the cursor.
- **Open in a full pane** — clicking a `.paperless` file in the file explorer opens the
  document like any other file, not just as an embed.
- **Title synchronization** — the **Synchronize document titles** command renames stub files to match the current
  document title on the server.
- **Local caching** — downloaded PDFs are cached in the vault, so a document stays
  readable offline once it has been opened; a command clears the cache on demand.
- **API-token auth, not public links** — nothing is shared outside your vault and your
  own paperless instance.

## Requirements

- **Obsidian 1.8.7+**, desktop and mobile. The plugin uses no Node or Electron API: it
  fetches over Obsidian's own `requestUrl`, caches through the vault API, and displays
  documents in Obsidian's built-in PDF viewer — all of which exist on mobile too.
- A reachable **paperless-ngx** instance and an **API token** for it (created under
  paperless' own settings).

## Install

### Community plugins

Settings → Community plugins → Browse → "Paperless Storage" → Install → Enable.

### Manual

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/johannes-kaindl/paperless-storage/releases) and copy them into `<vault>/.obsidian/plugins/paperless-storage/`, then enable the plugin.

### BRAT (beta)

Add `johannes-kaindl/paperless-storage` in [BRAT](https://github.com/TfTHacker/obsidian42-brat).

### From source

```bash
git clone https://git.jkaindl.de/jkaindl/paperless-storage
cd paperless-storage && npm install && npm run build
# copy main.js manifest.json styles.css into <vault>/.obsidian/plugins/paperless-storage/
```

## Usage

1. Open **Settings → Paperless Storage** and enter your server URL and API token.
2. Run **Paperless Storage: Insert document** from the command palette to search your
   paperless library and insert an embed at the cursor.
3. The embed downloads and caches the document on first view; after that it renders
   from the local cache, also offline. To fetch a newer version, run **Clear document cache**.
4. Click a `.paperless` file in the file explorer to open it full-pane, exactly like a
   native file.
5. Run **Synchronize document titles** to rename stub files to match their current
   title on the server.
6. **Clear document cache** removes the downloaded PDFs.

### What it looks like

<img src="https://raw.githubusercontent.com/johannes-kaindl/paperless-storage/main/docs/images/insert-document.png" width="820" alt="The Insert document search window with four results for the query 2026">

<img src="https://raw.githubusercontent.com/johannes-kaindl/paperless-storage/main/docs/images/offline-cache.png" width="820" alt="The same note with the server switched off: a notice above the PDF says the server is unreachable and the cached copy is shown">

### A note on renaming

Obsidian shows its own "Update internal links?" confirmation dialog when a `.paperless`
file gets renamed (including via the title-sync command above) — this happens because
`.paperless` is an unregistered file extension, and it happens even with "Always update
links" enabled in Obsidian's own settings. If a rename command appears to hang, check
for that dialog.

### Configuration

<img src="https://raw.githubusercontent.com/johannes-kaindl/paperless-storage/main/docs/images/settings.png" width="820" alt="The Paperless Storage settings tab: server URL, masked API token, cache folder, hide cache folder toggle, file version and default embed height">

| Setting | Effect | Default |
|---|---|---|
| Server URL | Base URL of your paperless-ngx instance. | *(empty)* |
| API token | Token for that instance, created under paperless' own settings. | *(empty)* |
| Cache folder | Vault folder where downloaded PDFs are cached. | `_paperless-storage/` |
| Hide cache folder | Hides the cache folder in the file explorer (it stays a normal, syncable folder — only the display is suppressed). | on |
| File version | Which version of the document to embed and cache — the searchable archive PDF, or the original file. | Archive |
| Default embed height | Fixed height (in pixels) for embedded documents; leave empty to let Obsidian size the embed itself. | *(empty)* |

## How it works

A `.paperless` stub file (a small JSON file carrying the document ID) is a real file in
your vault — it gets backlinks, appears in the graph, and works with autocomplete like
any other file. An adapter on Obsidian's (undocumented) `embedRegistry` renders it: the
document bytes are fetched from paperless-ngx using your API token, cached in the vault,
and handed to Obsidian's own PDF viewer for display — no PDF renderer is bundled with
this plugin. Architecture: [`AGENTS.md`](AGENTS.md).

## Contributing

Issues on [GitHub](https://github.com/johannes-kaindl/paperless-storage/issues); the canonical source is [git.jkaindl.de](https://git.jkaindl.de/jkaindl/paperless-storage). This
project is test-driven (`npm test`, `npm run gate`); see [`AGENTS.md`](AGENTS.md) for
the wider development workflow.

## Documentation

- [Documentation index](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.md)
- [Getting started](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.md#getting-started) — from installation to your first embedded document
- [Troubleshooting](https://github.com/johannes-kaindl/paperless-storage/blob/main/docs/README.md#troubleshooting) — messages, causes, fixes

## License

- **Code:** AGPL-3.0-or-later ([`LICENSE`](LICENSE)).
- **Docs/Text:** CC BY-SA 4.0 ([`LICENSE-DOCS`](LICENSE-DOCS)).

Copyright © 2026 Johannes Kaindl.
