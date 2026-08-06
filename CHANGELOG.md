# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
