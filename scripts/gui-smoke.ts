/**
 * GUI-Smoke-Treiber — fährt eine Checkliste gegen ein **laufendes** Obsidian statt von
 * Hand. Vendored aus `3d-codeblocks/scripts/gui-smoke.ts` (CDP-Brücke unverändert
 * übernommen, Skill `gui-smoke-setup`).
 *
 * Warum getrackt (CORE-TEST-02 b): ein Treiber, der nur im Session-Scratchpad liegt,
 * existiert genau einmal und ist beim nächsten Mal wieder Handarbeit.
 *
 * Was er prüft, das die 74 vitest-Tests strukturell nicht können: echtes
 * `embedRegistry`-Verhalten, Obsidians eigenen PDF-Viewer, echte Theme-/Explorer-DOM-
 * Mutationen — die Naht zum Host.
 *
 * ## Voraussetzung
 *
 * Obsidian muss mit offenem Debug-Port laufen (der einzige Handgriff, der Handarbeit
 * bleibt — die App muss dafür neu gestartet werden):
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * ```
 *
 * Dann, mit deployter Plugin-Version (`OBSIDIAN_PLUGIN_DIR=<vault>/.obsidian/plugins/paperless-storage npm run deploy`):
 *
 * ```bash
 * npm run smoke:gui
 * npm run smoke:gui -- --port 9222 --vault 00_ProtoVault --doc 1 --keep
 * ```
 *
 * ⚠️ Chromium drosselt das Rendering nicht-fokussierter Fenster: ohne
 * `Page.bringToFront` + `osascript activate` bleibt die View leer und man debuggt ein
 * Phantom (CORE-TEST-02).
 */

import { execFileSync } from "node:child_process";

const PLUGIN_ID = "paperless-storage";
/** Werden im Vault angelegt und am Ende wieder entfernt (außer mit `--keep`). */
const SMOKE_NOTE = "_pls-gui-smoke.md";
const SMOKE_STUB = "_pls-gui-smoke.paperless";

// --- CDP-Minimalbrücke ------------------------------------------------------
// Node ≥21 bringt `WebSocket` global mit — keine Dependency nötig.
// Verbatim aus 3d-codeblocks/scripts/gui-smoke.ts übernommen (Skill-Anweisung: die
// CDP-Brücke trägt die teuer erkauften Details, nicht neu bauen).

interface CdpTarget {
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  result?: { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
  error?: { message?: string };
}

class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { ok: (v: CdpResponse) => void; fail: (e: Error) => void }>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (message.id === undefined) return; // Event, kein Antwort-Frame
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.fail(new Error(message.error.message ?? "CDP-Fehler"));
      else waiter.ok(message);
    });
  }

  static async attach(port: number, vault?: string): Promise<Cdp> {
    let targets: CdpTarget[];
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = (await response.json()) as CdpTarget[];
    } catch {
      throw new Error(
        `Kein Debug-Port auf ${port}. Obsidian mit --remote-debugging-port=${port} neu starten ` +
          `(siehe Kopfkommentar).`,
      );
    }

    // Das Hauptfenster ist die Seite mit Obsidians app-Schema; Popouts und DevTools
    // tragen andere URLs. Ohne diese Auswahl landet man im falschen Renderer.
    const pages = targets.filter(
      (t) => t.type === "page" && t.url.startsWith("app://obsidian.md") && t.webSocketDebuggerUrl,
    );
    if (pages.length === 0) {
      const seen = targets.map((t) => `${t.type} ${t.url}`).join("\n  ") || "(keine)";
      throw new Error(`Kein Obsidian-Fenster unter den Targets gefunden:\n  ${seen}`);
    }

    // Mehrere offene Vaults sind der Normalfall, nicht die Ausnahme. Blind das erste
    // Fenster zu nehmen hiesse, den Smoke im falschen Vault zu fahren — und der
    // Fehlschlag saehe aus wie ein Plugin-Defekt ("Plugin nicht aktiv"). Der Titel
    // traegt den Vault-Namen ("<Notiz> - <Vault> - Obsidian x.y.z").
    const matching = vault
      ? pages.filter((t) => t.title.toLowerCase().includes(vault.toLowerCase()))
      : pages;
    if (matching.length === 0) {
      throw new Error(
        `Kein Fenster passt zu --vault ${vault}. Offen:\n  ${pages.map((t) => t.title).join("\n  ")}`,
      );
    }
    if (matching.length > 1) {
      throw new Error(
        `Mehrere Obsidian-Fenster offen — mit --vault <name> eines waehlen:\n  ` +
          matching.map((t) => t.title).join("\n  "),
      );
    }
    const page = matching[0];
    // Der Filter oben garantiert die URL, der Typ nicht — der Guard haelt beides zusammen.
    if (!page.webSocketDebuggerUrl) throw new Error(`Fenster ohne Debugger-URL: ${page.title}`);
    console.log(`Fenster: ${page.title}`);

    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("WebSocket-Verbindung fehlgeschlagen")), {
        once: true,
      });
    });
    return new Cdp(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<CdpResponse> {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      this.pending.set(id, { ok, fail });
      setTimeout(() => {
        if (!this.pending.delete(id)) return;
        fail(new Error(`Zeitüberschreitung: ${method}`));
      }, 30_000);
    });
  }

  /** Ausdruck im Renderer auswerten. Wirft die Renderer-Ausnahme weiter, statt sie
   *  als `undefined` zu verschlucken — sonst liest sich ein kaputter Ausdruck wie ein
   *  fehlgeschlagener Prüfpunkt. */
  async evaluate<T>(expression: string): Promise<T> {
    const message = await this.send("Runtime.evaluate", {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const details = message.result?.exceptionDetails;
    if (details) throw new Error(`Renderer: ${details.text ?? "Ausnahme"}`);
    return message.result?.result?.value as T;
  }

  close(): void {
    this.socket.close();
  }
}

// --- Prüfpunkte -------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Im Renderer: warten, bis `check()` wahr wird (Rendering ist asynchron). */
const waitFor = (body: string, timeoutMs = 8000): string => `
  const deadline = Date.now() + ${timeoutMs};
  while (Date.now() < deadline) {
    const value = (() => { ${body} })();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const keep = argv.includes("--keep");
  const docId = Number(flag("doc") ?? 1);
  const vault = flag("vault");

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);
  const cdp = await Cdp.attach(port, vault);
  // Ausserhalb des try, damit das `finally` sie auch nach einem Abbruch mitten im Lauf
  // zurueckschreiben kann — sonst bliebe der Vault im Smoke-Zustand stehen.
  let previousHideCacheFolder: boolean | null = null;
  let previousEmbedHeight: number | null | "unset" = "unset";

  try {
    // Ohne Fokus drosselt Chromium den Renderer (gemessen 2026-08-06 im Spike: DOM blieb
    // leer, obwohl `app.workspace` den Zustand korrekt meldete — man debuggt dann ein
    // Phantom). `Page.bringToFront` allein genuegt auf macOS NICHT.
    await cdp.send("Page.bringToFront");
    if (process.platform === "darwin") {
      try {
        execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
        await new Promise((resolve) => setTimeout(resolve, 1500));
      } catch {
        console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
      }
    }

    const vaultName = await cdp.evaluate<string>(`return window.app?.appId ? app.vault.getName() : "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultName}\n`);

    const plugin = await cdp.evaluate<{ ok: boolean; version?: string; configured?: boolean }>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      return p ? { ok: true, version: p.manifest.version, configured: !!(p.settings.serverUrl && p.settings.apiToken) } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst \`npm run deploy\`.`);
    if (!plugin.configured) {
      throw new Error(
        `Plugin ${PLUGIN_ID} hat keinen Server/Token in den Settings — Embed-/FileView-Checks bräuchten das.`,
      );
    }
    console.log(`Plugin-Version im Vault: ${plugin.version}\n`);

    const cacheFolder = await cdp.evaluate<string>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      const raw = (p.settings.cacheFolder ?? "").trim();
      const chosen = raw === "" ? "_paperless-storage" : raw;
      return chosen.replace(/^\\/+|\\/+$/g, "");
    `);

    previousHideCacheFolder = await cdp.evaluate<boolean>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.hideCacheFolder;
    `);
    previousEmbedHeight = await cdp.evaluate<number | null>(`
      return app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}].settings.embedHeight;
    `);

    // --- 1./2. Cache-Ordner-Sichtbarkeit (hide-folder.ts, Constructable Stylesheet) ---
    const hiddenState = await cdp.evaluate<string>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = true;
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      ${waitFor(`
        const el = document.querySelector('.nav-folder-title[data-path="${cacheFolder}"]');
        if (!el) return null;
        return getComputedStyle(el).display;
      `)}
    `);
    record(
      "1. Cache-Ordner ausgeblendet bei hideCacheFolder=true",
      hiddenState === "none",
      hiddenState === null ? "Ordner-Element nicht im Explorer gefunden" : `display: ${hiddenState}`,
    );

    const visibleState = await cdp.evaluate<string>(`
      const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
      p.settings.hideCacheFolder = false;
      await p.saveSettings();
      p.applyCacheFolderVisibility();
      ${waitFor(`
        const el = document.querySelector('.nav-folder-title[data-path="${cacheFolder}"]');
        if (!el) return null;
        return getComputedStyle(el).display;
      `)}
    `);
    record(
      "2. Cache-Ordner wieder sichtbar bei hideCacheFolder=false",
      visibleState !== null && visibleState !== "none",
      visibleState === null ? "Ordner-Element nicht im Explorer gefunden" : `display: ${visibleState}`,
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
    const embedLoaded = await cdp.evaluate<boolean>(
      waitFor(`
        const span = document.querySelector(".internal-embed");
        return !!span?.querySelector(".pdf-toolbar");
      `, 15000),
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
    const fileViewLoaded = await cdp.evaluate<boolean>(
      waitFor(`
        const content = document.querySelector(".view-content");
        return !!content?.querySelector(".pdf-toolbar");
      `, 15000),
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
  } finally {
    // Aufräumen darf nie am Ergebnis hängen: auch ein abgebrochener Lauf gibt den Vault
    // so zurück, wie er ihn vorgefunden hat.
    if (previousHideCacheFolder !== null) {
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.hideCacheFolder = ${JSON.stringify(previousHideCacheFolder)};
          await p.saveSettings();
          p.applyCacheFolderVisibility();
          return true;
        `)
        .catch(() => undefined);
    }
    if (previousEmbedHeight !== "unset") {
      await cdp
        .evaluate(`
          const p = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
          p.settings.embedHeight = ${JSON.stringify(previousEmbedHeight)};
          await p.saveSettings();
          return true;
        `)
        .catch(() => undefined);
    }
    if (!keep) {
      await cdp
        .evaluate(`
          const notePath = ${JSON.stringify(SMOKE_NOTE)};
          const stubPath = ${JSON.stringify(SMOKE_STUB)};
          const note = app.vault.getAbstractFileByPath(notePath);
          if (note) await app.vault.delete(note);
          const stub = app.vault.getAbstractFileByPath(stubPath);
          if (stub) await app.vault.delete(stub);
          return true;
        `)
        .catch(() => undefined);
    }
    cdp.close();
  }

  const failed = results.filter((check) => !check.passed);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const check of failed) console.log(`  - ${check.name}: ${check.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
