/**
 * Aufnahme-Treiber fuer die README-Bilder — faehrt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian (Skill `readme-shots`). Bruecke, Aufnahme-Primitive und
 * Fixture→Vault liegen zentral im Dach (`../../tools/obsidian-cdp/`).
 *
 * Die Bilder zeigen KEINE echte paperless-Instanz: `scripts/demo-paperless.ts` startet einen
 * Minimal-Server mit erfundenen Dokumenten, und das Plugin wird fuer die Aufnahme darauf
 * gerichtet. Die echte Test-Instanz haelt private Unterlagen.
 *
 * ## Ablauf (Zweitinstanz, eigener Port — die reguelaere Instanz auf 9222 bleibt tabu)
 *
 * ```bash
 * npm run build && npm run shots -- --setup          # Vault aus dem Fixture bauen
 * UD=/tmp/obs-test-paperless-storage                  # Profil: Sprache Englisch (obsidian.json
 * # UND localStorage "language"), aktuelle .asar hineinkopiert, Vault in obsidian.json
 * /Applications/Obsidian.app/Contents/MacOS/Obsidian --user-data-dir="$UD" --remote-debugging-port=9328 &
 * python3 ~/.claude/hooks/obsidian-cdp-lock.py acquire --label paperless-storage \
 *   --intent "shots.ts" --exclusive focus --port 9328 --ttl 600
 * npm run shots -- --port 9328                        # alles; --only hero.png fuer eines
 * ```
 *
 * Wird das Fenster nach dem ersten Lauf `visibilityState=hidden`, hilft ein Prozess-Neustart
 * der eigenen Instanz. `--setup` schreibt `data.json` mit dem Demo-Server und dem Dummy-Token
 * `demo-token`; danach fuer den GUI-Smoke `npm run smoke:gui -- --setup` (echte Zugangsdaten).
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, exit } from "node:process";

import {
  attachTo,
  Cdp,
  closeExtraLeaves,
  openExisting,
  pollUntil,
  requireVisible,
  setAppConfig,
} from "../../tools/obsidian-cdp/cdp.js";
import { boxOf, capture, setWindowSize, writeShot, type Rect, type ShotOptions } from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";
import { DEMO_TOKEN, startDemoServer } from "./demo-paperless.js";

const PLUGIN_ID = "paperless-storage";
const REPO_NAME = "paperless-storage";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const FENSTER_BREITE = 1300;
const FENSTER_HOEHE = 860;
const DEMO_PORT = 8765;
const DEMO_URL = `http://127.0.0.1:${DEMO_PORT}`;
const NOTE = "Home office.md";
const STUB = "Acme Consulting — Service Agreement.paperless";
/** Was im Bild statt der Demo-Adresse stehen soll (nur in der Darstellung, nie gespeichert). */
/** Feste Embed-Hoehe fuer die Notiz-Bilder (Einstellung „Default embed height“): die A4-Seite
 *  ist sonst hoeher als das Fenster. Das Einstellungsbild setzt sie zurueck auf den Standard. */
const EMBED_HOEHE = 520;
const SHOW_URL = "https://paperless.lan";

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  /** Stellt den Zustand her und liefert den Ausschnitt (null = nicht aufnehmbar). */
  run(cdp: Cdp): Promise<Rect | null>;
}

const PDF_SICHTBAR = `
  [...document.querySelectorAll(".internal-embed .pdf-toolbar")]
    .filter((e) => e.getBoundingClientRect().width > 1)`;

/** Notiz mit dem Embed oeffnen und warten, bis Obsidians PDF-Viewer wirklich steht. */
async function notizMitEmbed(cdp: Cdp): Promise<boolean> {
  await cdp.send("Page.bringToFront");
  await setAppConfig(cdp, "livePreview", true);
  // Erst auf eine andere Notiz: eine bereits offene Notiz rendert ihre Embeds beim erneuten
  // Oeffnen nicht neu und zeigt sonst den Zustand des vorigen Bildes (etwa den Offline-Hinweis).
  if (!(await openExisting(cdp, "Welcome.md", "preview"))) return false;
  if (!(await openExisting(cdp, NOTE, "preview"))) return false;
  await closeExtraLeaves(cdp);
  const da = await pollUntil<boolean>(cdp, `return (${PDF_SICHTBAR}).length > 0;`, 20_000, 300);
  if (!da) {
    const lage = await cdp.evaluate<string>(`
      return JSON.stringify({
        sichtbar: document.visibilityState,
        datei: app.workspace.getActiveFile()?.path ?? null,
        meldungen: [...document.querySelectorAll(".paperless-storage-message")].map((e) => e.textContent),
        embeds: document.querySelectorAll(".internal-embed").length,
        toolbars: [...document.querySelectorAll(".pdf-toolbar")].map((e) => Math.round(e.getBoundingClientRect().width)),
      });`);
    console.log(`      · Embed nicht bereit — ${lage}`);
  }
  return Boolean(da);
}

/** Die Statusleiste unten rechts traegt in einem frischen Profil ein rotes Sync-Symbol —
 *  Obsidian-Eigenheit, kein Teil des Plugins; der Ausschnitt endet darueber. */
function ohneStatusleiste(box: Rect | null): Rect | null {
  return box ? { ...box, height: box.height - 44 } : null;
}

const SHOTS: Shot[] = [
  {
    name: "hero.png",
    klasse: "hero",
    async run(cdp) {
      if (!(await notizMitEmbed(cdp))) return null;
      // Auf die Seite warten: die Toolbar steht frueher als die erste gezeichnete Seite.
      await pollUntil<boolean>(cdp, `
        return [...document.querySelectorAll(".internal-embed canvas, .internal-embed .page")]
          .some((e) => e.getBoundingClientRect().width > 1);`, 15_000, 300);
      await new Promise((r) => setTimeout(r, 1500));
      await cdp.evaluate(`document.querySelectorAll(".markdown-preview-view").forEach((e) => { e.scrollTop = 0; }); return true;`);
      await new Promise((r) => setTimeout(r, 900));
      return ohneStatusleiste(await boxOf(cdp, ".app-container", 0));
    },
  },
  {
    name: "insert-document.png",
    klasse: "feature",
    async run(cdp) {
      await cdp.send("Page.bringToFront");
      await setAppConfig(cdp, "livePreview", true);
      if (!(await openExisting(cdp, NOTE, "source"))) return null;
      await closeExtraLeaves(cdp);
      await cdp.evaluate(`
        const editor = app.workspace.activeEditor?.editor ?? app.workspace.getActiveViewOfType(require("obsidian").MarkdownView)?.editor;
        editor.setCursor({ line: editor.lineCount(), ch: 0 });
        app.commands.executeCommandById("${PLUGIN_ID}:insert-document");
        return true;`);
      const offen = await pollUntil<boolean>(cdp, `return !!document.querySelector(".prompt-input");`, 8_000, 200);
      if (!offen) return null;
      // Tippen wie ein Nutzer: der Wert allein loest die Suche nicht aus.
      await cdp.send("Input.insertText", { text: "2026" });
      const treffer = await pollUntil<boolean>(cdp,
        `return document.querySelectorAll(".prompt .suggestion-item").length >= 3;`, 8_000, 200);
      if (!treffer) return null;
      await new Promise((r) => setTimeout(r, 400));
      const modal = await boxOf(cdp, ".prompt", 6);
      return modal;
    },
  },
  {
    name: "offline-cache.png",
    klasse: "feature",
    async run(cdp) {
      // Der Embed ist im Cache; den Server abschalten und neu rendern: das Dokument
      // bleibt lesbar, ein Hinweis nennt den Grund.
      if (!(await notizMitEmbed(cdp))) return null;
      return null; // ersetzt in main(): braucht den Server-Handle
    },
  },
];

/** Der Einstellungen-Tab lebt in einem EIGENEN Fenster (siehe 3d-codeblocks/scripts/shots.ts). */
async function settingsBild(cdp: Cdp, port: number, opts: ShotOptions): Promise<string> {
  // Auslieferungszustand: die feste Embed-Hoehe der Notiz-Bilder ist ein Eingriff des Treibers.
  await cdp.evaluate(`
    const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    p.settings.embedHeight = null; await p.saveSettings(); return true;`);
  await cdp.evaluate(`
    app.setting.open();
    app.setting.openTabById(${JSON.stringify(PLUGIN_ID)});
    await new Promise((r) => setTimeout(r, 900));
    return true;`);
  const fenster = await attachTo("settings", port, REPO_NAME);
  if (!fenster) return "settings.png — kein Einstellungen-Fenster gefunden";
  try {
    await fenster.send("Page.bringToFront");
    await setWindowSize(fenster, 1100, 900);
    await new Promise((r) => setTimeout(r, 600));
    // Nur die DARSTELLUNG: Demo-Adresse durch eine generische ersetzen. Kein change-Ereignis,
    // gespeichert wird nichts.
    await fenster.evaluate(`
      for (const input of document.querySelectorAll(".vertical-tab-content input[type=text]")) {
        if (input.value === ${JSON.stringify(DEMO_URL)}) input.value = ${JSON.stringify(SHOW_URL)};
      }
      return true;`);
    // Nur die gefuellte Flaeche (bis zur letzten Zeile), nicht das ganze Fenster: darunter ist Leere.
    const rows = await fenster.evaluate<Rect | null>(`
      const items = [...document.querySelectorAll(".vertical-tab-content .setting-item")];
      if (!items.length) return null;
      const first = items[0].getBoundingClientRect(), last = items[items.length - 1].getBoundingClientRect();
      return { x: first.x - 24, y: first.y - 24, width: first.width + 48, height: last.bottom - first.top + 48 };`);
    const box = rows ?? (await boxOf(fenster, ".vertical-tab-content", 0));
    if (!box) return "settings.png — kein Inhaltsbereich im Einstellungen-Fenster";
    const png = await capture(fenster, box);
    return await writeShot(fenster, "settings.png", png, opts);
  } finally {
    await fenster.evaluate("window.close(); return true;").catch(() => undefined);
    fenster.close();
  }
}

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(): Promise<void> {
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);
  const vaultDir = stagingVaultDir(REPO_NAME);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    console.log("  feature  settings.png");
    return;
  }

  if (argv.includes("--setup")) {
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({ repoRoot, vaultDir, fixtureDir: join(repoRoot, "docs/images/fixture"), pluginId: PLUGIN_ID })) {
      console.log(`  ${zeile}`);
    }
    // Dummy-Zugangsdaten fuer den Demo-Server; nie echte Werte (das Fixture ist getrackt,
    // data.json ist es nicht).
    writeFileSync(
      join(vaultDir, ".obsidian", "plugins", PLUGIN_ID, "data.json"),
      JSON.stringify({ serverUrl: DEMO_URL, apiToken: DEMO_TOKEN, cacheFolder: "_paperless-storage/", hideCacheFolder: true }, null, 2),
    );
    console.log("  data.json: Demo-Server + Dummy-Token geschrieben\n\nObsidian jetzt NEU STARTEN (eigene Instanz), dann: npm run shots -- --port <port>");
    return;
  }

  const port = Number(flag("--port") ?? process.env.SHOTS_PORT ?? 9222);
  if (port === 9222) throw new Error("Port 9222 ist die reguelaere Instanz — Aufnahmen laufen in einer Zweitinstanz.");
  const nur = flag("--only");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const demo = await startDemoServer(DEMO_PORT);
  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) throw new Error(`Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.`);
  console.log(`Verbunden auf Port ${port}; Demo-Server ${demo.url}.\n`);
  let fehlend = 0;
  try {
    await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));
    await requireVisible(cdp);
    await cdp.send("Page.bringToFront");
    await new Promise((r) => setTimeout(r, 3000));

    // Sprache: die Bilder sind englisch (App-weit, localStorage UND obsidian.json).
    const sprache = await cdp.evaluate<string>(`return String(window.localStorage.getItem("language"));`);
    if (sprache !== "en") throw new Error(`Oberflaechensprache ist "${sprache}", nicht "en" — Profil und localStorage setzen, neu starten.`);

    // Auslieferungszustand: Demo-Adresse + Dummy-Token, Ordner ausgeblendet, keine feste Hoehe.
    await cdp.evaluate(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      Object.assign(p.settings, { serverUrl: ${JSON.stringify(DEMO_URL)}, apiToken: ${JSON.stringify(DEMO_TOKEN)},
        cacheFolder: "_paperless-storage/", hideCacheFolder: true, fileVersion: "archive", embedHeight: ${EMBED_HOEHE} });
      await p.saveSettings(); p.applyCacheFolderVisibility();
      return true;`);
    await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
    await setAppConfig(cdp, "showInlineTitle", false);

    const opts: ShotOptions = { outDir, captureWidth: CAPTURE_WIDTH, thumbWidth: THUMB_WIDTH };
    for (const shot of SHOTS) {
      if (nur && shot.name !== nur) continue;
      try {
        let box: Rect | null;
        if (shot.name === "offline-cache.png") {
          // Erst online laden (fuellt den Cache), dann den Server abschalten und neu oeffnen.
          if (!(await notizMitEmbed(cdp))) { box = null; }
          else {
            await new Promise((r) => setTimeout(r, 1500));
            await demo.close();
            await cdp.evaluate(`app.workspace.getLeaf(false).setViewState({ type: "empty" }); return true;`);
            await openExisting(cdp, "Welcome.md", "preview");
            await openExisting(cdp, NOTE, "preview");
            const hinweis = await pollUntil<boolean>(cdp,
              `return [...document.querySelectorAll(".paperless-storage-message")].some((e) => /Server unreachable/.test(e.textContent ?? ""));`,
              20_000, 300);
            await new Promise((r) => setTimeout(r, 1500));
            box = hinweis ? ohneStatusleiste(await boxOf(cdp, ".app-container", 0)) : null;
          }
        } else {
          box = await shot.run(cdp);
        }
        const png = box ? await capture(cdp, box) : null;
        await cdp.evaluate(`document.querySelector(".prompt")?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); return true;`);
        await closeExtraLeaves(cdp);
        if (!png) { console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`); fehlend++; continue; }
        console.log(`  ✓ ${await writeShot(cdp, shot.name, png, { ...opts, thumb: shot.klasse === "detail" })}`);
      } catch (err) {
        console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
        fehlend++;
      }
    }
    if (!nur || nur === "settings.png") console.log(`  · ${await settingsBild(cdp, port, opts)}`);
  } finally {
    cdp.close();
    await demo.close().catch(() => undefined);
  }
  if (fehlend) exit(1);
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
