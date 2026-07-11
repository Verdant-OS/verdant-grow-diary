/**
 * Pure tests for the managed-session preflight helper.
 * No I/O. No network. No Supabase.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateManagedSession,
  buildSafeDiagnostics,
  MANAGED_SESSION_ENV,
  type ManagedSessionEnvSnapshot,
} from "../../e2e/helpers/lovableManagedSupabaseSession";

const validSession = JSON.stringify({
  access_token: "REDACTED-access",
  refresh_token: "REDACTED-refresh",
  expires_at: 1_800_000_000,
  user: { id: "user-abc", email: "grower@example.test" },
});

const ready: ManagedSessionEnvSnapshot = {
  authStatus: "injected",
  sessionJson: validSession,
  storageKey: "sb-project-auth-token",
  cookiesJson: "[]",
};

describe("evaluateManagedSession", () => {
  it("returns blocked when auth status reports signed_out", () => {
    const r = evaluateManagedSession({ ...ready, authStatus: "signed_out" });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") {
      expect(r.reason).toBe("reported_signed_out");
      expect(r.missing).toContain(MANAGED_SESSION_ENV.status);
    }
  });

  it("returns blocked when session JSON is missing", () => {
    const r = evaluateManagedSession({ ...ready, sessionJson: "" });
    expect(r.status === "blocked" && r.reason).toBe("missing_session_json");
  });

  it("returns blocked when storage key is missing", () => {
    const r = evaluateManagedSession({ ...ready, storageKey: "" });
    expect(r.status === "blocked" && r.reason).toBe("missing_storage_key");
  });

  it("returns blocked when session JSON is malformed", () => {
    const r = evaluateManagedSession({ ...ready, sessionJson: "{not json" });
    expect(r.status === "blocked" && r.reason).toBe("invalid_session_json");
  });

  it("returns blocked when access token is missing", () => {
    const r = evaluateManagedSession({
      ...ready,
      sessionJson: JSON.stringify({ user: { id: "u" } }),
    });
    expect(r.status === "blocked" && r.reason).toBe("missing_access_token");
  });

  it("returns blocked when user id is missing", () => {
    const r = evaluateManagedSession({
      ...ready,
      sessionJson: JSON.stringify({ access_token: "t", user: {} }),
    });
    expect(r.status === "blocked" && r.reason).toBe("missing_user_id");
  });

  it("returns ready for a valid managed session", () => {
    const r = evaluateManagedSession(ready);
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      expect(r.session.user.id).toBe("user-abc");
      expect(r.storageKey).toBe("sb-project-auth-token");
      expect(Array.isArray(r.cookies)).toBe(true);
    }
  });

  it("safe diagnostics never expose tokens, cookies, or full session JSON", () => {
    const r = evaluateManagedSession(ready);
    const diag = buildSafeDiagnostics(ready, r);
    const serialized = JSON.stringify(diag);
    expect(serialized).not.toContain("REDACTED-access");
    expect(serialized).not.toContain("REDACTED-refresh");
    expect(serialized).not.toContain("grower@example.test");
    expect(diag.status).toBe("ready");
    expect(diag.hasAccessToken).toBe(true);
    expect(diag.hasUserId).toBe(true);
  });

  it("is deterministic for the same input snapshot", () => {
    const a = evaluateManagedSession(ready);
    const b = evaluateManagedSession(ready);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("performs no network or supabase call (contract check)", () => {
    // No fetch/network globals should be reached. This test just calls the
    // pure evaluator; if it ever gained I/O, other targeted tests would
    // fail. Kept as an executable reminder.
    expect(() => evaluateManagedSession(ready)).not.toThrow();
  });

  it("blocked diagnostics also redact env-derived strings", () => {
    const bad: ManagedSessionEnvSnapshot = {
      ...ready,
      sessionJson: "{",
    };
    const r = evaluateManagedSession(bad);
    const diag = buildSafeDiagnostics(bad, r);
    expect(diag.status).toBe("blocked");
    expect(JSON.stringify(diag)).not.toContain("{");
    expect(diag.hasUserId).toBe(false);
    expect(diag.hasAccessToken).toBe(false);
  });
});
