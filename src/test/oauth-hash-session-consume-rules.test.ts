import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOAuthHashFromAddressBar,
  clearOAuthReturnHashRetention,
  consumeOAuthHashSessionIfPresent,
  hashLooksLikeOAuthReturn,
  OAUTH_HASH_EARLY_WIPE_SCRIPT,
  OAUTH_RETURN_HASH_STASH_KEY,
  parseOAuthHashFragment,
  resolveOAuthHashSource,
  shouldAttemptOAuthHashSessionConsume,
  peekOAuthReturnHashStash,
  takeOAuthReturnHashStash,
  urlWithoutHash,
} from "@/lib/oauthHashSessionConsumeRules";

const ACCESS = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
const REFRESH = "refresh-token-value-01";

function hashWith(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `#${q}`;
}

describe("oauthHashSessionConsumeRules", () => {
  beforeEach(() => {
    clearOAuthReturnHashRetention();
  });

  it("parses access_token + refresh_token from an OAuth return hash", () => {
    const parsed = parseOAuthHashFragment(
      hashWith({
        access_token: ACCESS,
        refresh_token: REFRESH,
        expires_in: "3600",
        token_type: "bearer",
      }),
    );
    expect(parsed).toEqual({
      kind: "session",
      tokens: { access_token: ACCESS, refresh_token: REFRESH },
    });
    expect(shouldAttemptOAuthHashSessionConsume(parsed)).toBe(true);
  });

  it("accepts a hash without a leading #", () => {
    const parsed = parseOAuthHashFragment(`access_token=${ACCESS}&refresh_token=${REFRESH}`);
    expect(parsed.kind).toBe("session");
  });

  it("returns none for unrelated hashes and empty input", () => {
    expect(parseOAuthHashFragment("")).toEqual({ kind: "none" });
    expect(parseOAuthHashFragment("#")).toEqual({ kind: "none" });
    expect(parseOAuthHashFragment("#plant-ai-doctor-review")).toEqual({ kind: "none" });
    expect(parseOAuthHashFragment("#foo=bar&baz=1")).toEqual({ kind: "none" });
    expect(parseOAuthHashFragment(null)).toEqual({ kind: "none" });
    expect(parseOAuthHashFragment(undefined)).toEqual({ kind: "none" });
  });

  it("fails closed on missing, empty, short, or overlong tokens", () => {
    expect(parseOAuthHashFragment(hashWith({ access_token: ACCESS }))).toEqual({
      kind: "malformed",
    });
    expect(parseOAuthHashFragment(hashWith({ refresh_token: REFRESH }))).toEqual({
      kind: "malformed",
    });
    expect(parseOAuthHashFragment(hashWith({ access_token: "", refresh_token: REFRESH }))).toEqual({
      kind: "malformed",
    });
    expect(
      parseOAuthHashFragment(hashWith({ access_token: "short", refresh_token: REFRESH })),
    ).toEqual({ kind: "malformed" });
    expect(
      parseOAuthHashFragment(
        hashWith({
          access_token: "a".repeat(9_000),
          refresh_token: REFRESH,
        }),
      ),
    ).toEqual({ kind: "malformed" });
    expect(shouldAttemptOAuthHashSessionConsume({ kind: "malformed" })).toBe(false);
  });

  it("parses provider error hashes without inventing a session", () => {
    const parsed = parseOAuthHashFragment(
      hashWith({
        error: "access_denied",
        error_description: "The+user+denied+access",
      }),
    );
    expect(parsed).toEqual({
      kind: "provider_error",
      error: "access_denied",
      errorDescription: "The+user+denied+access",
    });
    expect(shouldAttemptOAuthHashSessionConsume(parsed)).toBe(false);
  });

  it("builds a hash-free URL from path + search only", () => {
    expect(urlWithoutHash("/", "")).toBe("/");
    expect(urlWithoutHash("/", "?ref=abc")).toBe("/?ref=abc");
    expect(urlWithoutHash("/plants/p1", "?tentId=t1")).toBe("/plants/p1?tentId=t1");
    expect(urlWithoutHash("", "")).toBe("/");
    expect(urlWithoutHash(null, null)).toBe("/");
  });

  it("clears an OAuth hash via replaceState and leaves unrelated hashes alone", () => {
    const replaceState = vi.fn();
    expect(
      clearOAuthHashFromAddressBar(
        {
          pathname: "/",
          search: "",
          hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
        },
        replaceState,
      ),
    ).toBe(true);
    expect(replaceState).toHaveBeenCalledWith("/");

    replaceState.mockClear();
    expect(
      clearOAuthHashFromAddressBar(
        { pathname: "/", search: "?x=1", hash: "#section" },
        replaceState,
      ),
    ).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("consumes valid tokens, clears hash, and does not invent sessions on failure", async () => {
    const replaceState = vi.fn();
    const setSession = vi.fn().mockResolvedValue({ error: null });

    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("consumed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: ACCESS,
      refresh_token: REFRESH,
    });
    expect(replaceState).toHaveBeenCalledWith("/");

    setSession.mockClear();
    replaceState.mockClear();
    setSession.mockResolvedValue({ error: new Error("reject") });
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
        pathname: "/",
        search: "?ref=keep",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(replaceState).toHaveBeenCalledWith("/?ref=keep");

    setSession.mockClear();
    replaceState.mockClear();
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: "short", refresh_token: REFRESH }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(setSession).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith("/");

    setSession.mockClear();
    replaceState.mockClear();
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: "#plant-ai-doctor-review",
        pathname: "/plants/p1",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("noop");
    expect(setSession).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("wipes the hash synchronously before setSession is invoked", async () => {
    const order: string[] = [];
    let release: ((value: { error: null }) => void) | undefined;
    const setSession = vi.fn(
      () =>
        new Promise<{ error: null }>((resolve) => {
          order.push("setSession-started");
          release = resolve;
        }),
    );
    const replaceState = vi.fn(() => {
      order.push("wipe");
    });

    const pending = consumeOAuthHashSessionIfPresent({
      hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
      pathname: "/",
      search: "",
      setSession,
      replaceState,
    });

    expect(order).toEqual(["wipe", "setSession-started"]);
    expect(replaceState).toHaveBeenCalledWith("/");
    expect(setSession).toHaveBeenCalledTimes(1);
    expect(typeof release).toBe("function");
    release!({ error: null });
    await expect(pending).resolves.toBe("consumed");
  });

  it("consumes a before-paint stash when location.hash is already empty", async () => {
    const replaceState = vi.fn();
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const stashed = hashWith({ access_token: ACCESS, refresh_token: REFRESH });

    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: "",
        stashedHash: stashed,
        pathname: "/",
        search: "?keep=1",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("consumed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: ACCESS,
      refresh_token: REFRESH,
    });
    expect(replaceState).toHaveBeenCalledWith("/?keep=1");
  });

  it("clears provider_error and malformed hashes without calling setSession", async () => {
    const replaceState = vi.fn();
    const setSession = vi.fn();

    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ error: "access_denied" }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(setSession).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith("/");

    replaceState.mockClear();
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: ACCESS }),
        pathname: "/auth",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(setSession).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith("/auth");
  });

  it("takes the OAuth stash once and prefers it over an empty location hash", () => {
    const holder: Record<string, unknown> = {
      [OAUTH_RETURN_HASH_STASH_KEY]: hashWith({
        access_token: ACCESS,
        refresh_token: REFRESH,
      }),
    };
    expect(peekOAuthReturnHashStash(holder)).toBe(
      hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
    );
    expect(takeOAuthReturnHashStash(holder)).toBe(
      hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
    );
    expect(holder[OAUTH_RETURN_HASH_STASH_KEY]).toBeUndefined();
    expect(takeOAuthReturnHashStash(holder)).toBeNull();
    expect(peekOAuthReturnHashStash(holder)).toBe(
      hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
    );
    clearOAuthReturnHashRetention();
    expect(peekOAuthReturnHashStash(holder)).toBeNull();
    expect(
      resolveOAuthHashSource("", hashWith({ access_token: ACCESS, refresh_token: REFRESH })),
    ).toBe(hashWith({ access_token: ACCESS, refresh_token: REFRESH }));
    expect(resolveOAuthHashSource("#plant-ai-doctor-review", null)).toBe("#plant-ai-doctor-review");
    expect(
      hashLooksLikeOAuthReturn(hashWith({ access_token: ACCESS, refresh_token: REFRESH })),
    ).toBe(true);
    expect(hashLooksLikeOAuthReturn("#section")).toBe(false);
    expect(hashLooksLikeOAuthReturn("#section?next=error=value")).toBe(false);
  });

  it("early wipe script stashes then strips an OAuth hash without logging", () => {
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain(OAUTH_RETURN_HASH_STASH_KEY);
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain("URLSearchParams");
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain('p.has("access_token")');
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain('p.has("refresh_token")');
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain('p.has("error")');
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).not.toContain('indexOf("error=")');
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).toContain("history.replaceState");
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).not.toMatch(/console\./);
    expect(OAUTH_HASH_EARLY_WIPE_SCRIPT).not.toMatch(/fetch\(/);

    const href = window.location.href.split("#")[0] ?? window.location.href;
    window.history.replaceState(
      window.history.state,
      "",
      `${href}#access_token=${ACCESS}&refresh_token=${REFRESH}`,
    );
    expect(window.location.hash).toContain("access_token=");

    // Script is a complete IIFE; Function() runs it in this window.
    Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();

    expect(window.location.hash).toBe("");
    const stashHolder = window as unknown as Record<string, unknown>;
    expect(stashHolder[OAUTH_RETURN_HASH_STASH_KEY]).toContain("access_token=");
    expect(stashHolder[OAUTH_RETURN_HASH_STASH_KEY]).toContain("refresh_token=");
    delete stashHolder[OAUTH_RETURN_HASH_STASH_KEY];
  });

  it("early wipe script leaves non-OAuth anchors that merely contain error=", () => {
    const href = window.location.href.split("#")[0] ?? window.location.href;
    window.history.replaceState(window.history.state, "", `${href}#section?next=error=value`);
    expect(window.location.hash).toContain("error=");
    Function(OAUTH_HASH_EARLY_WIPE_SCRIPT)();
    expect(window.location.hash).toContain("section");
    expect(
      (window as unknown as Record<string, unknown>)[OAUTH_RETURN_HASH_STASH_KEY],
    ).toBeUndefined();
  });

  it("does not call setSession when replaceState cannot wipe a live OAuth hash", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const replaceState = vi.fn(() => {
      throw new Error("replaceState blocked");
    });
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("cleared_without_session");
    expect(setSession).not.toHaveBeenCalled();
  });

  it("still setSessions from stash when the address bar is already clean and replaceState throws", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const replaceState = vi.fn(() => {
      throw new Error("replaceState blocked");
    });
    await expect(
      consumeOAuthHashSessionIfPresent({
        hash: "",
        stashedHash: hashWith({ access_token: ACCESS, refresh_token: REFRESH }),
        pathname: "/",
        search: "",
        setSession,
        replaceState,
      }),
    ).resolves.toBe("consumed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: ACCESS,
      refresh_token: REFRESH,
    });
  });
});
