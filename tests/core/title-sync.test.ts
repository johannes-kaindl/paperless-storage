import { describe, it, expect } from "vitest";
import { planTitleSync, type StubRecord } from "../../src/core/title-sync";
import type { DocumentMeta } from "../../src/core/paperless-api";

function meta(id: number, title: string): DocumentMeta {
  return { id, title, checksum: "c", created: "2026-01-01" };
}

describe("planTitleSync", () => {
  it("plant eine Umbenennung bei geaendertem Titel", () => {
    const stubs: StubRecord[] = [{ path: "Alt.paperless", stub: { id: 1, title: "Alt" } }];
    const metaById = new Map([[1, meta(1, "Neu")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([{ path: "Alt.paperless", newTitle: "Neu" }]);
  });
  it("plant nichts bei gleichem Titel", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    const metaById = new Map([[1, meta(1, "X")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([]);
  });
  it("ueberspringt Stubs ohne erreichbare Metadaten", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    expect(planTitleSync(stubs, new Map())).toEqual([]);
  });
  it("ueberspringt einen leeren Server-Titel", () => {
    const stubs: StubRecord[] = [{ path: "X.paperless", stub: { id: 1, title: "X" } }];
    const metaById = new Map([[1, meta(1, "")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([]);
  });
  it("verarbeitet mehrere Stubs unabhaengig", () => {
    const stubs: StubRecord[] = [
      { path: "A.paperless", stub: { id: 1, title: "A" } },
      { path: "B.paperless", stub: { id: 2, title: "B-alt" } },
    ];
    const metaById = new Map([[1, meta(1, "A")], [2, meta(2, "B-neu")]]);
    expect(planTitleSync(stubs, metaById)).toEqual([{ path: "B.paperless", newTitle: "B-neu" }]);
  });
});
