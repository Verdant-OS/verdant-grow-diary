// rlsSelftestGate — who may run the rls-selftest harness.
//
// rls-selftest uses the service-role key to create two real auth users and
// write rows, then deletes them. It is a test harness that lives in the
// functions folder, so a deploy can put it on the production project.
// Security review finding D1 (2026-11-19).
//
// The harness runs only when both hold:
//  - the project sets RLS_SELFTEST_ENABLED to exactly "true" (off unless set,
//    so a project that never opted in answers 404, as if it were not there);
//  - the caller's x-rls-test-secret header matches RLS_TEST_SECRET, compared
//    with the shared timing-safe helper. An empty or missing secret on either
//    side never matches.
//
// Pure, deterministic, no I/O: the caller passes the env values and header.
import { timingSafeEqual } from "./lib/lib/timingSafeCompareRules.ts";

export const RLS_SELFTEST_ENABLED_ENV = "RLS_SELFTEST_ENABLED";
export const RLS_SELFTEST_SECRET_ENV = "RLS_TEST_SECRET";
export const RLS_SELFTEST_SECRET_HEADER = "x-rls-test-secret";

export type RlsSelftestGateInput = {
  enabledFlag: string | null | undefined;
  expectedSecret: string | null | undefined;
  providedSecret: string | null | undefined;
};

export type RlsSelftestGateDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 404; error: "not_found" | "forbidden" };

export function decideRlsSelftestAccess(input: RlsSelftestGateInput): RlsSelftestGateDecision {
  if (input.enabledFlag !== "true") {
    return { allowed: false, status: 404, error: "not_found" };
  }
  const expected = typeof input.expectedSecret === "string" ? input.expectedSecret : "";
  const provided = typeof input.providedSecret === "string" ? input.providedSecret : "";
  if (expected.length === 0 || provided.length === 0) {
    return { allowed: false, status: 403, error: "forbidden" };
  }
  if (!timingSafeEqual(provided, expected)) {
    return { allowed: false, status: 403, error: "forbidden" };
  }
  return { allowed: true };
}
