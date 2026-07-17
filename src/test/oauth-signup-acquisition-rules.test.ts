import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY,
  OAUTH_SIGNUP_ACQUISITION_TTL_MS,
  flushPendingOAuthSignupAcquisition,
  readPendingOAuthSignupAcquisition,
  savePendingOAuthSignupAcquisition,
} from "@/lib/oauthSignupAcquisitionRules";

const NOW = Date.parse("2026-07-16T22:00:00.000Z");

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("OAuth signup acquisition rules", () => {
  it("stores only a fixed source and timestamp in session storage", () => {
    expect(savePendingOAuthSignupAcquisition("csv_history", window.sessionStorage, NOW)).toBe(true);
    expect(readPendingOAuthSignupAcquisition(window.sessionStorage, NOW)).toEqual({
      source: "csv_history",
      startedAt: NOW,
    });
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBe(
      JSON.stringify({ source: "csv_history", startedAt: NOW }),
    );
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).not.toMatch(
      /email|token|user_?id/i,
    );
  });

  it("fails closed and removes forged, malformed, future, and expired values", () => {
    for (const value of [
      "not-json",
      JSON.stringify({ source: "attacker", startedAt: NOW }),
      JSON.stringify({ source: "csv_history", startedAt: NOW + 1 }),
      JSON.stringify({
        source: "csv_history",
        startedAt: NOW - OAUTH_SIGNUP_ACQUISITION_TTL_MS - 1,
      }),
    ]) {
      window.sessionStorage.setItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY, value);
      expect(readPendingOAuthSignupAcquisition(window.sessionStorage, NOW)).toBeNull();
      expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull();
    }
  });

  it("flushes through the fixed auth.uid-scoped RPC and clears on a terminal result", async () => {
    savePendingOAuthSignupAcquisition("csv_history", window.sessionStorage, NOW);
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

    await expect(
      flushPendingOAuthSignupAcquisition({ rpc }, window.sessionStorage, NOW),
    ).resolves.toBe("recorded");
    expect(rpc).toHaveBeenCalledWith("record_signup_acquisition_first_touch", {
      p_source: "csv_history",
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(/user_?id|email|token/i);
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull();
  });

  it("retains a bounded value for transient retry and clears a server rejection", async () => {
    savePendingOAuthSignupAcquisition("landing_page", window.sessionStorage, NOW);
    const retryRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(
      flushPendingOAuthSignupAcquisition({ rpc: retryRpc }, window.sessionStorage, NOW),
    ).resolves.toBe("retry");
    expect(readPendingOAuthSignupAcquisition(window.sessionStorage, NOW)?.source).toBe(
      "landing_page",
    );

    const rejectRpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(
      flushPendingOAuthSignupAcquisition({ rpc: rejectRpc }, window.sessionStorage, NOW),
    ).resolves.toBe("rejected");
    expect(window.sessionStorage.getItem(OAUTH_SIGNUP_ACQUISITION_STORAGE_KEY)).toBeNull();
  });
});
