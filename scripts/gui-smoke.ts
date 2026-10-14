/**
 * GUI-Smoke-Treiber — fährt eine Checkliste gegen ein **laufendes** Obsidian statt von
 * Hand.
 *
 * Warum getrackt (CORE-TEST-02 b): ein Treiber, der nur im Session-Scratchpad liegt,
 * existiert genau einmal und ist beim nächsten Mal wieder Handarbeit.
 *
 * Was er prüft, das die 74 vitest-Tests strukturell nicht können: echtes
 * `embedRegistry`-Verhalten, Obsidians eigenen PDF-Viewer, echte Theme-/Explorer-DOM-
 * Mutationen — die Naht zum Host.
 *
 * ## Vault
 *
 * Läuft seit 2026-08-18 gegen einen eigenen, getrackten Fixture-Vault
 * (`docs/images/fixture/`) statt gegen einen geteilten Arbeits-Vault — der teilt sich
 * mehrere gleichzeitig offene Fenster, und Chromium drosselt jedes nicht fokussierte
 * (CORE-TEST-02). Derselbe Fixture-Vault dient später auch `scripts/shots.ts`
 * (Skill `readme-shots`).
 *
 * Der Smoke läuft in einer **Zweitinstanz** mit eigenem Profil und eigenem Port, nie in der
 * regulären Instanz (Dach-AGENTS § Staging-Vaults). `--port` ist Pflicht, es gibt keinen
 * Standardport. Profil: aktuelle `.asar` der regulären Instanz ins `--user-data-dir` kopieren,
 * den Vault `paperless-storage` aus `$STAGING_VAULTS_DIR` und `"language":"en"` in dessen
 * `obsidian.json` eintragen, mit `--remote-debugging-port=<port>` starten, den CDP-Lock für den
 * eigenen Port halten (`python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label paperless-storage --intent … --exclusive focus --port <port>`).
 * Vertrauensdialog und Restricted Mode erledigt `bereiteInstanzVor`.
 *
 * Die Embed-Punkte (3–5) brauchen eine Gegenstelle. Sind Server und Token in den Einstellungen
 * gesetzt (`--setup` mit `PAPERLESS_URL`/`PAPERLESS_TOKEN`), ist es die **echte** paperless-Instanz;
 * sonst — oder mit `--demo` — der lokale Demo-Server aus `scripts/demo-paperless.ts` (Port vom
 * Betriebssystem, Dokument 101). Server und Token der Einstellungen werden für den Lauf ersetzt und
 * danach zurückgesetzt; die Abschlusszeile nennt die Gegenstelle („Demo“/„echt“). Der Demo-Server
 * prüft die Naht zum Host (embedRegistry, PDF-Viewer), nicht paperless selbst.
 *
 * ```bash
 * export PAPERLESS_URL=https://…           # Test-Server, optional
 * export PAPERLESS_TOKEN=…
 * npm run build
 * npm run smoke:gui -- --setup             # baut den Vault aus dem Fixture (ohne Variablen: ohne Zugangsdaten)
 * npm run smoke:gui -- --port <port>
 * npm run smoke:gui -- --port <port> --doc 1 --keep
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne Sichtbarkeit bleibt die
 * View leer und man debuggt ein Phantom (CORE-TEST-02); `requireVisible` stellt sie her.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEMO_TOKEN, startDemoServer, type DemoServer } from "./demo-paperless.js";
// Die CDP-Brücke liegt seit 2026-08-16 zentral im Dach (tools/obsidian-cdp/) und wird
// importiert, nicht vendored: sie ist plugin-neutral und lief zuvor byte-identisch in
// sechs Repos. Fehlt das Dach (fremder Checkout), bricht esbuild beim Auflösen ab — das
// ist die gewollte Meldung. Was ihr fehlt, wird DORT ergänzt, nicht hier nachgebaut.
import { Cdp, attachTo, beimAbbruch, bereiteInstanzVor, istAbgebrochen, pollUntil, requireVisible } from "../../tools/obsidian-cdp/cdp.js";
import { createBilanz, parseArgs, runDriver } from "../../tools/obsidian-cdp/bilanz.js";
import { buildVault, requireEigenerBuild, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "paperless-storage";
/** npm-Scripts laufen im Repo-Root. */
const REPO_ROOT = process.cwd();
const FIXTURE_DIR = join(REPO_ROOT, "docs/images/fixture");
/** Werden im Vault angelegt und am Ende wieder entfernt (außer mit `--keep`). */
const SMOKE_NOTE = "_pls-gui-smoke.md";
const SMOKE_STUB = "_pls-gui-smoke.paperless";
/** Eigener Cache-Ordner nur fuer den Papierkorb-Check (8.): der Befehl leert den GANZEN
 *  Cache-Ordner. Zeigte der Check auf den echten, raeumte ein Smoke-Lauf in einem
 *  produktiven Vault den kompletten Dokument-Cache ab. */
const SMOKE_CACHE_FOLDER = "_pls-gui-smoke-cache";
const SMOKE_CACHE_FILE = `${SMOKE_CACHE_FOLDER}/gui-smoke.pdf`;

// --- Prüfpunkte -------------------------------------------------------------

/** Soll-Liste (Nenner, CORE-TEST-19): ein Punkt, der nie aufgezeichnet wird, zählt als „nichts gemessen“. */
const PUNKTE = [
  "1. Cache-Ordner ausgeblendet bei hideCacheFolder=true",
  "2. Cache-Ordner wieder sichtbar bei hideCacheFolder=false",
  "2b. Kinder des ausgeblendeten Cache-Ordners sind mit ausgeblendet",
  "2c. Blatt haengt am Hauptfenster-Dokument, nicht am Pop-out",
  "3. Embed lädt das PDF (Obsidians PDF-Viewer via embedRegistry)",
  "4. Embed-Höhe bleibt bei 500px, auch nach dem zweiten Viewer-Überschreiben",
  "5. FileView öffnet die .paperless-Datei im ganzen Pane",
  "6. Settings-Tab zeichnet alle definierten Zeilen",
  "9. Geänderte Prüfsumme lädt das Dokument neu, eine unveränderte nicht (Sidecar)",
  "7. API-Token-Zeile ist maskiert (Render-Hatch greift in beiden Pfaden)",
  "7b. Die Hilfe-Zeile steht als erste Zeile im Tab, mit Text-Knopf und Icon-Knopf",
  "8a. Kein liegen gebliebener Smoke-Cache-Ordner aus einem abgebrochenen Vorlauf",
  "8. Cache-Leeren ruft fileManager.trashFile (Papierkorb-Einstellung des Nutzers)",
] as const;

const bilanz = createBilanz({ punkte: PUNKTE });
const { record } = bilanz;

/**
 * Fixture-Vault aus `docs/images/fixture/` aufbauen (`buildVault`, pluginneutral) und
 * die Test-Zugangsdaten aus der Umgebung in dessen `data.json` schreiben. Nie im Code
 * oder im Fixture selbst — der Vault ist getrackt, ein Secret darin ginge mit jedem
 * `git push` um die Welt.
 */
async function setupVault(): Promise<void> {
  const vaultDir = stagingVaultDir("paperless-storage");
  const log = buildVault({ repoRoot: REPO_ROOT, vaultDir, fixtureDir: FIXTURE_DIR, pluginId: PLUGIN_ID });
  for (const zeile of log) console.log(`  ${zeile}`);

  const serverUrl = process.env.PAPERLESS_URL;
  const apiToken = process.env.PAPERLESS_TOKEN;
  if (!serverUrl || !apiToken) {
    throw new Error(
      "PAPERLESS_URL und PAPERLESS_TOKEN müssen gesetzt sein — der Smoke schreibt sie in " +
        "die (gitignorete) data.json des Fixture-Vaults, nie in den Vault selbst.",
    );
  }
  const dataFile = join(vaultDir, ".obsidian", "plugins", PLUGIN_ID, "data.json");
  writeFileSync(
    dataFile,
    JSON.stringify({ serverUrl, apiToken, cacheFolder: "_paperless-storage/", hideCacheFolder: true }, null, 2),
  );
  console.log(`  Zugangsdaten aus PAPERLESS_URL/PAPERLESS_TOKEN geschrieben nach ${dataFile}`);
  console.log(`\nVault: ${vaultDir}\nZweitinstanz neu starten (Kopfkommentar), dann: npm run smoke:gui -- --port <port>`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.has("setup")) {
    await setupVault();
    return;
  }
  const portRaw = args.value("port");
  if (!portRaw || !Number.isInteger(Number(portRaw))) {
    throw new Error(
      "--port <Port> ist Pflicht (Zweitinstanz mit eigenem Profil und Port, Kopfkommentar). " +
        "Es gibt keinen Standardport: 9222 ist die reguläre Instanz.",
    );
  }
  const port = Number(portRaw);
  const keep = args.has("keep");
  const docArg = args.value("doc");
  const forceDemo = args.has("demo");
  let docId = Number(docArg ?? 1);
  const vault = args.value("vault") ?? PLUGIN_ID;

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  // `attachTo` unterscheidet Haupt- und Einstellungen-Fenster an der Sache (nur das
  // Hauptfenster trägt einen Workspace), nicht am lokalisierten Titel.
  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Hauptfenster auf Port ${port} für Vault „${vault}“. ` +
        "Läuft die Zweitinstanz mit --remote-debugging-port? (siehe Kopfkommentar)",
    );
  }
  // Ausserhalb des try, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann — sonst bliebe der Vault im Smoke-Zustand stehen.
  let previousHideCacheFolder: boolean | null = null;
  let previousEmbedHeight: number | null | "unset" = "unset";
  let previousCacheFolder: string | null = null;
  let cacheFolderAngelegt = false;
  let demo: DemoServer | null = null;
  let previousServer: { serverUrl: string; apiToken: string } | null = null;
  let gegenstelleName: "Demo" | "echt" | "keine" = "keine";
  let cacheFolderName = "";
  // Die `ungeklaert`-Warnung gehoert in die Abschlusszeile, nicht nur nach oben ins
  // Protokoll: wer eine Runde faehrt, liest die letzte Zeile — und ein Lauf, dessen
  // Herkunft ungeprueft blieb, darf nicht aussehen wie einer, der belegt ist.
  let herkunftsWarnung: string | null = null;

  // Alles, was der Lauf am Vault, an den Plugin-Einstellungen und am Demo-Server aendert, raeumen drei Schritte des
  // Abbruch-Moduls der Bruecke zurueck (`beimAbbruch`, angemeldet VOR der ersten Aenderung; je Schritt hoechstens 1 s,
  // deshalb getrennt). Normalweg: `finally` schliesst sie rueckwaerts. Ctrl-C/SIGTERM: das Modul sperrt den Hauptzweig,
  // faehrt sie rueckwaerts, druckt die Bilanz, Exit 130. Der fruehere lokale Handler lief neben dem `finally` her (Rennen)
  // und raeumte nur die Einstellungen auf, nicht die Smoke-Dateien. Die `previous*`-Vorwerte liest jeder Schritt per
  // closure zum Zeitpunkt des Aufrufs (kein Snapshot). Alle Schritte sind idempotent.
  const einstellungenZurueck = async (): Promise<void> => {
    // Vor dem hideCacheFolder-Teil: dessen applyCacheFolderVisibility() soll die Regel schon fuer den ECHTEN Ordner schreiben.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      if (p) {
        ${previousCacheFolder !== null ? `p.settings.cacheFolder = ${JSON.stringify(previousCacheFolder)};` : ""}
        ${previousEmbedHeight !== "unset" ? `p.settings.embedHeight = ${JSON.stringify(previousEmbedHeight)};` : ""}
        ${previousServer !== null ? `p.settings.serverUrl = ${JSON.stringify(previousServer.serverUrl)}; p.settings.apiToken = ${JSON.stringify(previousServer.apiToken)};` : ""}
        ${previousHideCacheFolder !== null ? `p.settings.hideCacheFolder = ${JSON.stringify(previousHideCacheFolder)};` : ""}
        await p.saveSettings();
        ${previousHideCacheFolder !== null ? "if (p.applyCacheFolderVisibility) p.applyCacheFolderVisibility();" : ""}
      }
      return true;
    `);
  };
  const dateienZurueck = async (): Promise<void> => {
    if (keep) return;
    await cdp.evaluate(`
      const notePath = ${JSON.stringify(SMOKE_NOTE)};
      const stubPath = ${JSON.stringify(SMOKE_STUB)};
      const note = app.vault.getAbstractFileByPath(notePath);
      if (note) await app.vault.delete(note);
      const stub = app.vault.getAbstractFileByPath(stubPath);
      if (stub) await app.vault.delete(stub);
      const smokeCache = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_CACHE_FOLDER)});
      if (smokeCache) await app.vault.delete(smokeCache, true);
      ${cacheFolderAngelegt ? `const folder = app.vault.getAbstractFileByPath(${JSON.stringify(cacheFolderName)}); if (folder) await app.vault.delete(folder, true);` : ""}
      return true;
    `);
  };
  const anmelden = (name: string, fn: () => Promise<unknown>) =>
    beimAbbruch(async () => {
      try {
        await fn();
      } catch (e) {
        if (istAbgebrochen()) throw e;
        console.log(`Aufraeumen (${name}) fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, name);
  // Rueckwaerts gefahren: zuerst der Demo-Server, dann die Dateien, zuletzt die Einstellungen.
  const einstellungen = anmelden("Einstellungen zurücksetzen", einstellungenZurueck);
  const dateien = anmelden("Smoke-Dateien entfernen", dateienZurueck);
  const demoServer = anmelden("Demo-Server schließen", async () => { await demo?.close(); });

  try {
    // Ohne Sichtbarkeit drosselt Chromium den Renderer (gemessen 2026-08-06 und 2026-08-14: DOM
    // bleibt leer, obwohl `app.workspace` den Zustand korrekt meldet — man debuggt ein Phantom).
    // `requireVisible` stellt sie her und bricht mit Handlungsanweisung ab, wenn das nicht reicht.
    await requireVisible(cdp);

    // Vertrauensdialog bestätigen, Restricted Mode aufheben, Plugin laden (frisches Profil).
    const vorbereitet = await bereiteInstanzVor(cdp, { pluginIds: [PLUGIN_ID], nurVault: vault, sprache: "en" });
    console.log(`Instanz: ${vorbereitet.hinweis}`);

    const vaultInfo = await cdp.evaluate<{ name: string; basePath: string; configDir: string }>(`
      if (!window.app?.appId) return { name: "", basePath: "", configDir: "" };
      return { name: app.vault.getName(), basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
    `);
    if (!vaultInfo.name) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultInfo.name}\n`);

    // Laeuft dieser Lauf gegen den eigenen Stand? Die Frage, gegen die die Versionszeile
    // eine Zeile weiter unten strukturell blind ist: Store-Build und Repo-Build tragen
    // dieselbe Nummer. Am 2026-08-30 standen dachweit 69 von 150 gruenen Pruefpunkten auf
    // einem Build, der nicht belegt der Repo-Stand war.
    //
    // Der Pfad kommt aus der LAUFENDEN Instanz, nicht aus `stagingVaultDir(...)` — dieser
    // Treiber dockt per `--vault` an ein beliebiges Fenster an, und ein Check gegen den
    // Staging-Pfad pruefte dann eine Datei, die mit dem Lauf nichts zu tun hat.
    // Geprueft wird, was gemessen wird (Lesson 2026-09-02/kuro-gamification).
    requireEigenerBuild(
      join(vaultInfo.basePath, vaultInfo.configDir, "plugins", PLUGIN_ID, "main.js"),
      // Der Vergleichsstand muss frisch sein — `npm run build` baut ihn direkt davor.
      join(REPO_ROOT, "main.js"),
      (meldung) => {
        herkunftsWarnung = meldung;
        console.warn(meldung);
      },
    );

    const plugin = await cdp.evaluate<{ ok: boolean; version?: string; aufPlatte?: string; configured?: boolean }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      // Das Plugin NEU LADEN, bevor irgendetwas gemessen wird. \`npm run deploy\` ersetzt nur
      // Dateien; die laufende Instanz behaelt den zuvor geladenen Code im Speicher. Ohne
      // diesen Schritt misst der Smoke gegen ein offenes Fenster den Stand vom Fenster-
      // Oeffnen und meldet ihn als Ergebnis fuer den gerade gebauten — so laeuft eine
      // kaputte Version gruen durch.
      //
      // Der Herkunfts-Guard oben deckt das NICHT ab: er vergleicht Platte gegen Repo,
      // nicht Speicher gegen Platte. Zwei Fragen, die gleich aussehen und es nicht sind.
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 500));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 1200));
      const p = app.plugins.plugins[id];
      if (!p) return { ok: false };
      // Zwei Quellen, absichtlich: \`manifest.version\` liest Obsidian beim Vault-START,
      // ein Deploy dazwischen aendert sie NICHT. Der Plattenstand ist die Aussage ueber
      // die gemessene Datei (Lesson 2026-09-02/kuro-gamification).
      let aufPlatte;
      try {
        const roh = await app.vault.adapter.read(app.vault.configDir + "/plugins/" + ${JSON.stringify(PLUGIN_ID)} + "/manifest.json");
        aufPlatte = JSON.parse(roh).version;
      } catch (e) { aufPlatte = undefined; }
      return { ok: true, version: p.manifest.version, aufPlatte, configured: !!(p.settings.serverUrl && p.settings.apiToken) };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht geladen (${vorbereitet.hinweis}). Erst \`npm run deploy\`.`);
    // Gegenstelle der Embed-Punkte (3–5): sind Server und Token gesetzt, ist es die echte
    // paperless-Instanz ("echt"); sonst (oder mit `--demo`) der lokale Demo-Server aus
    // `scripts/demo-paperless.ts` auf einem vom Betriebssystem gewählten Port ("Demo"). Der
    // Demo-Server prüft die Naht zum Host (embedRegistry, PDF-Viewer), nicht paperless selbst.
    // Server und Token der Einstellungen werden für den Lauf ersetzt und im `finally` zurückgesetzt.
    if (plugin.configured === true && !forceDemo) {
      gegenstelleName = "echt";
    } else {
      demo = await startDemoServer(0);
      previousServer = await cdp.evaluate<{ serverUrl: string; apiToken: string }>(`
        const s = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings;
        return { serverUrl: s.serverUrl ?? "", apiToken: s.apiToken ?? "" };
      `);
      await cdp.evaluate(`
        const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
        p.settings.serverUrl = ${JSON.stringify(demo.url)};
        p.settings.apiToken = ${JSON.stringify(DEMO_TOKEN)};
        await p.saveSettings();
        return true;
      `);
      if (docArg === undefined) docId = 101;
      gegenstelleName = "Demo";
    }
    console.log(`Gegenstelle: ${gegenstelleName}${demo ? ` (${demo.url}, Dokument ${docId})` : ` (Dokument ${docId})`}`);
    // Nicht \"Version im Vault\" nennen: `enablePlugin` laedt den CODE neu, das MANIFEST
    // nicht — das liest Obsidian beim Vault-Start. Die geladene Nummer ist also eine Aussage
    // ueber den App-Start, die Platte eine ueber die gemessene Datei. Weichen sie ab, liegt
    // ein neuerer Build da, dessen Manifest die Instanz nicht kennt.
    console.log(`Plugin-Version — Obsidians Speicher: ${plugin.version} · manifest.json auf Platte: ${plugin.aufPlatte ?? "nicht lesbar"}\n`);

    const cacheFolder = await cdp.evaluate<string>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const raw = (p.settings.cacheFolder ?? "").trim();
      const chosen = raw === "" ? "_paperless-storage" : raw;
      return chosen.replace(/^\\/+|\\/+$/g, "");
    `);

    // Vorbedingung der Punkte 1–2c: der Cache-Ordner steht im Explorer. Das Fixture hat ihn nicht
    // (ohne Server legt ihn kein Embed an), und ein Fehlen sah aus wie ein roter Punkt am Plugin.
    // Wird er hier angelegt, räumt das `finally` ihn wieder ab.
    cacheFolderName = cacheFolder;
    cacheFolderAngelegt = await cdp.evaluate<boolean>(`
      const folder = ${JSON.stringify(cacheFolder)};
      if (app.vault.getAbstractFileByPath(folder)) return false;
      await app.vault.createFolder(folder);
      return true;
    `);

    previousHideCacheFolder = await cdp.evaluate<boolean>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.hideCacheFolder;
    `);
    previousEmbedHeight = await cdp.evaluate<number | null>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.embedHeight;
    `);

    // --- 1./2. Cache-Ordner-Sichtbarkeit (Kit folder-hide, Constructable Stylesheet) ---
    // Mutation und Wartephase sind getrennt: `pollUntil` fragt Node-seitig in eigenen,
    // kurzen `Runtime.evaluate`-Aufrufen nach — `Cdp.send` bricht sonst nach 30 s ab.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = true;
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      return true;
    `);
    const hiddenState = await pollUntil<string>(
      cdp,
      `
        const el = document.querySelector('.nav-folder-title[data-path="${cacheFolder}"]');
        if (!el) return null;
        return getComputedStyle(el).display;
      `,
      8000,
    );
    record(
      "1. Cache-Ordner ausgeblendet bei hideCacheFolder=true",
      hiddenState === "none",
      hiddenState === null ? "Ordner-Element nicht im Explorer gefunden" : `display: ${hiddenState}`,
    );

    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = false;
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      return true;
    `);
    const visibleState = await pollUntil<string>(
      cdp,
      `
        const el = document.querySelector('.nav-folder-title[data-path="${cacheFolder}"]');
        if (!el) return null;
        return getComputedStyle(el).display;
      `,
      8000,
    );
    record(
      "2. Cache-Ordner wieder sichtbar bei hideCacheFolder=false",
      visibleState !== null && visibleState !== "none",
      visibleState === null ? "Ordner-Element nicht im Explorer gefunden" : `display: ${visibleState}`,
    );

    // --- 2b. Die Kinder des Ordners sind mit ausgeblendet (Kit folder-hide, ab Kit 0.43.0) ---
    // Ein aufgeklappter Ordner hat sein `.nav-folder-children` als Geschwister des Titels; nur den
    // Titel zu verstecken liess die Cache-Dateien im Explorer stehen. Ein zugeklappter Ordner
    // hat gar kein Kinder-Element — deshalb vorher aufklappen (fileItems[..].setCollapsed).
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = true;
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      const view = app.workspace.getLeavesOfType("file-explorer")[0]?.view;
      await view?.fileItems?.[${JSON.stringify(cacheFolder)}]?.setCollapsed?.(false);
      return true;
    `);
    const childrenState = await pollUntil<string>(
      cdp,
      `
        const t = document.querySelector('.nav-folder-title[data-path="${cacheFolder}"]');
        const k = t?.nextElementSibling;
        if (!k || !k.classList.contains("nav-folder-children")) return null;
        return getComputedStyle(k).display;
      `,
      8000,
    );
    record(
      "2b. Kinder des ausgeblendeten Cache-Ordners sind mit ausgeblendet",
      childrenState === "none",
      childrenState === null ? "aufgeklappter Ordner hat kein .nav-folder-children" : `display: ${childrenState}`,
    );

    // --- 2c. Das Stylesheet haengt am Hauptfenster, auch wenn ein Pop-out offen ist ---
    // Nach dem Umbau auf rootSplit.doc gemessen: das Blatt gehoert an das Dokument des
    // Datei-Explorers, nie an das Pop-out (dort waere der Ordner weiter sichtbar).
    const popout = await cdp.evaluate<string>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const leaf = app.workspace.openPopoutLeaf();
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const popDoc = leaf.view.containerEl.ownerDocument;
        const mainDoc = app.workspace.rootSplit.doc;
        p.settings.hideCacheFolder = false; p.applyCacheFolderVisibility();
        p.settings.hideCacheFolder = true;  p.applyCacheFolderVisibility();
        const mine = (d) => [...d.adoptedStyleSheets].some((s) =>
          [...s.cssRules].some((r) => r.cssText.includes(${JSON.stringify(cacheFolder)})));
        return JSON.stringify({ separate: popDoc !== mainDoc, main: mine(mainDoc), pop: mine(popDoc) });
      } finally {
        leaf.detach();
      }
    `);
    const pop = JSON.parse(popout) as { separate: boolean; main: boolean; pop: boolean };
    record(
      "2c. Blatt haengt am Hauptfenster-Dokument, nicht am Pop-out",
      pop.separate && pop.main && !pop.pop,
      `Pop-out-Dokument getrennt: ${pop.separate} · Blatt im Hauptfenster: ${pop.main} · im Pop-out: ${pop.pop}`,
    );

    // Zurück auf den Vorwert, bevor der Embed-Teil beginnt (kosmetisch sauberer Vault
    // während der restlichen Checks).
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = ${JSON.stringify(previousHideCacheFolder)};
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      return true;
    `);

    // --- Szene fuer Embed-/Hoehe-Checks herstellen ---------------------------
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.embedHeight = 500;
      await p.saveSettings();

      const stubBody = JSON.stringify({ id: ${docId}, title: "GUI-Smoke" }, null, 2) + "\\n";
      const stubPath = ${JSON.stringify(SMOKE_STUB)};
      const existingStub = app.vault.getAbstractFileByPath(stubPath);
      if (existingStub) await app.vault.modify(existingStub, stubBody);
      else await app.vault.create(stubPath, stubBody);

      const noteBody = "# GUI-Smoke (automatisch erzeugt, wird nach dem Lauf gelöscht)\\n\\n![[" + stubPath + "]]\\n";
      const notePath = ${JSON.stringify(SMOKE_NOTE)};
      const existingNote = app.vault.getAbstractFileByPath(notePath);
      if (existingNote) await app.vault.modify(existingNote, noteBody);
      else await app.vault.create(notePath, noteBody);

      // Erst weg-navigieren, dann hin: ein bereits offenes Ziel-File (Leftover von
      // frueheren --keep-Laeufen oder manueller Interaktion) rendert seine Embeds sonst
      // NICHT neu, und die gerade gesetzte embedHeight griffe erst beim naechsten
      // echten Reload — Check 4 misst dann eine veraltete Hoehe (gemessen 2026-08-06).
      const neutral = app.vault.getMarkdownFiles().find((f) => f.path !== notePath);
      if (neutral) await app.workspace.getLeaf(false).openFile(neutral);

      const note = app.vault.getAbstractFileByPath(notePath);
      await app.workspace.getLeaf(false).openFile(note, { state: { mode: "preview" } });
      return true;
    `);

    // --- 3. Embed rendert das PDF --------------------------------------------
    // Signal ist `.pdf-toolbar` (erscheint erst, wenn Obsidians PDF-Viewer wirklich
    // initialisiert hat), NICHT scrollHeight>clientHeight: der `.internal-embed`-Span
    // wird von applyEmbedHeight/dem Viewer selbst auf die Inhaltsgroesse GESETZT, bleibt
    // also scrollHeight===clientHeight, auch im geladenen Zustand (gemessen 2026-08-06).
    const embedLoaded = await pollUntil<boolean>(
      cdp,
      `
        const span = document.querySelector(".internal-embed");
        return !!span?.querySelector(".pdf-toolbar");
      `,
      15000,
    );
    const embedDiag = await cdp.evaluate<string>(`
      const span = document.querySelector(".internal-embed");
      if (!span) return "kein .internal-embed im DOM";
      const msg = span.querySelector(".paperless-storage-message");
      return msg ? "Meldung stand noch: " + msg.textContent : "kein .pdf-toolbar gefunden";
    `);
    record(
      "3. Embed lädt das PDF (Obsidians PDF-Viewer via embedRegistry)",
      embedLoaded === true,
      embedLoaded ? "" : embedDiag,
    );

    // --- 4. Embed-Hoehe uebersteht Obsidians Zwei-Schub-Ueberschreiben --------
    // render-core.ts applyEmbedHeight(): Obsidians PDF-Viewer setzt die eigene Hoehe in
    // ZWEI Schueben (erste Layout-Passe ~300-600ms, zweite nach vollstaendiger
    // Seitenberechnung ~1s spaeter). Ein einmalig abgemeldeter Observer faengt nur die
    // erste ab (Regressions-Gegenstand von Commit 3334377/22d0af6).
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const heightAfter = await cdp.evaluate<string>(`
      const span = document.querySelector(".internal-embed");
      return span ? span.style.height : "(kein Embed)";
    `);
    record(
      "4. Embed-Höhe bleibt bei 500px, auch nach dem zweiten Viewer-Überschreiben",
      heightAfter === "500px",
      `style.height: ${heightAfter}`,
    );

    // --- 5. FileView zeigt dasselbe Dokument im ganzen Pane -------------------
    // Selbes Signal wie Check 3 (`.pdf-toolbar`), aus demselben Grund kein
    // scrollHeight-Vergleich. Kein `.mod-active`-Scope auf dem Leaf-Selektor — der Smoke
    // haelt exklusiv die Szene, `.view-content` ist eindeutig.
    await cdp.evaluate(`
      const stubPath = ${JSON.stringify(SMOKE_STUB)};
      const neutral = app.vault.getMarkdownFiles()[0];
      if (neutral) await app.workspace.getLeaf(false).openFile(neutral);
      const stub = app.vault.getAbstractFileByPath(stubPath);
      await app.workspace.getLeaf(false).openFile(stub);
      return true;
    `);
    const fileViewLoaded = await pollUntil<boolean>(
      cdp,
      `
        const content = document.querySelector(".view-content");
        return !!content?.querySelector(".pdf-toolbar");
      `,
      15000,
    );
    const fileViewDiag = await cdp.evaluate<string>(`
      const content = document.querySelector(".view-content");
      if (!content) return "kein .view-content im DOM";
      const msg = content.querySelector(".paperless-storage-message");
      return msg ? "Meldung stand noch: " + msg.textContent : "kein .pdf-toolbar gefunden";
    `);
    record(
      "5. FileView öffnet die .paperless-Datei im ganzen Pane",
      fileViewLoaded === true,
      fileViewLoaded ? "" : fileViewDiag,
    );

    // --- 9. Pruefsumme im Sidecar: geaenderte laedt neu, unveraenderte nicht ----
    // Der Cache aktualisierte nie, weil kein Codepfad die Pruefsumme festhielt. Gemessen wird am
    // Demo-Server: wie oft wurde das PDF abgeholt? Gegen eine echte Instanz laesst sich die
    // Pruefsumme nicht aendern, dort ist der Punkt "nichts gemessen".
    if (demo === null) {
      bilanz.unmeasured("9. Geänderte Prüfsumme lädt das Dokument neu, eine unveränderte nicht (Sidecar)", "Gegenstelle ist keine Demo: die Prüfsumme lässt sich nicht ändern (--demo nutzen).");
    } else {
      const open = async (): Promise<boolean | null> => {
        await cdp.evaluate(`
          const neutral = app.vault.getMarkdownFiles()[0];
          if (neutral) await app.workspace.getLeaf(false).openFile(neutral);
          const stub = app.vault.getAbstractFileByPath(${JSON.stringify(SMOKE_STUB)});
          await app.workspace.getLeaf(false).openFile(stub);
          return true;
        `);
        return pollUntil<boolean>(cdp, `return !!document.querySelector(".view-content")?.querySelector(".pdf-toolbar");`, 15000);
      };
      await open();
      const vorher = demo.downloads(docId);
      await open();
      const unveraendert = demo.downloads(docId);
      demo.setChecksum(docId, "demo-ersetzt");
      await open();
      const geaendert = demo.downloads(docId);
      await open();
      const danach = demo.downloads(docId);
      record(
        "9. Geänderte Prüfsumme lädt das Dokument neu, eine unveränderte nicht (Sidecar)",
        unveraendert === vorher && geaendert === vorher + 1 && danach === geaendert,
        `Abrufe: vorher ${vorher} · erneut geöffnet ${unveraendert} · Prüfsumme geändert ${geaendert} · danach ${danach}`,
      );
    }

    // --- 6./7. Settings-Tab zeichnet seine Zeilen wirklich -------------------
    // Regressions-Gegenstand von d182c67 (0.1.2): der Tab definiert seine Zeilen
    // deklarativ (`getSettingDefinitions`) und zeichnet DIESELBE Struktur im
    // `display()`-Fallback nach. Welchen der beiden Pfade der Host nimmt, entscheidet
    // dessen Version — die vitest-Tests sehen weder den echten Host noch die echte
    // `Setting`-API und koennen deshalb nur die Definitionsliste pruefen, nicht das
    // Ergebnis. Hier wird das Ergebnis geprueft: stehen die Zeilen im DOM?
    interface SettingsProbe {
      ok: boolean;
      reason?: string;
      displayCalled?: boolean;
      expected?: string[];
      missing?: string[];
      tokenInputType?: string | null;
    }
    const settings = await cdp.evaluate<SettingsProbe>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      const tabs = app.setting?.pluginTabs ?? [];
      const tab = tabs.find((t) => t.id === id || t.plugin?.manifest?.id === id);
      if (!tab) return { ok: false, reason: "Settings-Tab steht nicht in app.setting.pluginTabs" };
      if (typeof app.setting.open !== "function" || typeof app.setting.openTabById !== "function") {
        return { ok: false, reason: "app.setting.open/openTabById fehlt in dieser Obsidian-Version" };
      }
      // Faellt der Tab hinter d182c67 zurueck (nur display(), keine Definitionsliste) —
      // dann ist das ein roter Pruefpunkt, kein Abbruch. Sonst risse die Gegenprobe
      // gegen eine aeltere Plugin-Version den ganzen Smoke mit.
      if (typeof tab.getSettingDefinitions !== "function") {
        return { ok: false, reason: "Tab hat kein getSettingDefinitions() — deklarative Settings fehlen" };
      }
      const expected = tab.getSettingDefinitions().map((d) => d.name);

      // Verraet, welchen Pfad der Host gewaehlt hat: ab 1.13 ruft er display() nicht mehr.
      let displayCalled = false;
      const originalDisplay = tab.display;
      tab.display = function (...args) { displayCalled = true; return originalDisplay.apply(this, args); };

      // NICHT app.setting.containerEl: ab 1.13 zeichnet der Host die Einstellungen in ein
      // ausgelagertes FENSTER (eigenes Dokument), waehrend containerEl der leere
      // modal-container des Hauptfensters bleibt — gemessen 2026-08-14, derselbe
      // Fallstrick, den main.ts bei applyCacheFolderVisibility schon traegt. Der Tab
      // zeigt in beiden Welten auf seinen eigenen Inhalt.
      const scope = () => tab.containerEl ?? app.setting.containerEl;
      let names = [];
      try {
        app.setting.open();
        app.setting.openTabById(id);
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline) {
          names = Array.from(scope().querySelectorAll(".setting-item-name"))
            .map((el) => el.textContent.trim());
          if (expected.every((n) => names.includes(n))) break;
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        tab.display = originalDisplay;
      }

      const tokenItem = Array.from(scope().querySelectorAll(".setting-item")).find(
        (el) => el.querySelector(".setting-item-name")?.textContent.trim() === "API token",
      );
      const tokenInput = tokenItem?.querySelector("input");
      const type = tokenInput ? tokenInput.type : null;
      app.setting.close();
      return {
        ok: true,
        displayCalled,
        expected,
        missing: expected.filter((n) => !names.includes(n)),
        tokenInputType: type,
      };
    `);
    const settingsPath = settings.displayCalled
      ? "display()-Fallback"
      : "deklarativ (getSettingDefinitions)";
    record(
      "6. Settings-Tab zeichnet alle definierten Zeilen",
      settings.ok === true && settings.missing?.length === 0,
      settings.ok
        ? `Pfad: ${settingsPath} · ${settings.expected?.length ?? 0} Zeilen` +
            (settings.missing?.length ? ` · fehlt: ${settings.missing.join(", ")}` : "")
        : (settings.reason ?? "unbekannt"),
    );
    record(
      "7. API-Token-Zeile ist maskiert (Render-Hatch greift in beiden Pfaden)",
      settings.tokenInputType === "password",
      settings.ok ? `input.type: ${settings.tokenInputType ?? "(kein Eingabefeld)"}` : "Tab nicht geöffnet",
    );

    // --- 7b. Hilfe-Zeile (UI-STANDARD §8) ------------------------------------
    // Position und Bedienung, nicht Wortlaut: die ERSTE Zeile des Tabs traegt einen Text-Knopf und
    // den Icon-Knopf (`bug`, Tooltip als Name). Punkt 6 belegt nur, DASS die Zeile gezeichnet wird;
    // dass sie OBEN steht, misst erst dieser Punkt.
    const hilfe = await cdp.evaluate<{ ok: boolean; name?: string; knoepfe?: number; icon?: string | null }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      const tab = (app.setting?.pluginTabs ?? []).find((t) => t.id === id || t.plugin?.manifest?.id === id);
      if (!tab) return { ok: false };
      app.setting.open();
      app.setting.openTabById(id);
      const scope = () => tab.containerEl ?? app.setting.containerEl;
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && !scope().querySelector(".setting-item")) await new Promise((r) => setTimeout(r, 100));
      const erste = scope().querySelector(".setting-item");
      const out = erste ? {
        ok: true,
        name: erste.querySelector(".setting-item-name")?.textContent?.trim() ?? "",
        knoepfe: erste.querySelectorAll("button").length,
        icon: erste.querySelector(".extra-setting-button")?.getAttribute("aria-label") ?? null,
      } : { ok: false };
      app.setting.close();
      return out;
    `);
    record(
      "7b. Die Hilfe-Zeile steht als erste Zeile im Tab, mit Text-Knopf und Icon-Knopf",
      hilfe.ok === true && !!hilfe.name && hilfe.knoepfe === 1 && !!hilfe.icon,
      hilfe.ok ? `erste Zeile „${hilfe.name}“ · Text-Knöpfe ${hilfe.knoepfe} · Icon „${hilfe.icon ?? "keiner"}“` : "Tab nicht geöffnet",
    );

    // --- 8. Cache-Leeren geht in den Papierkorb, nicht in die endgueltige Loeschung ---
    // Regressions-Gegenstand von aab247a (0.1.2): `fileManager.trashFile` respektiert die
    // Papierkorb-Einstellung des Nutzers, `vault.delete` ignoriert sie. Welche der beiden
    // aufgerufen wird, ist am Ergebnis nicht ablesbar — beide lassen die Datei
    // verschwinden. Der Check misst deshalb den Aufruf selbst.
    previousCacheFolder = await cdp.evaluate<string>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.cacheFolder;
    `);
    // 8a — ein per Ctrl-C abgebrochener Vorlauf haette `previousCacheFolder` NIE
    // zurueckgeschrieben; der hier gelesene Wert waere dann schon der Smoke-Ordner statt des
    // echten. SMOKE_CACHE_FOLDER ist ein unwahrscheinlicher echter Ordnername — als Signatur
    // fuer genau dieses Leftover-Muster tragbar (anders als hideCacheFolder/embedHeight, die
    // beide Werte legitim vom Nutzer stammen koennten).
    const kaputterCacheFolder = previousCacheFolder === SMOKE_CACHE_FOLDER;
    record(
      "8a. Kein liegen gebliebener Smoke-Cache-Ordner aus einem abgebrochenen Vorlauf",
      !kaputterCacheFolder,
      kaputterCacheFolder
        ? `cacheFolder trug noch ${SMOKE_CACHE_FOLDER} — auf leer (Plugin-Default) zurueckgesetzt`
        : "Ausgangszustand unauffaellig",
    );
    if (kaputterCacheFolder) previousCacheFolder = "";
    interface TrashProbe {
      ok: boolean;
      reason?: string;
      trashed?: string[];
      deleted?: string[];
      stillThere?: boolean;
    }
    const trash = await cdp.evaluate<TrashProbe>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.cacheFolder = ${JSON.stringify(SMOKE_CACHE_FOLDER)};
      await p.saveSettings();
      p.applyCacheFolderVisibility();

      const folder = ${JSON.stringify(SMOKE_CACHE_FOLDER)};
      if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
      const victimPath = ${JSON.stringify(SMOKE_CACHE_FILE)};
      const bytes = new TextEncoder().encode("%PDF-1.4\\n%%EOF\\n").buffer;
      const existing = app.vault.getAbstractFileByPath(victimPath);
      if (existing) await app.vault.modifyBinary(existing, bytes);
      else await app.vault.createBinary(victimPath, bytes);

      const trashed = [];
      const deleted = [];
      const fm = app.fileManager;
      const originalTrash = fm.trashFile;
      const originalDelete = app.vault.delete;
      fm.trashFile = async function (file) { trashed.push(file.path); return await originalTrash.call(fm, file); };
      app.vault.delete = async function (file, force) { deleted.push(file.path); return await originalDelete.call(app.vault, file, force); };
      try {
        // Der Befehls-Callback ist async und wird vom Host nicht awaited — gewartet wird
        // deshalb darauf, dass die Datei verschwindet, nicht auf den Rueckgabewert.
        const ran = app.commands.executeCommandById(${JSON.stringify(PLUGIN_ID)} + ":clear-cache");
        if (!ran) return { ok: false, reason: "Befehl clear-cache ist nicht registriert" };
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && app.vault.getAbstractFileByPath(victimPath)) {
          await new Promise((r) => setTimeout(r, 100));
        }
      } finally {
        fm.trashFile = originalTrash;
        app.vault.delete = originalDelete;
      }
      return { ok: true, trashed, deleted, stillThere: !!app.vault.getAbstractFileByPath(victimPath) };
    `);
    // `deleted` ist bewusst KEIN Fehlschlag-Kriterium: steht die Papierkorb-Einstellung des
    // Vaults auf "endgueltig loeschen", reicht `trashFile` intern an `vault.delete` durch —
    // ein Fehlschlag daran haenge an der Nutzer-Konfiguration, nicht am Code.
    record(
      "8. Cache-Leeren ruft fileManager.trashFile (Papierkorb-Einstellung des Nutzers)",
      trash.ok === true && trash.trashed?.includes(SMOKE_CACHE_FILE) === true && trash.stillThere === false,
      trash.ok
        ? `trashFile: ${trash.trashed?.length ?? 0}× · vault.delete: ${trash.deleted?.length ?? 0}×` +
            (trash.stillThere ? " · Datei liegt noch da" : "") +
            (trash.deleted?.length ? " (durchgereicht — Vault löscht endgültig)" : "")
        : (trash.reason ?? "unbekannt"),
    );
  } finally {
    // Normalweg: die Schritte rueckwaerts schliessen (Demo-Server, Dateien, Einstellungen). Nach Ctrl-C raeumt das Modul
    // auf, druckt die Bilanz und beendet den Prozess; dieser Zweig darf dann weder ein zweites Mal aufraeumen noch die
    // Bilanz ein zweites Mal drucken.
    await demoServer.schliesse();
    await dateien.schliesse();
    await einstellungen.schliesse();
    if (istAbgebrochen()) return;
    cdp.close();
    // Auch nach einem Fehler im Lauf kommt die Bilanz; `runDriver` macht daraus Exit 2.
    bilanz.abschluss();
  }

  console.log(`Gegenstelle der Embed-Punkte: ${gegenstelleName}`);
  if (herkunftsWarnung) console.log("⚠️  Herkunft des gemessenen Builds ungeprüft — s. Warnung oben.");
}

runDriver(main);
