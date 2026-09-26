# Paperless Storage — documentation

Organised after [Diátaxis](https://diataxis.fr/): learning, doing, looking up and understanding are four different needs, so they get four kinds of pages. This plugin is small, so the two parts that matter most sit on this one page.

**New here?** → [Getting started](#getting-started) — from installation to your first embedded document.

**Something not working?** → [Troubleshooting](#troubleshooting) — symptoms, causes, fixes, and where to get help.

Deutsch: [Dokumentation auf Deutsch](README.de.md).

`SMOKE.md` and `superpowers/` in this folder are maintainer material (GUI smoke checklist, design specs), not user documentation.

## Getting started

You need a running paperless-ngx instance that your Obsidian device can reach, and a user account on it.

1. Install the plugin: Settings → Community plugins → Browse → "Paperless Storage" → Install → Enable.
2. Create an API token in paperless: open your user menu → My Profile → API auth token, and copy the token (the circular-arrow button creates a new one).
3. Open Settings → Paperless Storage. Enter your **Server URL** (the address you open paperless at, e.g. `https://paperless.example.org`) and paste the token into **API token**. The token field is masked; both values are saved as you type.
4. Open any note in the editor and run the command palette (Ctrl/Cmd+P) → **Paperless Storage: Insert document**.
5. Type a search term. Results come from paperless' own full-text search (at most 20). Pick a document.

The plugin creates a small `<title>.paperless` file next to your note and inserts `![[<title>.paperless]]` at the cursor. The first time the embed is shown it says "Loading document…", then Obsidian's own PDF viewer appears inside the note. You should now see the document, scrollable and zoomable, in the note.

What to try next:

- Click the `.paperless` file in the file explorer to open the document in a full pane.
- Run **Paperless Storage: Synchronize document titles** after renaming documents in paperless — it renames the stub files to match. Obsidian may show its "Update internal links?" dialog for each rename; confirm it, the command waits for you.
- Run **Paperless Storage: Clear document cache** to remove the downloaded PDFs (they are downloaded again the next time an embed is shown).

Downloaded PDFs are stored in the cache folder (default `_paperless-storage/` in the vault root). A document you have opened once stays readable offline. The plugin does not check the server for a newer version of a cached document — clear the cache to fetch it again.

## Troubleshooting

Most messages appear inside the embed itself, some as a notice at the top right. Where the text below is quoted, it is what the plugin shows when Obsidian's language is English; with German selected the wording is German.

### "Paperless Storage is not set up yet — open the plugin settings."

**Cause:** Server URL or API token is empty.

**Fix:** Fill in both under Settings → Paperless Storage.

### "API token rejected. Check the plugin settings."

**Cause:** paperless answered 401 or 403. The token is wrong, was regenerated, belongs to a user who may not see the document, or a login page in front of paperless (a reverse proxy with its own authentication) answers instead of paperless.

**Fix:** Generate the token again (My Profile → API auth token) and paste it without leading or trailing spaces. Open the Server URL in a browser to check that it shows paperless directly. If you were reading an already cached document, you still see it, with this text above it.

**Symptom in the search box:** an empty result list is the usual sign of a wrong token; the notice above appears once per search window.

### "Server unreachable and no cached copy available."

**Cause:** The document has never been downloaded on this device and the server could not be reached (or answered with an error) — wrong address, http instead of https, wrong port, server offline, a certificate Obsidian does not trust, or your phone is outside the network that reaches paperless.

**Fix:** Open the Server URL in the browser of the same device. Use the same address in Settings, without a trailing path such as `/api`. On a phone, connect to the VPN or network paperless lives in.

### "Server unreachable — showing cached copy."

**Cause:** The document is cached, but the plugin could not get the metadata from the server (offline, server down, or another error). This text also shows when the document was deleted in paperless while a cached copy is still in the vault.

**Fix:** Nothing is lost — the cached copy is displayed. Once the server is reachable the text disappears the next time the embed is shown.

### "Document 42 no longer exists in paperless."

**Cause:** paperless answered 404 for that document number and there is no cached copy: the document was deleted, or the `.paperless` file points to another paperless instance.

**Fix:** Insert the document again with **Insert document**, or open the `.paperless` file and correct the `id`.

### "Cannot read this .paperless file: Invalid .paperless stub: …"

**Cause:** A `.paperless` file must be a JSON object with an integer `id`. The reason after the colon says what is missing: `not valid JSON`, `not an object` or `missing or non-integer 'id'`.

**Fix:** Correct the file, for example:

```json
{
  "id": 123,
  "title": "Rental agreement"
}
```

`id` is the number in the paperless address of the document (`/documents/123/details`). `title` is only a label.

### "Downloaded, but could not be cached: …"

**Cause:** The document was downloaded, but Obsidian could not write it into the cache folder — disk full, a read-only vault or a folder your sync tool locks. The document is not shown in this case.

**Fix:** Free disk space or fix the folder permissions, then reload the note. Check that the **Cache folder** setting points to a folder inside the vault.

### "Paperless storage: embeds unavailable in this Obsidian version." or "PDF viewer unavailable in this Obsidian version."

**Cause:** The plugin reaches Obsidian's PDF viewer through an interface Obsidian does not document. This Obsidian version does not offer it, so embeds cannot be drawn.

**Fix:** Update Obsidian. The commands still work; the full-pane view and the embed need the same PDF viewer.

### "Insert document" finds nothing

**Cause:** The search uses paperless' full-text index, shows at most 20 results, and shows an empty list for every error except a rejected token (wrong address, server down). Documents that paperless has not indexed yet are not found.

**Fix:** Try the same search in the paperless web interface. If it finds the document there, check Server URL and token as described above. The command only works while a note is open in the editor.

### The embed shows an old version of the document

**Cause:** A document that is already cached is not compared with the server again.

**Fix:** Run **Paperless Storage: Clear document cache**, then show the embed again.

### The cache folder is still visible in the file explorer — or gone

**Cause:** **Hide cache folder** only hides the folder row in the file explorer; the folder and its files stay in the vault and are synced like any other. It applies to the folder named in **Cache folder**. If you rename the cache folder in the settings, the old folder is neither moved nor deleted and becomes visible again; new downloads go to the new folder.

**Fix:** Switch **Hide cache folder** on or off as you like. Delete an old cache folder by hand if you no longer need it. **Clear document cache** removes only the PDFs in the folder currently set.

### A rename seems to hang

**Cause:** Obsidian asks "Update internal links?" whenever a `.paperless` file is renamed, because it does not know the file extension — also with "Always update links" switched on. The title synchronisation waits behind that dialog.

**Fix:** Look for the dialog, confirm it, and the command carries on.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/paperless-storage/issues) with your Obsidian version, the plugin version (Settings → Community plugins) and what you expected to happen. Do not paste your API token.
