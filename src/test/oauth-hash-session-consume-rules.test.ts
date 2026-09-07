import { describe, expect, it, vi } from "vitest";
import {
  clearOAuthHashFromAddressBar,
  consumeOAuthHashSessionIfPresent,
  parseOAuthHashFragment,
  shouldAttemptOAuthHashSessionConsume,
  urlWithoutHash,
} from "@/lib/oauthHashSessionConsumeRules";

const ACCESS = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";
const REFRESH = "refresh-token-value-01";

function hashWith(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `#${q}`;
}

describe("oauthHashSessionConsumeRules", () => {
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
    const parsed = parseOAuthHashFragment(
      `access_token=${ACCESS}&refresh_token=${REFRESH}`,
    );
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
    expect(
      parseOAuthHashFragment(hashWith({ access_token: ACCESS })),
    ).toEqual({ kind: "malformed" });
    expect(
      parseOAuthHashFragment(hashWith({ refresh_token: REFRESH })),
    ).toEqual({ kind: "malformed" });
    expect(
      parseOAuthHashFragment(hashWith({ access_token: "", refresh_token: REFRESH })),
    ).toEqual({ kind: "malformed" });
    expect(
      parseOAuthHashFragment(
        hashWith({ access_token: "short", refresh_token: REFRESH }),
      ),
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
});
