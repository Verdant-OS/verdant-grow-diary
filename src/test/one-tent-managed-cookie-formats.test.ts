/**
 * Managed-session cookie/session injection — real-world format tolerance.
 *
 * The managed injector (and browser exports) produce cookie shapes the
 * original strict validator rejected wholesale as `invalid_cookies_json`,
 * which is exactly what blocked the Slice 4e authenticated walk:
 *   - Playwright `context.storageState()` session cookies carry `expires: -1`;
 *   - Chrome/DevTools exports use `sameSite: "no_restriction" | "unspecified"`.
 *
 * These are well-defined, legitimate cookie formats. This suite pins that
 * they now normalize (session cookie → expiry dropped; no_restriction → None;
 * unspecified → unset), that both parity implementations agree, and that the
 * genuinely-malformed regressions still fail closed.
 */
import { describe, expect, it } from "vitest";
import {
  parseManagedCookies as parseTs,
  evaluateManagedSession as evalTs,
} from "../../e2e/helpers/lovableManagedSupabaseSession";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JS mirror imported for parity assertions
import {
  parseManagedCookies as parseJs,
  evaluateManagedSession as evalJs,
} from "../../scripts/e2e/one-tent-preflight-core.mjs";
import {
  deriveSupabaseStorageKey,
  validateFullSession,
  extractSessionFromStorageSnapshot,
  buildManagedSessionEnv,
} from "../../scripts/e2e/managed-session-materialize-core.mjs";

// A real Playwright storageState cookie: session cookie => expires -1.
const PLAYWRIGHT_STORAGE_STATE_COOKIE = {
  name: "sb-access",
  value: "abc",
  domain: "knkwiiywfkbqznbxwqfh.supabase.co",
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
};

describe("session cookies (expires <= 0) are accepted, expiry dropped", () => {
  it("Playwright storageState session cookie (expires: -1) normalizes without rejection", () => {
    const raw = JSON.stringify([PLAYWRIGHT_STORAGE_STATE_COOKIE]);
    const r = parseTs({ canonical: raw });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cookies).toHaveLength(1);
    // Session cookie: the expiry field is omitted, not carried through.
    expect(r.cookies[0]).not.toHaveProperty("expires");
    expect(r.cookies[0].name).toBe("sb-access");
    expect(r.cookies[0].domain).toBe("knkwiiywfkbqznbxwqfh.supabase.co");
  });

  it("expires: 0 is also treated as a session cookie", () => {
    const r = parseTs({
      canonical: JSON.stringify([{ name: "a", value: "v", domain: "x.example", expires: 0 }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies[0]).not.toHaveProperty("expires");
  });

  it("a positive finite expires is still carried through verbatim", () => {
    const r = parseTs({
      canonical: JSON.stringify([{ name: "a", value: "v", domain: "x.example", expires: 1800000000 }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies[0].expires).toBe(1800000000);
  });
});

describe("Chrome/DevTools sameSite aliases", () => {
  it("no_restriction maps to None", () => {
    const r = parseTs({
      canonical: JSON.stringify([
        { name: "a", value: "v", domain: "x.example", sameSite: "no_restriction" },
      ]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies[0].sameSite).toBe("None");
  });

  it("unspecified is treated as unset (no sameSite emitted)", () => {
    const r = parseTs({
      canonical: JSON.stringify([
        { name: "a", value: "v", domain: "x.example", sameSite: "unspecified" },
      ]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies[0]).not.toHaveProperty("sameSite");
  });
});

describe("genuinely-malformed cookies still fail closed (no regressions)", () => {
  it("unknown sameSite value still rejects", () => {
    expect(
      parseTs({ canonical: JSON.stringify([{ name: "a", value: "v", domain: "x", sameSite: "sideways" }]) }).ok,
    ).toBe(false);
  });
  it("non-number expires still rejects", () => {
    expect(
      parseTs({ canonical: JSON.stringify([{ name: "a", value: "v", domain: "x", expires: "soon" }]) }).ok,
    ).toBe(false);
  });
  it("non-finite numeric expires (Infinity/NaN) still rejects", () => {
    // JSON has no Infinity literal; simulate via an object the parser sees.
    const r = parseManagedInline([{ name: "a", value: "v", domain: "x", expires: Number.POSITIVE_INFINITY }]);
    expect(r.ok).toBe(false);
  });
  it("cookie without domain or url still rejects", () => {
    expect(
      parseTs({ canonical: JSON.stringify([{ name: "a", value: "v" }]) }).ok,
    ).toBe(false);
  });
});

// Helper: parse a cookie list that may contain non-JSON-serializable values
// (Infinity) by round-tripping through the same code path the env uses.
function parseManagedInline(list: unknown[]) {
  // Infinity JSON-stringifies to null, so build the raw string manually.
  const raw = "[" + list.map((c) => JSON.stringify(c).replace('"expires":null', '"expires":1e999')).join(",") + "]";
  return parseTs({ canonical: raw });
}

describe("TS and JS parity implementations agree on the new formats", () => {
  const CASES = [
    JSON.stringify([PLAYWRIGHT_STORAGE_STATE_COOKIE]),
    JSON.stringify([{ name: "a", value: "v", domain: "x.example", sameSite: "no_restriction" }]),
    JSON.stringify([{ name: "a", value: "v", domain: "x.example", sameSite: "unspecified" }]),
    JSON.stringify([{ name: "a", value: "v", domain: "x.example", expires: 0 }]),
    JSON.stringify([{ name: "a", value: "v", domain: "x", sameSite: "sideways" }]),
  ];
  it.each(CASES)("parseManagedCookies parity for %s", (raw) => {
    expect(JSON.stringify(parseJs({ canonical: raw }))).toBe(
      JSON.stringify(parseTs({ canonical: raw })),
    );
  });

  it("a full ready evaluation with a Playwright cookie yields storage_plus_cookies in both", () => {
    const env = {
      authStatus: "signed_in",
      sessionJson: JSON.stringify({
        access_token: "at",
        refresh_token: "rt",
        expires_at: 1900000000,
        user: { id: "u1", email: "fixture@example.test" },
      }),
      storageKey: "sb-knkwiiywfkbqznbxwqfh-auth-token",
      cookiesJsonCanonical: JSON.stringify([PLAYWRIGHT_STORAGE_STATE_COOKIE]),
      cookiesJson: null,
      supabaseUrl: "https://knkwiiywfkbqznbxwqfh.supabase.co",
      targetProjectRef: "knkwiiywfkbqznbxwqfh",
    };
    const ts = evalTs(env);
    const js = evalJs(env);
    expect(ts.status).toBe("ready");
    expect(js.status).toBe("ready");
    if (ts.status === "ready") expect(ts.restoreStrategy).toBe("storage_plus_cookies");
    expect(JSON.stringify(js)).toBe(JSON.stringify(ts));
  });
});

describe("materialize-core pure helpers", () => {
  it("derives the supabase-js v2 storage key from the URL host", () => {
    expect(
      deriveSupabaseStorageKey({ supabaseUrl: "https://knkwiiywfkbqznbxwqfh.supabase.co" }),
    ).toBe("sb-knkwiiywfkbqznbxwqfh-auth-token");
  });
  it("prefers an explicit project id", () => {
    expect(deriveSupabaseStorageKey({ projectId: "myref" })).toBe("sb-myref-auth-token");
  });
  it("returns null for an unusable URL", () => {
    expect(deriveSupabaseStorageKey({ supabaseUrl: "not a url" })).toBeNull();
    expect(deriveSupabaseStorageKey({})).toBeNull();
  });

  it("validateFullSession requires access+refresh+expires_at+user.id (walk-ready)", () => {
    expect(validateFullSession({ access_token: "a", refresh_token: "r", expires_at: 1, user: { id: "u" } }).ok).toBe(true);
    const partial = validateFullSession({ access_token: "a", user: { id: "u" } });
    expect(partial.ok).toBe(false);
    if (!partial.ok) expect(partial.missing).toEqual(["expires_at", "refresh_token"]);
  });

  it("extracts the verbatim session JSON from an auth snapshot", () => {
    const snap = {
      origin: "https://app.test",
      entries: { "sb-myref-auth-token": '{"access_token":"a"}', other: "x" },
    };
    expect(extractSessionFromStorageSnapshot(snap)).toEqual({
      storageKey: "sb-myref-auth-token",
      sessionJson: '{"access_token":"a"}',
    });
    expect(extractSessionFromStorageSnapshot({ entries: {} })).toBeNull();
  });

  it("builds the managed-session env (session_storage strategy, no cookies)", () => {
    const env = buildManagedSessionEnv({
      sessionJson: '{"access_token":"a"}',
      storageKey: "sb-myref-auth-token",
      projectRef: "myref",
    });
    expect(env.LOVABLE_BROWSER_AUTH_STATUS).toBe("signed_in");
    expect(env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY).toBe("sb-myref-auth-token");
    expect(env.LOVABLE_E2E_TARGET_PROJECT_REF).toBe("myref");
    expect(env).not.toHaveProperty("LOVABLE_BROWSER_COOKIES_JSON");
  });
});
