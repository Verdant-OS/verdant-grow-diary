/**
 * Fixture tests for the sanitized DB error helper. Runs in fast lane —
 * no local Supabase required.
 */
import { describe, it, expect } from "vitest";
import {
  expectSanitizedDbError,
  FORBIDDEN_LEAK_PATTERNS,
} from "./integration/_helpers/sanitizedDbError";

function shouldPass(err: unknown) {
  expect(() => expectSanitizedDbError(err)).not.toThrow();
}
function shouldFail(err: unknown) {
  expect(() => expectSanitizedDbError(err)).toThrow();
}

describe("sanitizedDbError helper", () => {
  it("accepts null / undefined without throwing", () => {
    shouldPass(null);
    shouldPass(undefined);
  });

  it("passes on generic sanitized RLS errors", () => {
    shouldPass({
      message: "new row violates row-level security policy for table \"profiles\"",
      code: "42501",
    });
    shouldPass({
      message: "CANNOT_UPDATE_GAMIFICATION_FIELDS",
      code: "P0001",
    });
    shouldPass({
      message: "permission denied for schema public",
      code: "42501",
    });
  });

  it("fails when the error references billing_subscriptions", () => {
    shouldFail({ message: "policy on billing_subscriptions denied" });
  });

  it("fails when the error references profiles.tier", () => {
    shouldFail({ details: "column profiles.tier cannot be updated" });
  });

  it("fails when the error references entitlement / plan_id / current_period_end", () => {
    shouldFail({ message: "entitlement check failed" });
    shouldFail({ hint: "compare plan_id against pro_monthly" });
    shouldFail({ details: "current_period_end < now()" });
  });

  it("fails on provider IDs and provider column names", () => {
    shouldFail({ message: "provider_customer_id mismatch" });
    shouldFail({ details: "cus_abc123 not found" });
    shouldFail({ hint: "paddle subscription conflict" });
  });

  it("fails on JWT / bearer / authorization / service_role leakage", () => {
    shouldFail({
      message: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.foo.bar",
    });
    shouldFail({ details: "SUPABASE_SERVICE_ROLE_KEY missing" });
    shouldFail({ hint: "refresh_token expired" });
  });

  it("fails on stack traces and SQL function bodies", () => {
    shouldFail({
      message:
        "error at /home/runner/work/app/src/lib/entitlements.ts:42:11 while resolving",
    });
    shouldFail({
      details:
        "CREATE OR REPLACE FUNCTION public.has_pheno_tracker_entitlement(uuid) RETURNS boolean AS $$ SELECT ...",
    });
  });

  it("exports a non-empty forbidden-pattern list", () => {
    expect(FORBIDDEN_LEAK_PATTERNS.length).toBeGreaterThan(20);
  });
});
