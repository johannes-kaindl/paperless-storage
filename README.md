# Paperless Storage

**Embed documents from your [paperless-ngx](https://docs.paperless-ngx.com/) instance
directly in your notes — read in the flow of your writing, not through a link.**

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Obsidian%201.8.7%2B%20·%20desktop%20only-7c3aed)

paperless-ngx can generate public share links for a document, but a link like that has
no login — anyone who has the URL has the document, and it would sit in plain text in
your note (and in your vault's git history). For tax records, contracts, or medical
paperwork that's the wrong trade-off. This plugin embeds documents by fetching them
with your **API token** instead, so nothing beyond a small stub file is stored in the
vault or shared outside it.

## Features

- **Inline PDF embeds** — `![[Mietvertrag.paperless]]` renders the document right in
  the note, using Obsidian's own PDF viewer (scrollable, zoomable, no bundled renderer).
- **Insert document** command opens a search modal over your paperless library and
  inserts an embed at the cursor.
- **Open in a full pane** — clicking a `.paperless` file in the file explorer opens the
  document like any other file, not just as an embed.
- **Title synchronization** — a command renames stub files to match the current
  document title on the server.
- **Local caching** — downloaded PDFs are cached in the vault, so a document stays
  readable offline once it has been opened; a command clears the cache on demand.
- **API-token auth, not public links** — nothing is shared outside your vault and your
  own paperless instance.

## Requirements

- **Obsidian 1.8.7+**, desktop only (`isDesktopOnly: true` — this plugin talks to a
  paperless-ngx server over HTTP and relies on Obsidian's desktop PDF viewer).
- A reachable **paperless-ngx** instance and an **API token** for it (created under
  paperless' own settings).

## Install

### Community Plugins
Pending review. Once available: Settings → Community plugins → Browse → "Paperless
Storage".

### Manual
Download `main.js`, `manifest.json`, `styles.css` from the
[latest release](https://git.jkaindl.de/jkaindl/paperless-storage/releases) into
`<vault>/.obsidian/plugins/paperless-storage/`, then enable the plugin.

### BRAT (beta)
Add the GitHub mirror `johannes-kaindl/paperless-storage` in
[BRAT](https://github.com/TfTHacker/obsidian42-brat).

### From source
```bash
git clone https://git.jkaindl.de/jkaindl/paperless-storage
cd paperless-storage && npm install && npm run build
# copy main.js manifest.json styles.css into <vault>/.obsidian/plugins/paperless-storage/
```

## Usage

1. Open **Settings → Paperless Storage** and enter your server URL and API token.
2. Run the **"Insert document"** command (or its editor context) to search your
   paperless library and insert an embed at the cursor.
3. The embed downloads and caches the document on first view; after that it renders
   from the local cache and only re-fetches when the server-side document changed.
4. Click a `.paperless` file in the file explorer to open it full-pane, exactly like a
   native file.
5. Run **"Synchronize document titles"** to rename stub files to match their current
   title on the server.

### A note on renaming

Obsidian shows its own "Update internal links?" confirmation dialog when a `.paperless`
file gets renamed (including via the title-sync command above) — this happens because
`.paperless` is an unregistered file extension, and it happens even with "Always update
links" enabled in Obsidian's own settings. If a rename command appears to hang, check
for that dialog.

### Configuration

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
this plugin. Architecture and design rationale: [`CLAUDE.md`](CLAUDE.md) and
[`docs/superpowers/specs/2026-08-05-paperless-storage-design.md`](docs/superpowers/specs/2026-08-05-paperless-storage-design.md).

## Contributing

Issues/PRs on [git.jkaindl.de](https://git.jkaindl.de/jkaindl/paperless-storage). This
project is test-driven (`npm test`, `npm run gate`); see [`CLAUDE.md`](CLAUDE.md) for
the wider development workflow.

## License

AGPL-3.0-or-later — see [`LICENSE`](LICENSE).

Copyright © 2026 Johannes Kaindl.
