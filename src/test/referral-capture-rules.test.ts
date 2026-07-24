/**
 * Referral capture — signup metadata ride-along + OAuth sessionStorage bridge.
 */
import { describe, expect, it } from "vitest";
import {
  buildSignupReferralMetadata,
  resolveReferralCode,
  sanitizeReferralCode,
} from "@/lib/referralCaptureRules";
import {
  OAUTH_REFERRAL_STORAGE_KEY,
  OAUTH_REFERRAL_TTL_MS,
  readPendingOAuthReferral,
  savePendingOAuthReferral,
} from "@/lib/oauthReferralCaptureRules";

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

describe("sanitizeReferralCode", () => {
  it("lowercases, trims, and accepts 6-16 char alphanumerics", () => {
    expect(sanitizeReferralCode("  AbC234kmn  ")).toBe("abc234kmn");
    expect(sanitizeReferralCode("abcdef")).toBe("abcdef");
  });

  it.each(["", "abc", "a".repeat(17), "has space", "code!", "с0dechars", 42, null, undefined, {}])(
    "rejects %p",
    (v) => expect(sanitizeReferralCode(v)).toBeNull(),
  );
});

describe("buildSignupReferralMetadata", () => {
  it("builds the frozen verdant_ref_code fragment from ?ref=", () => {
    const meta = buildSignupReferralMetadata("?mode=signup&ref=AbC234kmn");
    expect(meta).toEqual({ verdant_ref_code: "abc234kmn" });
    expect(Object.isFrozen(meta)).toBe(true);
  });

  it("returns undefined (not an empty object) when absent or malformed", () => {
    expect(buildSignupReferralMetadata("?mode=signup")).toBeUndefined();
    expect(buildSignupReferralMetadata("?ref=bad code!")).toBeUndefined();
    expect(buildSignupReferralMetadata(null)).toBeUndefined();
  });

  it("accepts URLSearchParams input", () => {
    expect(resolveReferralCode(new URLSearchParams("ref=xyz23456"))).toBe("xyz23456");
  });
});

describe("OAuth referral bridge", () => {
  it("round-trips a sanitized code within the TTL", () => {
    const storage = fakeStorage();
    expect(savePendingOAuthReferral("AbC234kmn", storage, 1_000)).toBe(true);
    expect(readPendingOAuthReferral(storage, 2_000)).toBe("abc234kmn");
  });

  it("rejects malformed codes at save time", () => {
    const storage = fakeStorage();
    expect(savePendingOAuthReferral("bad code!", storage, 1_000)).toBe(false);
    expect(storage.getItem(OAUTH_REFERRAL_STORAGE_KEY)).toBeNull();
  });

  it("expires after the TTL and clears the stale entry", () => {
    const storage = fakeStorage();
    savePendingOAuthReferral("abc234kmn", storage, 0);
    expect(readPendingOAuthReferral(storage, OAUTH_REFERRAL_TTL_MS + 1)).toBeNull();
    expect(storage.getItem(OAUTH_REFERRAL_STORAGE_KEY)).toBeNull();
  });

  it("clears corrupt or tampered entries instead of throwing", () => {
    const storage = fakeStorage({ [OAUTH_REFERRAL_STORAGE_KEY]: "not-json" });
    expect(readPendingOAuthReferral(storage, 1_000)).toBeNull();
    const tampered = fakeStorage({
      [OAUTH_REFERRAL_STORAGE_KEY]: JSON.stringify({ code: "in valid!", startedAt: 0 }),
    });
    expect(readPendingOAuthReferral(tampered, 1)).toBeNull();
  });

  it("no-ops safely when storage is unavailable", () => {
    expect(savePendingOAuthReferral("abc234kmn", null, 1)).toBe(false);
    expect(readPendingOAuthReferral(null, 1)).toBeNull();
  });
});
