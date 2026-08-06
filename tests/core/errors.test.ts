import { describe, it, expect } from "vitest";
import { PaperlessHttpError, extractErrorMessage, describeHttpError } from "../../src/core/errors";

describe("extractErrorMessage", () => {
  it("liest error.message", () => {
    expect(extractErrorMessage('{"error":{"message":"kaputt"}}')).toBe("kaputt");
  });
  it("liest error als String", () => {
    expect(extractErrorMessage('{"error":"kaputt"}')).toBe("kaputt");
  });
  it("liest message", () => {
    expect(extractErrorMessage('{"message":"kaputt"}')).toBe("kaputt");
  });
  it("liest detail (DRF/FastAPI-Form)", () => {
    expect(extractErrorMessage('{"detail":"Invalid token."}')).toBe("Invalid token.");
  });
  it("gibt null bei unlesbarem Body", () => {
    expect(extractErrorMessage("<html>502</html>")).toBeNull();
    expect(extractErrorMessage("")).toBeNull();
  });
  it("bevorzugt error.message vor detail", () => {
    expect(extractErrorMessage('{"error":{"message":"a"},"detail":"b"}')).toBe("a");
  });
});

describe("PaperlessHttpError", () => {
  it("traegt Status und Rohbody", () => {
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(err.status).toBe(401);
    expect(err.body).toBe('{"detail":"Invalid token."}');
    expect(err).toBeInstanceOf(Error);
  });
  it("describeHttpError nennt Status und Servermeldung", () => {
    const err = new PaperlessHttpError(401, '{"detail":"Invalid token."}');
    expect(describeHttpError(err)).toContain("401");
    expect(describeHttpError(err)).toContain("Invalid token.");
  });
  it("describeHttpError faellt ohne lesbaren Body auf den Status zurueck", () => {
    expect(describeHttpError(new PaperlessHttpError(502, "<html>"))).toContain("502");
  });
});
