// Der Cache aktualisierte nie: `needsRefresh` verglich gegen `stub.checksum`, und kein Codepfad
// schrieb sie. Jetzt haelt ein Sidecar neben dem Cache-PDF die Pruefsumme, mit der es geladen wurde.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeEl } from "../vendor/kit/obsidian-mock";
import { renderStub, type RenderDeps } from "../../src/obsidian/render-core";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { PaperlessHttpError } from "../../src/core/errors";

const PDF = "_paperless-storage/7.pdf";

function setup(opts: { cached?: boolean; sidecar?: string; serverChecksum?: string; offline?: boolean; status?: number; configured?: boolean } = {}) {
  const files = new Map<string, string | ArrayBuffer>();
  if (opts.cached) files.set(PDF, new ArrayBuffer(4));
  const sidecars = new Map<string, string>();
  if (opts.sidecar) sidecars.set(PDF, opts.sidecar);
  let serverChecksum = opts.serverChecksum ?? "C1";
  const binary = vi.fn(() => (opts.offline ? Promise.reject(new PaperlessHttpError(0, "down")) : Promise.resolve(new ArrayBuffer(8))));
  const transport = {
    text: vi.fn(() => (opts.status ? Promise.reject(new PaperlessHttpError(opts.status, "x")) : opts.offline ? Promise.reject(new PaperlessHttpError(0, "down")) : Promise.resolve(JSON.stringify({ id: 7, title: "x", checksum: serverChecksum, created: "" })))),
    binary,
  };
  const cache = {
    has: (p: string) => files.has(p),
    file: (p: string) => (files.has(p) ? ({ path: p } as never) : null),
    store: vi.fn((p: string, b: ArrayBuffer) => { files.set(p, b); return Promise.resolve({ path: p } as never); }),
    readChecksum: vi.fn((p: string) => Promise.resolve(sidecars.get(p))),
    writeChecksum: vi.fn((p: string, c: string) => { sidecars.set(p, c); return Promise.resolve(); }),
  };
  const deps = {
    app: { vault: { cachedRead: () => Promise.resolve('{"id":7,"title":"x"}') } },
    transport, cache,
    settings: () => ({ ...DEFAULT_SETTINGS, serverUrl: opts.configured === false ? "" : "https://p.example", apiToken: opts.configured === false ? "" : "T" }),
  } as unknown as RenderDeps;
  const container = makeFakeEl();
  const run = () => renderStub(deps, { path: "x.paperless" } as never, container, { addChild: vi.fn(), register: vi.fn() } as never);
  return { run, container, deps, transport, binary, cache, sidecars, setServer: (c: string) => { serverChecksum = c; } };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("renderStub — Pruefsumme im Sidecar", () => {
  it("laedt ohne Cache und haelt die Pruefsumme der geladenen Bytes fest", async () => {
    const t = setup();
    await t.run();
    expect(t.binary).toHaveBeenCalledTimes(1);
    expect(t.sidecars.get(PDF)).toBe("C1");
  });

  it("holt ein unveraendertes Dokument NICHT neu", async () => {
    const t = setup({ cached: true, sidecar: "C1", serverChecksum: "C1" });
    await t.run();
    expect(t.binary).not.toHaveBeenCalled();
  });

  it("holt neu, wenn das Dokument im Server ersetzt wurde, und aktualisiert die Pruefsumme", async () => {
    const t = setup({ cached: true, sidecar: "C1", serverChecksum: "C2" });
    await t.run();
    expect(t.binary).toHaveBeenCalledTimes(1);
    expect(t.sidecars.get(PDF)).toBe("C2");
  });

  it("ein Cache ohne bekannte Pruefsumme (vor dem Sidecar) wird einmal neu geladen und danach verglichen", async () => {
    const t = setup({ cached: true, serverChecksum: "C1" });
    await t.run();
    expect(t.binary).toHaveBeenCalledTimes(1);
    expect(t.sidecars.get(PDF)).toBe("C1");
    await t.run();
    expect(t.binary).toHaveBeenCalledTimes(1);
  });

  it("offline gilt der Cache, auch ohne bekannte Pruefsumme — nichts wird geladen", async () => {
    const t = setup({ cached: true, offline: true });
    await t.run();
    expect(t.binary).not.toHaveBeenCalled();
    expect(t.cache.writeChecksum).not.toHaveBeenCalled();
  });

  it("ein nicht schreibbarer Sidecar kostet die Anzeige nicht", async () => {
    const t = setup();
    t.cache.writeChecksum.mockRejectedValueOnce(new Error("read-only"));
    await expect(t.run()).resolves.toBeUndefined();
    expect(t.binary).toHaveBeenCalledTimes(1);
  });

  // Embed und FileView rendern dasselbe Dokument oft gleichzeitig; ohne Reihung luden beide herunter.
  it("zwei gleichzeitige Anzeigen desselben veraenderten Dokuments laden es nur einmal", async () => {
    const t = setup({ cached: true, sidecar: "C1", serverChecksum: "C2" });
    await Promise.all([t.run(), t.run()]);
    expect(t.binary).toHaveBeenCalledTimes(1);
    expect(t.sidecars.get(PDF)).toBe("C2");
  });
});

// Funktions-Inventur 2026-10-07: Lade-/Fehlerzustand ohne Icon, ohne is-*-Klasse, ohne aria-live;
// kein Erneut-versuchen-Knopf; "nicht eingerichtet" ohne Weg in die Settings.
describe("renderStub — Zustandsanzeige", () => {
  const msg = (c: any): any => c.querySelector(".paperless-storage-message");
  const button = (c: any, label: string): any =>
    c.querySelectorAll("button").find((b: any) => b.textContent === label);

  it("ein Fehler ohne Cache hat Icon, is-error, aria-live und einen Erneut-versuchen-Knopf", async () => {
    const t = setup({ offline: true });
    await t.run();
    const el = msg(t.container);
    expect(String(el.className)).toContain("is-error");
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.querySelector(".paperless-storage-status-icon").getAttribute("data-icon")).toBe("circle-x");
    expect(button(t.container, "Retry")).toBeDefined();
  });

  it("Erneut versuchen rendert neu und holt jetzt das Dokument, wenn der Server wieder antwortet", async () => {
    const t = setup({ offline: true });
    await t.run();
    const before = t.binary.mock.calls.length;
    t.transport.text.mockImplementation(() => Promise.resolve(JSON.stringify({ id: 7, title: "x", checksum: "C1", created: "" })));
    t.binary.mockImplementation(() => Promise.resolve(new ArrayBuffer(8)));
    button(t.container, "Retry").click();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    expect(t.binary.mock.calls.length).toBe(before + 1);
    expect(t.sidecars.get(PDF)).toBe("C1");
  });

  it("ein abgelehnter Token bietet Einstellungen UND Erneut versuchen", async () => {
    const t = setup({ status: 401 });
    await t.run();
    expect(button(t.container, "Open settings")).toBeDefined();
    expect(button(t.container, "Retry")).toBeDefined();
  });

  it("'nicht eingerichtet' hat einen Knopf, der die Plugin-Einstellungen oeffnet", async () => {
    const t = setup({ configured: false });
    const open = vi.fn();
    const openTabById = vi.fn();
    (t.deps.app as unknown as { setting: unknown }).setting = { open, openTabById };
    await t.run();
    expect(String(msg(t.container).className)).toContain("is-warning");
    button(t.container, "Open settings").click();
    expect(open).toHaveBeenCalled();
    expect(openTabById).toHaveBeenCalledWith("paperless-storage");
  });

  it("ein gefundener Cache bei Netzausfall zeigt eine Warnung (is-warning) mit Erneut versuchen", async () => {
    const t = setup({ cached: true, offline: true });
    await t.run();
    expect(String(msg(t.container).className)).toContain("is-warning");
    expect(button(t.container, "Retry")).toBeDefined();
  });

  it("'nicht gefunden' ist ein Fehler ohne Erneut versuchen (es hilft nicht)", async () => {
    const t = setup({ status: 404 });
    await t.run();
    expect(String(msg(t.container).className)).toContain("is-error");
    expect(button(t.container, "Retry")).toBeUndefined();
  });
});

