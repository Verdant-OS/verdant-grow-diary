/**
 * Regression coverage for #2106 / #2135: `type=magiclink` must not stay on the
 * preserve list. Central rules tests predate the fix; this file pins the
 * production failure mode without re-editing locked harness files.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_CALLBACK_HASH_PRESERVE_TYPES,
  clearOAuthHashFromAddressBar,
  consumeOAuthHashSessionIfPresent,
  OAUTH_HASH_EARLY_WIPE_SCRIPT,
  OAUTH_RETURN_HASH_STASH_KEY,
  shouldPreserveAuthCallbackHash,
} from "@/lib/oauthHashSessionConsumeRules";

const ACCESS = "fixture-access-token-0123456789";
const REFRESH = "fixture-refresh-0123";

function hashWith(params: Record<string, string>): string {
  return `#${new URLSearchParams(params).toString()}`;
}

describe("magic-link preserve-list regression (#2106)", () => {
  beforeEach(() => {
    const href = window.location.href.split("#")[0] ?? window.location.href;
    window.history.replaceState(window.history.state, "", href);
    delete (window as unknown as Record<string, unknown>)[OAUTH_RETURN_HASH_STASH_KEY];
  });

  it("keeps magiclink off AUTH_CALLBACK_HASH_PRESERVE_TYPES", () => {
    expect(AUTH_CALLBACK_HASH_PRESERVE_TYPES).toEqual([
      "recovery",
      "signup",
      "invite",
      "email_change",
    ]);
    expect(
      shouldPreserveAuthCallbackHash(
        hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "magiclink" }),
      ),
    ).toBe(false);
  });

  it("early wipe stashes magiclink but not recovery", () => {
    const href = window.location.href.split("#")[0] ?? window.location.href;
    const holder = window as unknown as Record<string, unknown>;

    window.history.replaceState(
      window.history.state,
      "",
      `${href}${hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "magiclink" })}`,
    );
    Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();
    expect(window.location.hash).toBe("");
    expect(String(holder[OAUTH_RETURN_HASH_STASH_KEY])).toContain("type=magiclink");
    delete holder[OAUTH_RETURN_HASH_STASH_KEY];

    const recovery = hashWith({ access_token: ACCESS, refresh_token: REFRESH, type: "recovery" });
    window.history.replaceState(window.history.state, "", `${href}${recovery}`);
    Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();
    expect(window.location.hash).toBe(recovery);
    expect(holder[OAUTH_RETURN_HASH_STASH_KEY]).toBeUndefined();
  });

  it("consumes a stashed magiclink after the address bar is already clean", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const replaceState = vi.fn(() => {
      throw new Error("replaceState blocked");
    });
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: "",
        stashedHash: hashWith({
          access_token: ACCESS,
          refresh_token: REFRESH,
          type: "magiclink",
        }),
        pathname: "/welcome",
        search: "?ref=email",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("consumed");
    expect(setSession).toHaveBeenCalledWith({ access_token: ACCESS, refresh_token: REFRESH });
  });

  it("clears a magiclink hash without setSession when tokens are malformed", async () => {
    const setSession = vi.fn();
    const replaceState = vi.fn();
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: "short", refresh_token: REFRESH, type: "magiclink" }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(setSession).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith("/");
    expect(
      clearOAuthHashFromAddressBar(
        { pathname: "/", search: "", hash: "#error=access_denied&type=magiclink" },
        replaceState,
      ),
    ).toBe(true);
  });
});
