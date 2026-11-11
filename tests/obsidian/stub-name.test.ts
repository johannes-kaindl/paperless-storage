import { describe, expect, it } from "vitest";
import { stubBaseName } from "../../src/obsidian/stub-name";

/** Ein App-Double ohne das Plugin filename-sanitizer: es gilt der Rückfall auf die Kit-Regeln. */
const noPlugin = { plugins: { plugins: {} } };
/** Mit dem Plugin: dessen Richtlinie entscheidet (hier: alles Verbotene wird zu "~"). */
const withPlugin = (calls: Array<{ name: string; caller: string; kind: unknown }> = []) => ({
  plugins: {
    plugins: {
      "filename-sanitizer": {
        api: {
          version: 1,
          sanitizeName: (name: string, opts: { caller: string; kind?: unknown }) => {
            calls.push({ name, caller: opts.caller, kind: opts.kind });
            return { name: name.replace(/[\\/:*?"<>|#^[\]]/g, "~"), changed: true, hits: [] };
          },
          checkName: () => ({ valid: true, hits: [] }),
        },
      },
    },
  },
});

describe("stubBaseName", () => {
  it("lässt normale Titel unverändert", () => {
    expect(stubBaseName(noPlugin as never, "Mietvertrag 2024")).toBe("Mietvertrag 2024");
  });

  it("ersetzt alle in Dateinamen und Links verbotenen Zeichen (Kit-Regeln ohne das Plugin)", () => {
    // Ein Titel, der jedes Zeichen der Richtlinie trägt: \ / : * ? " < > | # ^ [ ]
    const name = stubBaseName(noPlugin as never, 'a\\b/c: d*e?f"g<h>i|j#k^l[m]n');
    expect(name).not.toMatch(/[\\/:*?"<>|#^[\]]/);
    expect(name).toBe("a-b-c — d_ef'ghi-j k l(m)n");
  });

  it("macht aus Rechnung #123 einen Namen, der als Wikilink-Ziel taugt", () => {
    expect(stubBaseName(noPlugin as never, "Rechnung #123 [Entwurf]")).toBe("Rechnung 123 (Entwurf)");
  });

  it("fällt bei leerem Titel auf Untitled zurück", () => {
    expect(stubBaseName(noPlugin as never, "")).toBe("Untitled");
    expect(stubBaseName(noPlugin as never, "   ")).toBe("Untitled");
    expect(stubBaseName(noPlugin as never, "...")).toBe("Untitled");
  });

  it("kappt sehr lange Titel auf 100 Zeichen und lässt kein Leerzeichen oder keinen Punkt am Ende zurück", () => {
    expect(stubBaseName(noPlugin as never, "x".repeat(150))).toHaveLength(100);
    expect(stubBaseName(noPlugin as never, `${"x".repeat(99)} y`)).toBe("x".repeat(99));
  });

  it("kappt auch nach Bytes (Dateinamen haben höchstens 255, `.paperless` braucht zehn) und zerschneidet kein Zeichen", () => {
    const name = stubBaseName(noPlugin as never, "😀".repeat(150));
    expect(new TextEncoder().encode(`${name}.paperless`).length).toBeLessThanOrEqual(255);
    expect(name).toBe("😀".repeat([...name].length));
    expect([...name].length).toBeGreaterThan(50);
  });

  it("fragt zuerst das Plugin filename-sanitizer, nennt sich als Aufrufer und liest den Namen als Ordnername (ohne Endung)", () => {
    const calls: Array<{ name: string; caller: string; kind: unknown }> = [];
    expect(stubBaseName(withPlugin(calls) as never, "Rechnung: März #1")).toBe("Rechnung~ März ~1");
    expect(calls).toEqual([{ name: "Rechnung: März #1", caller: "paperless-storage", kind: "folder" }]);
  });

  it("behält einen Punkt mitten im Titel (kein Dateiendungs-Missverständnis)", () => {
    expect(stubBaseName(noPlugin as never, "Bericht v1.2")).toBe("Bericht v1.2");
    expect(stubBaseName(noPlugin as never, "Scan 12.5")).toBe("Scan 12.5");
  });
});
