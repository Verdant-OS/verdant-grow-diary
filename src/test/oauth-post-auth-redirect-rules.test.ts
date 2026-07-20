import { describe, expect, it } from "vitest";
import {
  clearPendingOAuthPostAuthRedirect,
  consumePendingOAuthPostAuthRedirect,
  OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY,
  OAUTH_POST_AUTH_REDIRECT_TTL_MS,
  savePendingOAuthPostAuthRedirect,
} from "@/lib/oauthPostAuthRedirectRules";

const NOW = 1_700_000_000_000;
const TARGET = "/onboarding?intent=csv_history";

function storage(): Storage {
  return window.sessionStorage;
}

describe("oauthPostAuthRedirectRules", () => {
  it("stores and consumes one manifest-validated same-origin target", () => {
    const s = storage();
    s.clear();
    expect(savePendingOAuthPostAuthRedirect(TARGET, s, NOW)).toBe(true);
    expect(consumePendingOAuthPostAuthRedirect(s, NOW + 1)).toBe(TARGET);
    expect(s.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
    expect(consumePendingOAuthPostAuthRedirect(s, NOW + 2)).toBeNull();
  });

  it("fails closed for off-origin, arbitrary known-route, and stale requests", () => {
    const s = storage();
    s.clear();
    expect(savePendingOAuthPostAuthRedirect("https://evil.example/onboarding", s, NOW)).toBe(false);
    expect(savePendingOAuthPostAuthRedirect("/not-a-verdant-route", s, NOW)).toBe(false);
    expect(savePendingOAuthPostAuthRedirect("/pricing?plan=pro_annual", s, NOW)).toBe(false);
    expect(
      savePendingOAuthPostAuthRedirect(
        "/onboarding?intent=csv_history&utm_source=external",
        s,
        NOW,
      ),
    ).toBe(false);

    expect(savePendingOAuthPostAuthRedirect(TARGET, s, NOW)).toBe(true);
    expect(consumePendingOAuthPostAuthRedirect(s, NOW + OAUTH_POST_AUTH_REDIRECT_TTL_MS + 1)).toBe(
      null,
    );
    expect(s.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
  });

  it("clears a pending target without navigating", () => {
    const s = storage();
    s.clear();
    savePendingOAuthPostAuthRedirect(TARGET, s, NOW);
    clearPendingOAuthPostAuthRedirect(s);
    expect(s.getItem(OAUTH_POST_AUTH_REDIRECT_STORAGE_KEY)).toBeNull();
  });
});
