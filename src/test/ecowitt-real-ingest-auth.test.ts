import { describe, it, expect } from "vitest";
import { validateEcoWittBridgeAuthorization } from "@/lib/ecowittRealIngestAuth";

const TOKEN = "vbt_phase1_test_token_value";

describe("validateEcoWittBridgeAuthorization", () => {
  it("rejects missing header as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization(undefined, TOKEN);
    expect(r.status).toBe("unauthorized");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("missing_authorization_header");
  });

  it("rejects null header as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization(null, TOKEN);
    expect(r.status).toBe("unauthorized");
  });

  it("rejects empty header as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization("   ", TOKEN);
    expect(r.status).toBe("unauthorized");
    expect(r.reason).toBe("missing_authorization_header");
  });

  it("rejects malformed header (no space) as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization("BearerXYZ", TOKEN);
    expect(r.status).toBe("unauthorized");
    expect(r.reason).toBe("malformed_authorization_header");
  });

  it("rejects non-Bearer scheme as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization(`Basic ${TOKEN}`, TOKEN);
    expect(r.status).toBe("unauthorized");
    expect(r.reason).toBe("unsupported_auth_scheme");
  });

  it("rejects Bearer with empty token as unauthorized", () => {
    const r = validateEcoWittBridgeAuthorization("Bearer    ", TOKEN);
    // "Bearer    " trims/splits to scheme=Bearer + empty token
    expect(r.status).toBe("unauthorized");
  });

  it("returns not_configured when caller presents creds but server token missing", () => {
    const r = validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, "");
    expect(r.status).toBe("not_configured");
    expect(r.reason).toBe("server_token_not_configured");
  });

  it("returns not_configured when expected token is null", () => {
    const r = validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, null);
    expect(r.status).toBe("not_configured");
  });

  it("returns forbidden on wrong token", () => {
    const r = validateEcoWittBridgeAuthorization("Bearer wrong-value", TOKEN);
    expect(r.status).toBe("forbidden");
    expect(r.reason).toBe("token_mismatch");
  });

  it("returns authorized on exact Bearer match", () => {
    const r = validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, TOKEN);
    expect(r.status).toBe("authorized");
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("ok");
  });

  it("accepts case-insensitive scheme", () => {
    const r = validateEcoWittBridgeAuthorization(`bearer ${TOKEN}`, TOKEN);
    expect(r.status).toBe("authorized");
  });

  it("never returns or includes the token value in result", () => {
    const cases = [
      validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, TOKEN),
      validateEcoWittBridgeAuthorization(`Bearer wrong`, TOKEN),
      validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, ""),
      validateEcoWittBridgeAuthorization(undefined, TOKEN),
    ];
    for (const r of cases) {
      const s = JSON.stringify(r);
      expect(s).not.toContain(TOKEN);
      expect(s).not.toContain("wrong");
    }
  });

  it("treats different-length tokens as mismatch (not crash)", () => {
    const r = validateEcoWittBridgeAuthorization("Bearer short", TOKEN);
    expect(r.status).toBe("forbidden");
  });

  it("is deterministic for identical input", () => {
    const a = validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, TOKEN);
    const b = validateEcoWittBridgeAuthorization(`Bearer ${TOKEN}`, TOKEN);
    expect(a).toEqual(b);
  });
});
