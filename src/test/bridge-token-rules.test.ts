import { describe, it, expect } from "vitest";
import {
  bridgeTokenStatus,
  clampTtlDays,
  sanitizeTokenName,
  looksLikeBridgeToken,
  formatIngestCount,
  BRIDGE_TOKEN_MAX_TTL_DAYS,
  BRIDGE_TOKEN_MIN_TTL_DAYS,
  BRIDGE_TOKEN_DEFAULT_TTL_DAYS,
} from "@/lib/bridgeTokenRules";

describe("bridgeTokenRules", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it("status: active when not revoked and not expired", () => {
    expect(bridgeTokenStatus({ expires_at: future, revoked_at: null })).toBe("active");
  });
  it("status: revoked when revoked_at set", () => {
    expect(bridgeTokenStatus({ expires_at: future, revoked_at: new Date().toISOString() })).toBe("revoked");
  });
  it("status: expired when expires_at in past", () => {
    expect(bridgeTokenStatus({ expires_at: past, revoked_at: null })).toBe("expired");
  });
  it("status: revoked takes precedence over expired", () => {
    expect(bridgeTokenStatus({ expires_at: past, revoked_at: past })).toBe("revoked");
  });

  it("clampTtlDays clamps below min and above max", () => {
    expect(clampTtlDays(0)).toBe(BRIDGE_TOKEN_MIN_TTL_DAYS);
    expect(clampTtlDays(-5)).toBe(BRIDGE_TOKEN_MIN_TTL_DAYS);
    expect(clampTtlDays(99999)).toBe(BRIDGE_TOKEN_MAX_TTL_DAYS);
  });
  it("clampTtlDays returns default on NaN/Infinity", () => {
    expect(clampTtlDays(NaN)).toBe(BRIDGE_TOKEN_DEFAULT_TTL_DAYS);
    expect(clampTtlDays(Infinity)).toBe(BRIDGE_TOKEN_DEFAULT_TTL_DAYS);
  });
  it("clampTtlDays floors fractional values", () => {
    expect(clampTtlDays(30.9)).toBe(30);
  });

  it("sanitizeTokenName trims, defaults, and caps length", () => {
    expect(sanitizeTokenName("  esp32  ")).toBe("esp32");
    expect(sanitizeTokenName("")).toBe("bridge");
    expect(sanitizeTokenName(null)).toBe("bridge");
    expect(sanitizeTokenName("x".repeat(200)).length).toBe(60);
  });

  it("looksLikeBridgeToken accepts plausible token, rejects others", () => {
    expect(looksLikeBridgeToken("vbt_" + "a".repeat(40))).toBe(true);
    expect(looksLikeBridgeToken("vbt_short")).toBe(false);
    expect(looksLikeBridgeToken("eyJhbGciOi.JWT.example")).toBe(false);
    expect(looksLikeBridgeToken("")).toBe(false);
  });
});
