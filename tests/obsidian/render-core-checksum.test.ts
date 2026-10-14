// Der Cache aktualisierte nie: `needsRefresh` verglich gegen `stub.checksum`, und kein Codepfad
// schrieb sie. Jetzt haelt ein Sidecar neben dem Cache-PDF die Pruefsumme, mit der es geladen wurde.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeEl } from "../vendor/kit/obsidian-mock";
import { renderStub, type RenderDeps } from "../../src/obsidian/render-core";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { PaperlessHttpError } from "../../src/core/errors";

const PDF = "_paperless-storage/7.pdf";

function setup(opts: { cached?: boolean; sidecar?: string; serverChecksum?: string; offline?: boolean } = {}) {
  const files = new Map<string, string | ArrayBuffer>();
  if (opts.cached) files.set(PDF, new ArrayBuffer(4));
  const sidecars = new Map<string, string>();
  if (opts.sidecar) sidecars.set(PDF, opts.sidecar);
  let serverChecksum = opts.serverChecksum ?? "C1";
  const binary = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
  const transport = {
    text: vi.fn(() => (opts.offline ? Promise.reject(new PaperlessHttpError(0, "down")) : Promise.resolve(JSON.stringify({ id: 7, title: "x", checksum: serverChecksum, created: "" })))),
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
    settings: () => ({ ...DEFAULT_SETTINGS, serverUrl: "https://p.example", apiToken: "T" }),
  } as unknown as RenderDeps;
  const run = () => renderStub(deps, { path: "x.paperless" } as never, makeFakeEl(), { addChild: vi.fn(), register: vi.fn() } as never);
  return { run, binary, cache, sidecars, setServer: (c: string) => { serverChecksum = c; } };
}

beforeEach(() => vi.clearAllMocks());

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

