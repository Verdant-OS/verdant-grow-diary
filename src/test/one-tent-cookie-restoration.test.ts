/**
 * One-Tent managed cookie parsing + restoration — pure tests.
 *
 * No browser is launched: the restoration helper takes dependency-
 * injected context/page fakes. Covers the full documented cookie
 * policy: canonical/legacy precedence, conflict fail-closed, wrapper
 * shapes, all-or-nothing validation, normalization, cookie-only
 * capability vs full-proof readiness, restoration ordering, and
 * secret hygiene.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateManagedSession,
  parseManagedCookies,
  restoreManagedCookiesBeforeNavigation,
  buildManagedSessionPreflightReceipt,
  renderManagedSessionPreflightReceipt,
  type ManagedSessionEnvSnapshot,
  type NormalizedManagedCookie,
} from "../../e2e/helpers/lovableManagedSupabaseSession";

const VALID_COOKIE = {
  name: "sb-auth",
  value: "SECRET-cookie-value",
  domain: "preview.example",
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "Lax",
};

const SESSION = JSON.stringify({
  access_token: "SECRET-token",
  user: { id: "user-abc" },
});

const READY_ENV: ManagedSessionEnvSnapshot = {
  authStatus: "signed_in",
  sessionJson: SESSION,
  storageKey: "sb-key",
};

describe("parseManagedCookies — sources and precedence", () => {
  it("no cookie variables ⇒ ok with zero cookies", () => {
    const r = parseManagedCookies({});
    expect(r).toEqual({ ok: true, provided: false, cookies: [] });
  });

  it("canonical variable parses", () => {
    const r = parseManagedCookies({ canonical: JSON.stringify([VALID_COOKIE]) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies).toHaveLength(1);
  });

  it("legacy variable parses when canonical is absent", () => {
    const r = parseManagedCookies({ legacy: JSON.stringify([VALID_COOKIE]) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies).toHaveLength(1);
  });

  it("conflicting canonical and legacy values fail closed", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([VALID_COOKIE]),
      legacy: "[]",
    });
    expect(r).toEqual({ ok: false, reason: "conflicting_cookie_sources" });
  });

  it("identical canonical and legacy values are not a conflict", () => {
    const payload = JSON.stringify([VALID_COOKIE]);
    const r = parseManagedCookies({ canonical: payload, legacy: payload });
    expect(r.ok).toBe(true);
  });
});

describe("parseManagedCookies — shapes and validation (all-or-nothing)", () => {
  it("malformed JSON fails closed", () => {
    expect(parseManagedCookies({ canonical: "{nope" })).toEqual({
      ok: false,
      reason: "invalid_cookies_json",
    });
  });

  it("unknown top-level wrapper fails closed", () => {
    expect(parseManagedCookies({ canonical: JSON.stringify({ jar: [] }) })).toEqual({
      ok: false,
      reason: "invalid_cookies_json",
    });
    expect(parseManagedCookies({ canonical: '"a-string"' })).toEqual({
      ok: false,
      reason: "invalid_cookies_json",
    });
  });

  it("documented { cookies: [...] } wrapper is accepted", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify({ cookies: [VALID_COOKIE] }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cookies).toHaveLength(1);
  });

  it("empty array is valid but yields zero cookies", () => {
    const r = parseManagedCookies({ canonical: "[]" });
    expect(r).toEqual({ ok: true, provided: true, cookies: [] });
  });

  it("valid cookie array normalizes safely (path default, sameSite case)", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ name: "a", value: "v", domain: "x.example", sameSite: "lax" }]),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cookies[0].path).toBe("/");
      expect(r.cookies[0].sameSite).toBe("Lax");
    }
  });

  it("missing cookie name fails closed", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ value: "v", domain: "x.example" }]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });

  it("missing cookie value fails closed", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ name: "a", domain: "x.example" }]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });

  it("missing domain AND url fails closed", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ name: "a", value: "v" }]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });

  it("url-only cookie is accepted", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ name: "a", value: "v", url: "https://x.example/" }]),
    });
    expect(r.ok).toBe(true);
  });

  it("invalid sameSite fails closed (documented: unknown values are rejected, not guessed)", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([
        { name: "a", value: "v", domain: "x.example", sameSite: "sideways" },
      ]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });

  it("non-boolean httpOnly/secure fails closed", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([{ name: "a", value: "v", domain: "x.example", httpOnly: "yes" }]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });

  it("non-finite expiration fails closed; valid finite expiration is kept", () => {
    expect(
      parseManagedCookies({
        canonical: JSON.stringify([
          { name: "a", value: "v", domain: "x.example", expires: "soon" },
        ]),
      }).ok,
    ).toBe(false);
    const ok = parseManagedCookies({
      canonical: JSON.stringify([
        { name: "a", value: "v", domain: "x.example", expires: 1800000000 },
      ]),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.cookies[0].expires).toBe(1800000000);
  });

  it("one malformed cookie in a mixed set blocks the WHOLE set (no partial restore)", () => {
    const r = parseManagedCookies({
      canonical: JSON.stringify([VALID_COOKIE, { name: "", value: "v", domain: "x" }]),
    });
    expect(r).toEqual({ ok: false, reason: "invalid_cookies_json" });
  });
});

describe("cookie strategy — session vs cookie-only", () => {
  it("session plus cookies ⇒ storage_plus_cookies", () => {
    const r = evaluateManagedSession({
      ...READY_ENV,
      cookiesJsonCanonical: JSON.stringify([VALID_COOKIE]),
    });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.restoreStrategy).toBe("storage_plus_cookies");
  });

  it("session without cookies ⇒ storage_session", () => {
    const r = evaluateManagedSession(READY_ENV);
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.restoreStrategy).toBe("storage_session");
  });

  it("valid cookie-only input yields browser restoration capability…", () => {
    const r = evaluateManagedSession({
      authStatus: "signed_in",
      cookiesJsonCanonical: JSON.stringify([VALID_COOKIE]),
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") {
      expect(r.restoreStrategy).toBe("cookies_only");
      expect(r.cookies).toHaveLength(1);
    }
  });

  it("…but cookie-only remains BLOCKED for the full seeded proof", () => {
    const env: ManagedSessionEnvSnapshot = {
      authStatus: "signed_in",
      cookiesJsonCanonical: JSON.stringify([VALID_COOKIE]),
    };
    const receipt = buildManagedSessionPreflightReceipt(env, evaluateManagedSession(env));
    expect(receipt.status).toBe("blocked");
    expect(receipt.reason).toBe("cookie_only_seed_unavailable");
    expect(receipt.capabilities.browser_restore).toBe(true);
    expect(receipt.capabilities.authenticated_seed).toBe(false);
    expect(receipt.capabilities.full_browser_proof).toBe(false);
  });

  it("invalid cookies + otherwise valid session ⇒ BLOCKED (documented conservative policy)", () => {
    const r = evaluateManagedSession({ ...READY_ENV, cookiesJson: "{broken" });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.reason).toBe("invalid_cookies_json");
  });
});

describe("restoration helper — ordering and hygiene (DI fakes, no browser)", () => {
  function fakes() {
    const calls: string[] = [];
    const added: Array<Record<string, unknown>> = [];
    const context = {
      addCookies: async (cookies: ReadonlyArray<Record<string, unknown>>) => {
        calls.push("addCookies");
        added.push(...cookies);
      },
    };
    const page = {
      goto: async (_url: string) => {
        calls.push("goto");
      },
    };
    return { calls, added, context, page };
  }

  const NORMALIZED: NormalizedManagedCookie[] = [
    { name: "sb-auth", value: "SECRET-cookie-value", domain: "x.example", path: "/" },
  ];

  it("calls context.addCookies BEFORE page navigation", async () => {
    const { calls, context, page } = fakes();
    await restoreManagedCookiesBeforeNavigation(context, page, NORMALIZED, "/");
    expect(calls).toEqual(["addCookies", "goto"]);
  });

  it("empty cookie set skips addCookies but still navigates", async () => {
    const { calls, context, page } = fakes();
    const diag = await restoreManagedCookiesBeforeNavigation(context, page, [], "/");
    expect(calls).toEqual(["goto"]);
    expect(diag).toEqual({ cookieCount: 0, restorationAttempted: false });
  });

  it("returns safe diagnostics only — counts, never values", async () => {
    const { context, page } = fakes();
    const diag = await restoreManagedCookiesBeforeNavigation(context, page, NORMALIZED, "/");
    expect(diag).toEqual({ cookieCount: 1, restorationAttempted: true });
    expect(JSON.stringify(diag)).not.toContain("SECRET");
  });

  it("no password-login request is produced (helper never touches auth endpoints)", async () => {
    const { calls, context, page } = fakes();
    await restoreManagedCookiesBeforeNavigation(context, page, NORMALIZED, "/");
    // The helper's only side effects are addCookies + goto — nothing else.
    expect(calls).toEqual(["addCookies", "goto"]);
  });
});

describe("secret hygiene — no token or cookie value in any diagnostic surface", () => {
  it("preflight receipts never contain cookie values, even when cookies drive the outcome", () => {
    const cases: ManagedSessionEnvSnapshot[] = [
      { ...READY_ENV, cookiesJsonCanonical: JSON.stringify([VALID_COOKIE]) },
      { authStatus: "signed_in", cookiesJsonCanonical: JSON.stringify([VALID_COOKIE]) },
      { ...READY_ENV, cookiesJson: JSON.stringify([VALID_COOKIE]), cookiesJsonCanonical: "[]" },
    ];
    for (const env of cases) {
      const line = renderManagedSessionPreflightReceipt(
        buildManagedSessionPreflightReceipt(env, evaluateManagedSession(env)),
      );
      expect(line).not.toContain("SECRET-cookie-value");
      expect(line).not.toContain("SECRET-token");
      expect(line).not.toContain("sb-auth");
    }
  });
});
