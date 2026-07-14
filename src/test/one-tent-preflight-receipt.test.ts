/**
 * One-Tent managed-session preflight receipt — contract tests.
 *
 * Covers:
 *  - ONE_TENT_PREFLIGHT_JSON receipt shape for every status/reason path
 *  - determinism (same snapshot ⇒ byte-identical line)
 *  - secret hygiene (no tokens/cookie values/emails in any receipt)
 *  - TS helper ↔ JS CLI-core parity (byte-identical receipts)
 *  - CLI process contract (blocked ⇒ exit 2 + exactly one receipt line)
 *
 * Pure except the final CLI smoke, which spawns the preflight script
 * with a controlled env (no network, no Supabase, no secrets).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  evaluateManagedSession,
  buildManagedSessionPreflightReceipt,
  renderManagedSessionPreflightReceipt,
  ONE_TENT_PREFLIGHT_JSON_PREFIX,
  type ManagedSessionEnvSnapshot,
} from "../../e2e/helpers/lovableManagedSupabaseSession";
import {
  evaluateManagedSession as evaluateJs,
  buildManagedSessionPreflightReceipt as buildReceiptJs,
  renderManagedSessionPreflightReceipt as renderReceiptJs,
} from "../../scripts/e2e/one-tent-preflight-core.mjs";

const ROOT = resolve(__dirname, "../..");

const SESSION = JSON.stringify({
  access_token: "REDACTED-access-token",
  refresh_token: "REDACTED-refresh-token",
  expires_at: 1_800_000_000,
  user: { id: "user-abc", email: "grower@example.test" },
});

const COOKIE = JSON.stringify([
  {
    name: "sb-cookie",
    value: "REDACTED-cookie-value",
    domain: "preview.example",
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  },
]);

const READY_BASE: ManagedSessionEnvSnapshot = {
  authStatus: "signed_in",
  sessionJson: SESSION,
  storageKey: "sb-project-auth-token",
  cookiesJson: null,
  cookiesJsonCanonical: null,
  supabaseUrl: "https://abcdefproject.supabase.co",
  targetProjectRef: "abcdefproject",
};

function receiptFor(env: ManagedSessionEnvSnapshot) {
  return buildManagedSessionPreflightReceipt(env, evaluateManagedSession(env));
}

describe("preflight receipt — status/reason matrix", () => {
  it("storage session only ⇒ ready / storage_session / full capabilities", () => {
    const r = receiptFor(READY_BASE);
    expect(r.status).toBe("ready");
    expect(r.reason).toBeNull();
    expect(r.restore_strategy).toBe("storage_session");
    expect(r.capabilities).toEqual({
      browser_restore: true,
      authenticated_seed: true,
      full_browser_proof: true,
    });
    expect(r.managed_auth_status).toBe("signed_in");
    expect(r.target_project_verified).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("storage session + valid cookies ⇒ storage_plus_cookies", () => {
    const r = receiptFor({ ...READY_BASE, cookiesJsonCanonical: COOKIE });
    expect(r.status).toBe("ready");
    expect(r.restore_strategy).toBe("storage_plus_cookies");
    expect(r.cookies_present).toBe(true);
  });

  it("cookie-only ⇒ blocked cookie_only_seed_unavailable with browser_restore capability", () => {
    const r = receiptFor({
      ...READY_BASE,
      sessionJson: null,
      storageKey: null,
      cookiesJsonCanonical: COOKIE,
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("cookie_only_seed_unavailable");
    expect(r.restore_strategy).toBe("cookies_only");
    expect(r.capabilities).toEqual({
      browser_restore: true,
      authenticated_seed: false,
      full_browser_proof: false,
    });
    // missing[] is lexically sorted
    expect(r.missing).toEqual([...r.missing].sort());
  });

  it("empty cookie array is valid but NOT cookie-auth-capable", () => {
    const r = receiptFor({
      ...READY_BASE,
      sessionJson: null,
      storageKey: null,
      cookiesJsonCanonical: "[]",
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("missing_session_json");
    expect(r.restore_strategy).toBe("none");
    expect(r.cookies_present).toBe(false);
  });

  it("malformed cookies block EVEN WITH a complete valid storage session (documented conservative rule)", () => {
    const r = receiptFor({ ...READY_BASE, cookiesJsonCanonical: "{not json" });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("invalid_cookies_json");
    expect(r.capabilities.full_browser_proof).toBe(false);
  });

  it("conflicting canonical + legacy cookie sources fail closed", () => {
    const r = receiptFor({
      ...READY_BASE,
      cookiesJsonCanonical: COOKIE,
      cookiesJson: "[]",
    });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("conflicting_cookie_sources");
  });

  it("byte-identical canonical + legacy cookie payloads are NOT a conflict", () => {
    const r = receiptFor({
      ...READY_BASE,
      cookiesJsonCanonical: COOKIE,
      cookiesJson: COOKIE,
    });
    expect(r.status).toBe("ready");
    expect(r.restore_strategy).toBe("storage_plus_cookies");
  });

  it("signed_out ⇒ blocked reported_signed_out, managed_auth_status signed_out", () => {
    const r = receiptFor({ ...READY_BASE, authStatus: "signed_out" });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("reported_signed_out");
    expect(r.managed_auth_status).toBe("signed_out");
  });

  it("absent auth status ⇒ managed_auth_status unknown", () => {
    const r = receiptFor({ ...READY_BASE, authStatus: null });
    expect(r.managed_auth_status).toBe("unknown");
  });

  it("missing session ⇒ blocked missing_session_json", () => {
    const r = receiptFor({ ...READY_BASE, sessionJson: null });
    expect(r.reason).toBe("missing_session_json");
    expect(r.session_present).toBe(false);
  });

  it("malformed session JSON ⇒ blocked invalid_session_json, token/user flags false", () => {
    const r = receiptFor({ ...READY_BASE, sessionJson: "{oops" });
    expect(r.reason).toBe("invalid_session_json");
    expect(r.access_token_present).toBe(false);
    expect(r.user_id_present).toBe(false);
  });

  it("missing access token ⇒ blocked missing_access_token", () => {
    const r = receiptFor({
      ...READY_BASE,
      sessionJson: JSON.stringify({ user: { id: "u" } }),
    });
    expect(r.reason).toBe("missing_access_token");
    expect(r.access_token_present).toBe(false);
    expect(r.user_id_present).toBe(true);
  });

  it("missing user id ⇒ blocked missing_user_id", () => {
    const r = receiptFor({
      ...READY_BASE,
      sessionJson: JSON.stringify({ access_token: "t", user: {} }),
    });
    expect(r.reason).toBe("missing_user_id");
  });

  it("declared target project mismatch ⇒ blocked target_project_mismatch", () => {
    const r = receiptFor({ ...READY_BASE, targetProjectRef: "someotherref" });
    expect(r.status).toBe("blocked");
    expect(r.reason).toBe("target_project_mismatch");
    expect(r.target_project_verified).toBe(false);
  });

  it("undeclared target project ref does not block but is not verified", () => {
    const r = receiptFor({ ...READY_BASE, targetProjectRef: null });
    expect(r.status).toBe("ready");
    expect(r.target_project_verified).toBe(false);
  });
});

describe("preflight receipt — determinism + hygiene", () => {
  const SNAPSHOTS: Array<[string, ManagedSessionEnvSnapshot]> = [
    ["ready", READY_BASE],
    ["ready+cookies", { ...READY_BASE, cookiesJsonCanonical: COOKIE }],
    [
      "cookie-only",
      { ...READY_BASE, sessionJson: null, storageKey: null, cookiesJsonCanonical: COOKIE },
    ],
    ["invalid-cookies", { ...READY_BASE, cookiesJson: "][" }],
    ["conflict", { ...READY_BASE, cookiesJson: "[]", cookiesJsonCanonical: COOKIE }],
    ["signed-out", { ...READY_BASE, authStatus: "signed_out" }],
    ["no-session", { ...READY_BASE, sessionJson: null }],
    ["bad-session", { ...READY_BASE, sessionJson: "{" }],
    ["no-token", { ...READY_BASE, sessionJson: JSON.stringify({ user: { id: "u" } }) }],
    ["no-user", { ...READY_BASE, sessionJson: JSON.stringify({ access_token: "t" }) }],
    ["mismatch", { ...READY_BASE, targetProjectRef: "nope" }],
  ];

  it.each(SNAPSHOTS)("%s: same snapshot renders byte-identical receipts", (_label, env) => {
    const a = renderManagedSessionPreflightReceipt(receiptFor(env));
    const b = renderManagedSessionPreflightReceipt(receiptFor(env));
    expect(a).toBe(b);
    expect(a.startsWith(ONE_TENT_PREFLIGHT_JSON_PREFIX)).toBe(true);
    // Exactly one line, compact JSON.
    expect(a).not.toContain("\n");
    const parsed = JSON.parse(a.slice(ONE_TENT_PREFLIGHT_JSON_PREFIX.length));
    expect(parsed.schema_version).toBe("1");
    expect(parsed.proof).toBe("one-tent-loop-authenticated-ui");
  });

  it.each(SNAPSHOTS)("%s: receipt never leaks tokens, cookie values, or emails", (_label, env) => {
    const line = renderManagedSessionPreflightReceipt(receiptFor(env));
    expect(line).not.toContain("REDACTED-access-token");
    expect(line).not.toContain("REDACTED-refresh-token");
    expect(line).not.toContain("REDACTED-cookie-value");
    expect(line).not.toContain("grower@example.test");
    expect(line).not.toMatch(/Bearer\s/);
  });

  it.each(SNAPSHOTS)(
    "%s: TS helper and JS CLI core produce byte-identical receipts (parity lock)",
    (_label, env) => {
      const ts = renderManagedSessionPreflightReceipt(receiptFor(env));
      const js = renderReceiptJs(buildReceiptJs(env, evaluateJs(env)));
      expect(js).toBe(ts);
    },
  );

  it("receipt key order is stable and matches the documented contract", () => {
    const keys = Object.keys(receiptFor(READY_BASE));
    expect(keys).toEqual([
      "schema_version",
      "proof",
      "status",
      "reason",
      "restore_strategy",
      "capabilities",
      "managed_auth_status",
      "storage_key_present",
      "session_present",
      "cookies_present",
      "access_token_present",
      "user_id_present",
      "target_project_verified",
      "missing",
    ]);
  });
});

describe("preflight CLI process contract", () => {
  const CLI = resolve(ROOT, "scripts/e2e/lovable-managed-session-preflight.mjs");

  function runCli(env: Record<string, string>) {
    try {
      const stdout = execFileSync(process.execPath, [CLI], {
        env: { PATH: process.env.PATH ?? "", ...env },
        encoding: "utf8",
      });
      return { code: 0, stdout };
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      return { code: err.status ?? -1, stdout: String(err.stdout ?? "") };
    }
  }

  it("signed-out env ⇒ human BLOCKED output + exactly one receipt line + exit 2", () => {
    const { code, stdout } = runCli({ LOVABLE_BROWSER_AUTH_STATUS: "signed_out" });
    expect(code).toBe(2);
    expect(stdout).toContain("Managed browser session: BLOCKED");
    expect(stdout).toContain("Reason: reported_signed_out");
    const receiptLines = stdout
      .split("\n")
      .filter((l) => l.startsWith(ONE_TENT_PREFLIGHT_JSON_PREFIX));
    expect(receiptLines).toHaveLength(1);
    const parsed = JSON.parse(receiptLines[0].slice(ONE_TENT_PREFLIGHT_JSON_PREFIX.length));
    expect(parsed.status).toBe("blocked");
    expect(parsed.reason).toBe("reported_signed_out");
  });

  it("empty env ⇒ blocked missing_session_json, deterministic across two runs", () => {
    const a = runCli({});
    const b = runCli({});
    expect(a.code).toBe(2);
    const lineA = a.stdout.split("\n").find((l) => l.startsWith(ONE_TENT_PREFLIGHT_JSON_PREFIX));
    const lineB = b.stdout.split("\n").find((l) => l.startsWith(ONE_TENT_PREFLIGHT_JSON_PREFIX));
    expect(lineA).toBeTruthy();
    expect(lineA).toBe(lineB);
  });

  it("CLI never prints tokens or cookie values", () => {
    const { stdout } = runCli({
      LOVABLE_BROWSER_AUTH_STATUS: "signed_in",
      LOVABLE_BROWSER_SUPABASE_SESSION_JSON: SESSION,
      LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: "sb-key",
      LOVABLE_BROWSER_COOKIES_JSON: COOKIE,
    });
    expect(stdout).not.toContain("REDACTED-access-token");
    expect(stdout).not.toContain("REDACTED-cookie-value");
    expect(stdout).not.toContain("grower@example.test");
  });
});
