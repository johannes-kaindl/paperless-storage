# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

### Added

- Help row at the top of the settings with links to the documentation and the issue tracker.

## [0.2.3] — 2026-09-26

### Added

- User documentation: a documentation index with Getting started and Troubleshooting (English and German), linked from the README.
- README screenshots: hero, the Insert document search window, the offline notice and the settings tab, recorded against a demo server with invented documents (`npm run shots`).

### Fixed

- README: removed the claim that the plugin re-fetches a document when it changes on the server (a cached document is only refreshed by clearing the cache), and corrected the German README, which said desktop only although the plugin runs on mobile too.

## [0.2.2] — 2026-09-24

### Changed

- `authorUrl` in the manifest points at the GitHub profile again, now that the plugin returns to the Community Store.

## [0.2.1] — 2026-09-03

### Fixed

- `authorUrl` in the manifest pointed at a GitHub profile that is not publicly reachable
  (the account is flagged; anonymous requests get a 404). It now points at the Forgejo
  profile the code actually lives on. `authorUrl` is an availability promise — one that
  cannot be kept is worse than a plain one.

## [0.2.0] — 2026-09-02

### Changed

- **The plugin now runs on mobile** (`isDesktopOnly: false`). Nothing in the code had to
  change — it never used a Node or Electron API: it fetches over Obsidian's `requestUrl`,
  caches through the vault API, and renders in Obsidian's built-in PDF viewer. The flag
  had been set defensively in August, when no test device was available, and stayed
  unmeasured until now. Verified on a real device: the document renders inline, and the
  token-authenticated fetch works there too. The three lines of evidence that preceded
  the device test are in
  `docs/superpowers/specs/2026-09-02-mobile-spike-ergebnis.md`, along with what each of
  them could *not* show.

## [0.1.2] — 2026-08-06

### Fixed

- Settings tab now implements the declarative settings API, so its settings appear in
  Obsidian's built-in settings search on 1.13.0+.
- Clearing the document cache now respects your file-deletion preference (moves cached
  files to trash) instead of deleting them permanently.

## [0.1.1] — 2026-08-06

### Fixed

- Moved the vendored test-only Obsidian mock out of `src/` (Community Store review
  scans every `.ts` file under `src/` regardless of local lint ignores, and flagged the
  permissive mock's `any` types as dozens of warnings — a "Caution" rating despite a
  clean local lint).

## [0.1.0] — 2026-08-06

### Added

- Embed documents from a paperless-ngx instance directly in notes (`![[Document.paperless]]`),
  rendered by Obsidian's own PDF viewer — no bundled renderer, no public share links.
- Search modal to insert a document into a note (`Insert document` command).
- `.paperless` files open in a full-pane view when clicked in the file explorer.
- Command to synchronize stub titles with the current document title on the server.
- Command to clear the local document cache.
- Settings: server URL, API token, cache folder (with autocomplete and optional hiding
  in the file explorer), archive vs. original file version, default embed height.
