import { describe, it, expect } from "vitest";
import { PaperlessHttpError, describeHttpError } from "../../src/core/errors";

// Der frueher hier stehende describe("extractErrorMessage")-Block ist mit dem Umstieg auf
// die Kit-Fassung entfallen: errorMessageFromText hat eigene Tests in obsidian-kit
// (tests/error_body.test.ts). Die zwei paperless-eigenen Eingaben leben unten als
// describeHttpError-Tests weiter — sie pruefen nicht mehr die Kaskade, sondern die
// hiesige Verdrahtung.
describe("PaperlessHttpError", () => {
  it("traegt Status und Rohbody", () => {
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(err.status).toBe(401);
    expect(err.body).toBe('{"detail":"Invalid token."}');
    expect(err).toBeInstanceOf(Error);
  });
  it("describeHttpError nennt Status und Servermeldung", () => {
    // Der einzige gegen die echte Instanz verifizierte Fall (CORE-TEST-02,
    // scripts/paperless-lab.ts:50 „401 bei falschem Token").
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(describeHttpError(err)).toContain("401");
    expect(describeHttpError(err)).toContain("Invalid token.");
  });
  it("describeHttpError faellt ohne lesbaren Body auf den Status zurueck", () => {
    expect(describeHttpError(new PaperlessHttpError(502, "<html>"))).toContain("502");
    // Konstruierter Unlesbar-Fall, nicht gemessen: pinnt, dass ein HTML-Body null ergibt
    // und der Rueckfall "HTTP <status>" OHNE Doppelpunkt lautet.
    expect(describeHttpError(new PaperlessHttpError(502, "<html>502</html>"))).toBe("HTTP 502");
  });
});
