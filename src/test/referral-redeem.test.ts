/**
 * flushPendingReferralRedeem — session-gated verified-conversion flush.
 * The client only hands a code claim to the edge fn; identity, confirmation,
 * environment, and every grant guard stay server-side.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingReferralRedeem,
  REFERRAL_REDEEMED_MARKER_PREFIX,
  type ReferralRedeemClient,
} from "@/lib/referralRedeem";
import { OAUTH_REFERRAL_STORAGE_KEY } from "@/lib/oauthReferralCaptureRules";

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: () => null,
    clear: () => map.clear(),
    get length() {
      return map.size;
    },
  } as Storage;
}

function clientReturning(result: { data: unknown; error: unknown }) {
  const invoke = vi.fn(async () => result);
  return { client: { functions: { invoke } } as unknown as ReferralRedeemClient, invoke };
}

const CONFIRMED_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email_confirmed_at: "2026-07-21T00:00:00Z",
  user_metadata: { verdant_ref_code: "abc234kmn" },
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("flushPendingReferralRedeem", () => {
  it("returns none without a user, without confirmation, or without any code", async () => {
    const { client, invoke } = clientReturning({
      data: { ok: true, status: "converted" },
      error: null,
    });
    expect(await flushPendingReferralRedeem(client, null, fakeStorage())).toBe("none");
    expect(
      await flushPendingReferralRedeem(
        client,
        { ...CONFIRMED_USER, email_confirmed_at: null },
        fakeStorage(),
      ),
    ).toBe("none");
    expect(
      await flushPendingReferralRedeem(
        client,
        { ...CONFIRMED_USER, user_metadata: {} },
        fakeStorage(),
      ),
    ).toBe("none");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes the edge fn with the metadata code and marks done on conversion", async () => {
    const { client, invoke } = clientReturning({
      data: { ok: true, status: "converted" },
      error: null,
    });
    const status = await flushPendingReferralRedeem(client, CONFIRMED_USER, fakeStorage());
    expect(status).toBe("converted");
    expect(invoke).toHaveBeenCalledWith("redeem-referral", { body: { code: "abc234kmn" } });
    expect(window.localStorage.getItem(REFERRAL_REDEEMED_MARKER_PREFIX + CONFIRMED_USER.id)).toBe(
      "1",
    );
  });

  it("falls back to the OAuth bridge code and clears it on success", async () => {
    const storage = fakeStorage({
      [OAUTH_REFERRAL_STORAGE_KEY]: JSON.stringify({ code: "xyz234567", startedAt: Date.now() }),
    });
    const { client, invoke } = clientReturning({
      data: { ok: true, status: "converted" },
      error: null,
    });
    const status = await flushPendingReferralRedeem(
      client,
      { ...CONFIRMED_USER, user_metadata: {} },
      storage,
    );
    expect(status).toBe("converted");
    expect(invoke).toHaveBeenCalledWith("redeem-referral", { body: { code: "xyz234567" } });
    expect(storage.getItem(OAUTH_REFERRAL_STORAGE_KEY)).toBeNull();
  });

  it("treats terminal refusals as final (clears state, marks done)", async () => {
    const storage = fakeStorage({
      [OAUTH_REFERRAL_STORAGE_KEY]: JSON.stringify({ code: "xyz234567", startedAt: Date.now() }),
    });
    const { client } = clientReturning({
      data: { ok: false, status: "referee_already_referred", terminal: true },
      error: null,
    });
    const status = await flushPendingReferralRedeem(
      client,
      { ...CONFIRMED_USER, user_metadata: {} },
      storage,
    );
    expect(status).toBe("terminal");
    expect(storage.getItem(OAUTH_REFERRAL_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFERRAL_REDEEMED_MARKER_PREFIX + CONFIRMED_USER.id)).toBe(
      "1",
    );
  });

  it("retains state and reports retry on transient failure", async () => {
    const { client } = clientReturning({ data: null, error: new Error("boom") });
    const status = await flushPendingReferralRedeem(client, CONFIRMED_USER, fakeStorage());
    expect(status).toBe("retry");
    expect(
      window.localStorage.getItem(REFERRAL_REDEEMED_MARKER_PREFIX + CONFIRMED_USER.id),
    ).toBeNull();
  });

  it("never invokes twice for the same user on the same device (done marker)", async () => {
    const { client, invoke } = clientReturning({
      data: { ok: true, status: "converted" },
      error: null,
    });
    await flushPendingReferralRedeem(client, CONFIRMED_USER, fakeStorage());
    await flushPendingReferralRedeem(client, CONFIRMED_USER, fakeStorage());
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
