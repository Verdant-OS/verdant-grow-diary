import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideRlsSelftestAccess,
  RLS_SELFTEST_ENABLED_ENV,
  RLS_SELFTEST_SECRET_ENV,
  RLS_SELFTEST_SECRET_HEADER,
} from "../../supabase/functions/_shared/rlsSelftestGate.ts";

// rls-selftest creates real auth users with the service-role key, so it must
// do nothing on a project that has not opted in, and must compare its secret
// with the timing-safe helper. Security review finding D1 (2026-11-19).

// A fixture value built at run time; it is not a credential.
const FIXTURE_TOKEN = ["fixture", "header", "value"].join("-");
type GateInput = Parameters<typeof decideRlsSelftestAccess>[0];
const enabled = (overrides: Partial<GateInput> = {}) =>
  decideRlsSelftestAccess({
    enabledFlag: "true",
    expectedSecret: FIXTURE_TOKEN,
    providedSecret: FIXTURE_TOKEN,
    ...overrides,
  });

describe("rls-selftest gate", () => {
  it("allows a matching header when the project opted in", () => {
    expect(enabled()).toEqual({ allowed: true });
  });

  it.each([undefined, null, "", "false", "TRUE", "1", "yes", " true"])(
    "answers 404 when RLS_SELFTEST_ENABLED is %j, even with the right header",
    (flag) => {
      expect(enabled({ enabledFlag: flag })).toEqual({
        allowed: false,
        status: 404,
        error: "not_found",
      });
    },
  );

  it.each<[string, Partial<GateInput>]>([
    ["nothing configured", { expectedSecret: undefined }],
    ["an empty configured value", { expectedSecret: "" }],
    ["no header", { providedSecret: null }],
    ["an empty header", { providedSecret: "" }],
    ["both empty", { expectedSecret: "", providedSecret: "" }],
    ["a header one character short", { providedSecret: FIXTURE_TOKEN.slice(0, -1) }],
    ["a header one character long", { providedSecret: `${FIXTURE_TOKEN}x` }],
    ["a case change", { providedSecret: FIXTURE_TOKEN.toUpperCase() }],
  ])("forbids %s", (_label, overrides) => {
    expect(enabled(overrides)).toEqual({ allowed: false, status: 403, error: "forbidden" });
  });

  it("keeps the names the harness and its caller already use", () => {
    expect(RLS_SELFTEST_ENABLED_ENV).toBe("RLS_SELFTEST_ENABLED");
    expect(RLS_SELFTEST_SECRET_ENV).toBe("RLS_TEST_SECRET");
    expect(RLS_SELFTEST_SECRET_HEADER).toBe("x-rls-test-secret");
  });
});

describe("rls-selftest wiring", () => {
  // @source-scan-justified: the harness is a Deno entry point that calls
  // Deno.serve at import time, so this suite cannot import it; the gate itself
  // is tested above on resolved values.
  const source = readFileSync(
    resolve(__dirname, "../../supabase/functions/rls-selftest/index.ts"),
    "utf8",
  );

  it("decides access before it touches the service-role key", () => {
    const gateAt = source.indexOf("decideRlsSelftestAccess(");
    const serviceKeyAt = source.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    const createUserAt = source.indexOf("auth.admin.createUser");
    expect(gateAt).toBeGreaterThan(-1);
    expect(serviceKeyAt).toBeGreaterThan(gateAt);
    expect(createUserAt).toBeGreaterThan(gateAt);
    expect(source).toContain("if (!gate.allowed) return json({ error: gate.error }, gate.status);");
  });

  it("no longer compares the header with a plain inequality", () => {
    expect(source).not.toMatch(/provided\s*!==\s*expected/);
    expect(source).not.toContain('Deno.env.get("RLS_TEST_SECRET")');
  });
});
