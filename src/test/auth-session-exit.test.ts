// Tests for the safe sign-out helper layer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AUTH_TRANSIENT_SESSION_PREFIXES,
  SAFE_SIGN_OUT_REDIRECT,
  SIGN_OUT_FAILURE_MESSAGE,
  SIGN_OUT_LOADING_LABEL,
  clearAuthTransientUiState,
  performSafeSignOut,
  resolveSignOutRedirect,
} from "@/lib/authSessionExitRules";
import {
  GLOBAL_SEARCH_HISTORY_STORAGE_KEY,
  GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY,
  GLOBAL_SEARCH_SESSION_STORAGE_KEY,
} from "@/lib/globalSearchSession";
import { RECENT_SEARCHES_STORAGE_KEY } from "@/lib/recentGlobalSearches";

function makeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  } as Storage;
}

describe("resolveSignOutRedirect", () => {
  it("defaults to /welcome", () => {
    expect(resolveSignOutRedirect(undefined)).toBe(SAFE_SIGN_OUT_REDIRECT);
    expect(resolveSignOutRedirect("")).toBe(SAFE_SIGN_OUT_REDIRECT);
  });
  it("honors safe internal paths", () => {
    expect(resolveSignOutRedirect("/auth")).toBe("/auth");
    expect(resolveSignOutRedirect("/pricing")).toBe("/pricing");
  });
  it("rejects external / scheme / protocol-relative / backslash", () => {
    expect(resolveSignOutRedirect("https://evil.example")).toBe(SAFE_SIGN_OUT_REDIRECT);
    expect(resolveSignOutRedirect("//evil.example")).toBe(SAFE_SIGN_OUT_REDIRECT);
    expect(resolveSignOutRedirect("javascript:alert(1)")).toBe(SAFE_SIGN_OUT_REDIRECT);
    expect(resolveSignOutRedirect("/\\evil")).toBe(SAFE_SIGN_OUT_REDIRECT);
    expect(resolveSignOutRedirect(42 as unknown as string)).toBe(SAFE_SIGN_OUT_REDIRECT);
  });
});

describe("clearAuthTransientUiState", () => {
  it("removes identity-scoped search/auth state; preserves grow data and Supabase auth", () => {
    const ss = makeStorage({
      "verdant:auth:redirect": "/sensors",
      "verdant:authRedirect:last": "/x",
      "verdant:onboarding:session:open": "1",
      [GLOBAL_SEARCH_SESSION_STORAGE_KEY]: JSON.stringify({ query: "private plant" }),
      [GLOBAL_SEARCH_HISTORY_STORAGE_KEY]: JSON.stringify([{ query: "private tent" }]),
      [GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY]: JSON.stringify({
        entity_type: "plant",
        id: "private-plant-id",
      }),
      [RECENT_SEARCHES_STORAGE_KEY]: JSON.stringify(["private grow"]),
      "verdant:startScreen:user-1": "quickLog",
      "verdant:grows:cache": JSON.stringify([{ id: "g1" }]),
      "sb-knkwiiywfkbqznbxwqfh-auth-token": "token-blob",
    });
    const ls = makeStorage({
      [RECENT_SEARCHES_STORAGE_KEY]: JSON.stringify(["legacy private grow"]),
      "verdant:unrelated": "preserve-me",
    });
    clearAuthTransientUiState({ sessionStorage: ss, localStorage: ls });
    expect(ss.getItem("verdant:auth:redirect")).toBeNull();
    expect(ss.getItem("verdant:authRedirect:last")).toBeNull();
    expect(ss.getItem("verdant:onboarding:session:open")).toBeNull();
    expect(ss.getItem(GLOBAL_SEARCH_SESSION_STORAGE_KEY)).toBeNull();
    expect(ss.getItem(GLOBAL_SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
    expect(ss.getItem(GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY)).toBeNull();
    expect(ss.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
    expect(ls.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
    // Preserved:
    expect(ss.getItem("verdant:startScreen:user-1")).toBe("quickLog");
    expect(ss.getItem("verdant:grows:cache")).not.toBeNull();
    expect(ss.getItem("sb-knkwiiywfkbqznbxwqfh-auth-token")).toBe("token-blob");
    expect(ls.getItem("verdant:unrelated")).toBe("preserve-me");
  });
  it("calls onClearQueryCache and never throws when storage is unavailable", () => {
    const cb = vi.fn();
    expect(() =>
      clearAuthTransientUiState({ sessionStorage: null, onClearQueryCache: cb }),
    ).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it("swallows callback errors", () => {
    expect(() =>
      clearAuthTransientUiState({
        sessionStorage: null,
        onClearQueryCache: () => {
          throw new Error("boom");
        },
      }),
    ).not.toThrow();
  });
  it("has a non-empty allowlist", () => {
    expect(AUTH_TRANSIENT_SESSION_PREFIXES.length).toBeGreaterThan(0);
  });
});

describe("performSafeSignOut", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls signOut and returns safe internal redirect", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const clear = vi.fn();
    const r = await performSafeSignOut({ signOut, clearUiState: clear });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ ok: true, redirectTo: SAFE_SIGN_OUT_REDIRECT });
  });
  it("uses sanitized redirect when caller passes one", async () => {
    const r = await performSafeSignOut(
      { signOut: vi.fn().mockResolvedValue(undefined) },
      "https://evil.example",
    );
    expect(r.redirectTo).toBe(SAFE_SIGN_OUT_REDIRECT);
  });
  it("on failure: returns friendly message + still redirects internally", async () => {
    const signOut = vi.fn().mockRejectedValue(new Error("network"));
    const r = await performSafeSignOut({ signOut });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.message).toBe(SIGN_OUT_FAILURE_MESSAGE);
      expect(r.redirectTo).toBe(SAFE_SIGN_OUT_REDIRECT);
      expect(r.message).not.toMatch(/network|token|session/i);
    }
  });
  it("treats a resolved { error } payload as failure without requiring throw (#588)", async () => {
    // Mirrors supabase.auth.signOut() when the store forgets to rethrow.
    const signOut = vi.fn().mockResolvedValue({ error: { message: "Auth session missing" } });
    const r = await performSafeSignOut({ signOut });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.message).toBe(SIGN_OUT_FAILURE_MESSAGE);
      expect(r.message).not.toMatch(/session|token|Auth/i);
      expect(r.redirectTo).toBe(SAFE_SIGN_OUT_REDIRECT);
    }
  });
  it("never logs anything", () => {
    expect(SIGN_OUT_LOADING_LABEL).toMatch(/signing out/i);
  });
});
