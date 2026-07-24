import { describe, expect, it } from "vitest";

import { buildAiDoctorSessionPersistenceFailureDiagnostic } from "@/lib/aiDoctorSessionPersistenceFailureRules";

const scope = {
  hasGrowScope: true,
  hasTentScope: true,
  hasPlantScope: true,
};

describe("AI Doctor session persistence failure diagnostics", () => {
  it("classifies an RLS insert failure with safe scope and auth context", () => {
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "insert",
      error: {
        code: "42501",
        message: "new row violates row-level security policy",
        details: "permission denied",
        hint: "Check the owned grow scope",
      },
      authResolution: "resolved",
      scope,
      fallbackMessage: "insert_failed",
    });

    expect(diagnostic).toMatchObject({
      table: "ai_doctor_sessions",
      operation: "insert",
      stage: "insert",
      category: "rls",
      code: "42501",
      safeMessage: "AI Doctor history save was blocked by its ownership policy.",
      safeDetails: null,
      safeHint: null,
      authResolution: "resolved",
      scope,
    });
  });

  it.each([
    ["grower@example.com", "grower@example.com"],
    ["11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"],
    ["Bearer secret-token", "secret-token"],
    ["eyJabcdefgh.ijklmnop.qrstuvwx", "eyJabcdefgh.ijklmnop.qrstuvwx"],
    ["service_role=sk_test_supersecret", "sk_test_supersecret"],
    ["Invalid API key sb_secret_example123", "sb_secret_example123"],
    ["Authorization: Basic dXNlcjpwYXNz", "dXNlcjpwYXNz"],
    ["access_token=ya29.private", "ya29.private"],
    ["refresh_token: opaque-private", "opaque-private"],
    ["bridge_token=bridge-secret-123", "bridge-secret-123"],
    ["client_secret=client-secret-123", "client-secret-123"],
    ["verdant_bridge_token=bridge_private", "bridge_private"],
    ["stripe_webhook_secret=whsec_private", "whsec_private"],
    ["supabase_access_token=private-access", "private-access"],
    ["next_public_supabase_anon_key=anon_private", "anon_private"],
    ["SUPABASE_SERVICE_ROLE_KEY=private-env-value", "private-env-value"],
    ["postgresql://grower:password@db.example.test/verdant", "grower:password"],
    ['{"bridge_token":"opaque-secret"}', "opaque-secret"],
    ['{"service_role":"quoted-secret"}', "quoted-secret"],
    ['{"plant_note":"private grower observation"}', "private grower observation"],
    ['token = "two word private"', "two word private"],
  ] as const)("never returns raw diagnostic text from %s", (input, secret) => {
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "insert",
      error: { message: input, details: `row=${input}`, hint: `hint=${input}` },
      authResolution: "resolved",
      scope,
      fallbackMessage: "insert_failed",
    });
    const serialized = JSON.stringify(diagnostic);

    expect(serialized).not.toContain(secret);
    expect(diagnostic.safeDetails).toBeNull();
    expect(diagnostic.safeHint).toBeNull();
    expect(diagnostic.safeMessage).toMatch(/^AI Doctor history save /);
  });

  it("classifies constraint, auth, network, validation, and generic insert failures", () => {
    const build = (
      stage: "validation" | "insert" | "unexpected",
      error: { code?: string; message?: string },
    ) =>
      buildAiDoctorSessionPersistenceFailureDiagnostic({
        stage,
        error,
        authResolution: "unavailable",
        scope: { hasGrowScope: true, hasTentScope: false, hasPlantScope: false },
        fallbackMessage: "failed",
      }).category;

    expect(build("insert", { code: "23503", message: "foreign key" })).toBe("constraint");
    expect(build("insert", { code: "PGRST301", message: "JWT expired" })).toBe("auth");
    expect(build("insert", { code: "42501", message: "permission denied for table" })).toBe(
      "permission",
    );
    expect(build("unexpected", { message: "network request failed" })).toBe("network");
    expect(build("validation", { message: "nothing to persist" })).toBe("validation");
    expect(build("insert", { message: "database unavailable" })).toBe("insert");
  });

  it("is deterministic and returns only fixed allowlisted copy", () => {
    const input = {
      stage: "insert" as const,
      error: { code: "custom_code", message: "x".repeat(500) },
      authResolution: "lookup_failed" as const,
      scope,
      fallbackMessage: "insert_failed",
    };
    const first = buildAiDoctorSessionPersistenceFailureDiagnostic(input);

    expect(buildAiDoctorSessionPersistenceFailureDiagnostic(input)).toEqual(first);
    expect(first.safeMessage).toBe("AI Doctor history save failed at the database insert.");
    expect(first.safeDetails).toBeNull();
    expect(first.safeHint).toBeNull();
    expect(first.code).toBeNull();
  });

  it("does not expose arbitrary or secret-shaped error codes", () => {
    const diagnostic = buildAiDoctorSessionPersistenceFailureDiagnostic({
      stage: "insert",
      error: { code: "sk_live_supersecret", message: "insert failed" },
      authResolution: "resolved",
      scope,
      fallbackMessage: "insert_failed",
    });

    expect(diagnostic.code).toBeNull();
    expect(JSON.stringify(diagnostic)).not.toContain("sk_live_supersecret");
  });
});
