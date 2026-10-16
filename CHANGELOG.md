# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.4.1] — 2026-10-16

### Changed

- The README shows current screenshots: the settings with the keychain note and the "Test connection" row, and a document embedded from paperless.
- Internal change, nothing changes for you: the keychain access for the API token now comes from the shared kit library instead of a local copy of it.
- Internal housekeeping only, nothing changes for you: the shared kit libraries were updated (obsidian-kit 0.61.0, code-kit 0.28.0). The changes in between (a language-model change for Gemma 4, a new Claude provider, endpoint-manager notifications, a Kit test mock) touch no part this plugin uses in a visible way.

## [0.4.0] — 2026-10-14

### Added

- **New button *Test connection* in the settings** checks the server URL and the API token with one search request and says what is wrong (a rejected token gets its own message).
- **The loading and error states of an embed now show a status icon and an explicit state** (a spinner while loading, a warning when only the cached copy could be shown, an error otherwise) and are announced to screen readers. An embed that failed offers **Retry**; a missing or rejected token offers **Open settings**, and so does the "not set up yet" message.

### Changed

- **Synchronize document titles now asks first.** It shows which titles change (old → new), and saves the previous names and contents to a backup file in the plugin folder (`title-sync-backup-<time>.json`) before renaming anything; if the backup cannot be written, nothing is renamed. There is no automatic restore yet: the backup is for restoring by hand.
- **Clear document cache now asks for confirmation.**
- **Command names, the settings page and the notices are now translated** (German added); before, only some messages were.
- Kit vendoring raised from `obsidian-kit` 0.37.1 to 0.60.1 and from `code-kit` 0.5.0 to 0.27.1. Nothing changes for users: the Kit's folder-hiding module now also accepts a list of folders, which this plugin does not use (it still passes the single cache folder, so the generated rule is the same). The gate and tests ran green before (70) and after (72; the two new tests cover the cache-folder rule following a changed setting).

- **The API token now lives in Obsidian's keychain instead of in plain text in `data.json`.** The vault sync and every backup carried `data.json` along, and with it the token. An existing token is moved into the keychain on the first start after the update and removed from `data.json`. The keychain is per device: if you sync the vault to a second device, enter the token there once. If the keychain rejects the value, or your Obsidian is older than 1.11.4 and has none (the plugin still supports 1.8.7), the token stays in `data.json` as before; a notice tells you in the second case.

### Fixed

- **A document that was replaced or reprocessed in paperless is now fetched again.** The cache never refreshed: the plugin compared the server's checksum with one stored in the `.paperless` file, and nothing ever wrote it, so a cached document stayed as it was until you ran *Clear document cache*. The plugin now keeps the checksum in a small `<id>.json` file next to the cached PDF (the `.paperless` file you sync and link stays untouched) and compares it on every display. A cached PDF from before this change has no checksum yet: it is downloaded once more the next time the server is reachable, and after that follows the server. *Clear document cache* now also removes these checksum files.


## [0.3.2] — 2026-10-03

### Added

- The GitHub release now also carries a ready-to-unpack `paperless-storage.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Changed

- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.3.1] — 2026-09-26

### Changed
- **The cache folder is now hidden together with its contents.** Hiding uses the Kit's `folder-hide` module (`obsidian-kit` 0.43.0) instead of a local copy. The old rule only hid the folder row; if the folder was expanded in the file explorer, its cache files stayed visible. The stylesheet is attached to the main window's document (`rootSplit.doc`) and created in that window's own realm, so a pop-out window or the separate settings window can no longer receive it by mistake. It is installed once the workspace layout is ready.

## [0.3.0] — 2026-09-26

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
  `2026-09-02-mobile-spike-ergebnis.md` (maintainer's vault cockpit), along with what each of
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
