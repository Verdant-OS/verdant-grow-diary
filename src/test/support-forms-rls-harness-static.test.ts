import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

const HARNESS_PATH = resolve(process.cwd(), "scripts/run-support-forms-rls-harness.ts");
const HARNESS = existsSync(HARNESS_PATH)
  ? readFileSync(HARNESS_PATH, "utf8").replace(/\r\n?/g, "\n")
  : "";

function extractStringArray(name: string): string[] {
  const match = HARNESS.match(
    new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`),
  );
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]) : [];
}

function extractLoopbackPredicate(): (hostname: string) => boolean {
  const match = HARNESS.match(
    /function isLoopbackHost\(hostname: string\): boolean \{[\s\S]*?\n\}/,
  );
  if (!match) throw new Error("isLoopbackHost source is missing");
  const executableSource = match[0].replace(
    "function isLoopbackHost(hostname: string): boolean",
    "function isLoopbackHost(hostname)",
  );
  return runInNewContext(`(${executableSource})`, Object.create(null), {
    timeout: 100,
  }) as (hostname: string) => boolean;
}

describe("support forms RLS runtime harness static contract", () => {
  it("exists and refuses every non-loopback target", () => {
    expect(HARNESS).not.toBe("");
    expect(HARNESS).toContain('const LOCAL_LANE_FLAG = "--confirm-local-security-lane"');
    expect(HARNESS).toContain("isLoopbackHost");
    expect(HARNESS).toContain("local security lane requires a loopback database");
    expect(HARNESS).toContain("process.exit(2)");
    expect(HARNESS).toContain('"SUPABASE_URL"');
    expect(HARNESS).toContain('"SUPABASE_SERVICE_ROLE_KEY"');
    expect(HARNESS).toContain('"SUPABASE_ANON_KEY"');
  });

  it("executes the loopback predicate and pins the fail-closed runtime branch", () => {
    const isLoopbackHost = extractLoopbackPredicate();

    for (const hostname of ["localhost", "localhost.", "127.0.0.1", "::1", "[::1]"]) {
      expect(isLoopbackHost(hostname), hostname).toBe(true);
    }
    for (const hostname of [
      "verdantgrowdiary.com",
      "8.8.8.8",
      "127.0.0.2",
      "localhost.example.com",
      "2001:4860:4860::8888",
      "[2001:4860:4860::8888]",
    ]) {
      expect(isLoopbackHost(hostname), hostname).toBe(false);
    }

    expect(HARNESS).toMatch(
      /if \(!isLoopbackHost\(targetHostname\)\) \{[\s\S]*?local security lane requires a loopback database[\s\S]*?process\.exit\(2\);[\s\S]*?\}/,
    );
  });

  it("uses real anon, authenticated, operator, and service-role clients", () => {
    expect(HARNESS).toContain("createClient");
    expect(HARNESS).toContain("admin.auth.admin.createUser");
    expect(HARNESS).toContain("signInWithPassword");
    expect(HARNESS).toContain('.from("user_roles")');
    expect(HARNESS).toContain('role: "operator"');
    expect(HARNESS).toContain("assertAllowedInserts");
    expect(HARNESS).toContain("assertReadMutationIsolation");
    expect(HARNESS).toContain("assertOperatorWorkflow");
  });

  it("pins the exact public and server-owned column boundaries", () => {
    expect(extractStringArray("FEEDBACK_PUBLIC_INSERT_COLUMNS")).toEqual([
      "overall_rating",
      "ai_doctor_rating",
      "sensors_rating",
      "quicklog_rating",
      "trust_rating",
      "whats_working",
      "whats_friction",
      "one_improvement",
      "grow_context",
      "contact_email",
      "follow_up_ok",
      "user_agent",
    ]);
    expect(extractStringArray("CONTACT_PUBLIC_INSERT_COLUMNS")).toEqual([
      "name",
      "email",
      "category",
      "message",
      "grow_context",
      "user_agent",
    ]);
    expect(extractStringArray("FEEDBACK_SERVER_ONLY_COLUMNS")).toEqual([
      "id",
      "user_id",
      "created_at",
      "reviewed_at",
      "reviewed_by",
      "admin_notes",
    ]);
    expect(extractStringArray("CONTACT_SERVER_ONLY_COLUMNS")).toEqual([
      "id",
      "user_id",
      "attachment_path",
      "created_at",
      "reviewed_at",
      "reviewed_by",
      "admin_notes",
    ]);
    expect(HARNESS).toContain("assertServerOwnedColumnsRejected");
    expect(HARNESS).toContain("assertPayloadBoundaries");
  });

  it("covers every public payload limit and contact category", () => {
    for (const limit of [120, 320, 500, 4000, 8000]) {
      expect(HARNESS).toContain(String(limit));
    }
    expect(extractStringArray("CONTACT_CATEGORIES")).toEqual([
      "technical_support",
      "bug_report",
      "feature_idea",
      "billing_account",
      "hardware_integration",
      "other",
    ]);
    expect(HARNESS).toContain("max accepted");
    expect(HARNESS).toContain("max + 1 rejected");
    expect(HARNESS).toContain("whitespace-only");
    expect(HARNESS).toContain("malformed email");
  });

  it("runs invalid payloads through both browser-equivalent roles", () => {
    expect(HARNESS).toContain(
      "async function assertPayloadBoundaries(authenticated: SupabaseClient)",
    );
    expect(HARNESS).toContain('["anon", anonymous]');
    expect(HARNESS).toContain('["authenticated", authenticated]');
    expect(HARNESS).toContain("await assertPayloadBoundaries(submitterClient)");
  });

  it("exercises and service-verifies submitter-owned authenticated rows", () => {
    expect(HARNESS).toContain('relation: "own authenticated"');
    expect(HARNESS).toContain("feedbackId: fixtures.feedbackAuthId");
    expect(HARNESS).toContain("feedbackAuthRatingOnlyId");
    expect(HARNESS).toContain("contactId: fixtures.contactAuthId");
    expect(HARNESS).toContain("cannot read ${relation} feedback");
    expect(HARNESS).toContain("cannot update ${relation} feedback review state");
    expect(HARNESS).toContain("cannot delete ${relation} feedback");
    expect(HARNESS).toContain(
      "service verification confirms isolated support rows remain unchanged",
    );
    expect(HARNESS).toContain("feedbackAuthOriginalImprovement");
    expect(HARNESS).toContain("contactAuthOriginalMessage");
  });

  it("inserts and service-locates authenticated rating-only feedback", () => {
    const start = HARNESS.indexOf("const ratingOnlyPayload");
    const end = HARNESS.indexOf("};", start);
    const payload = start >= 0 && end > start ? HARNESS.slice(start, end) : "";

    expect(payload).not.toBe("");
    expect(payload).toContain("overall_rating: RATING_ONLY_OVERALL_RATING");
    for (const column of [
      "ai_doctor_rating",
      "sensors_rating",
      "quicklog_rating",
      "trust_rating",
      "whats_working",
      "whats_friction",
      "one_improvement",
      "grow_context",
      "contact_email",
      "user_agent",
    ]) {
      expect(payload).toContain(`${column}: null`);
    }
    expect(payload).toContain("follow_up_ok: false");
    expect(HARNESS).toContain("feedback authenticated rating-only accepted");
    expect(HARNESS).toContain('.eq("user_id", authenticatedUserId)');
    expect(HARNESS).toContain('.eq("overall_rating", RATING_ONLY_OVERALL_RATING)');
    expect(HARNESS).toContain("service verification confirms authenticated rating-only feedback");
    expect(HARNESS).toContain("feedbackAuthRatingOnlyId: ratingOnlyFeedback.id");
  });

  it("pins explicit denial classes and mutation postconditions", () => {
    expect(HARNESS).toContain("AUTHORIZATION_DENIAL_CODES");
    expect(HARNESS).toContain("PAYLOAD_DENIAL_CODES");
    expect(HARNESS).toContain("isExpectedDatabaseDenial");
    expect(HARNESS).toContain("unexpected database rejection");
    expect(HARNESS).toContain("unexpected database error");
    expect(HARNESS).toContain("assertIsolationPostconditions");
  });

  it("reviews and resets anonymous and authenticated rows for both forms", () => {
    expect(HARNESS).toContain("function isSameInstant");
    expect(HARNESS).toContain("const operatorFeedbackCases");
    expect(HARNESS).toContain("const operatorContactCases");
    expect(HARNESS).toContain("id: fixtures.feedbackAnonId");
    expect(HARNESS).toContain("id: fixtures.feedbackAuthId");
    expect(HARNESS).toContain("id: fixtures.feedbackAuthRatingOnlyId");
    expect(HARNESS).toContain("id: fixtures.contactAnonId");
    expect(HARNESS).toContain("id: fixtures.contactAuthId");
    expect(HARNESS).toContain("operator can review ${origin} feedback");
    expect(HARNESS).toContain("operator can review ${origin} contact message");
    expect(HARNESS).toContain("operator can return ${origin} feedback to new");
    expect(HARNESS).toContain("operator can return ${origin} contact message to new");
    expect(HARNESS).toContain("assertOperatorReviewedPostconditions");
    expect(HARNESS).toContain("assertOperatorMarkNewPostconditions");

    const reviewed = HARNESS.indexOf("await assertOperatorReviewedPostconditions");
    const markNew = HARNESS.indexOf("operator can return ${origin} feedback to new");
    const reset = HARNESS.indexOf("await assertOperatorMarkNewPostconditions");
    expect(reviewed).toBeGreaterThan(-1);
    expect(markNew).toBeGreaterThan(reviewed);
    expect(reset).toBeGreaterThan(markNew);
  });

  it("makes teardown ordered, verified, and fail closed", () => {
    const supportDelete = HARNESS.indexOf("delete support rows");
    const roleDelete = HARNESS.indexOf("delete user_roles");
    const profileDelete = HARNESS.indexOf("delete profiles");
    const authDelete = HARNESS.indexOf("delete auth user");
    const verify = HARNESS.indexOf("verifyTeardown");

    expect(supportDelete).toBeGreaterThan(-1);
    expect(roleDelete).toBeGreaterThan(supportDelete);
    expect(profileDelete).toBeGreaterThan(roleDelete);
    expect(authDelete).toBeGreaterThan(profileDelete);
    expect(verify).toBeGreaterThan(authDelete);

    expect(HARNESS).toContain("cleanupErrors.push");
    expect(HARNESS).toContain("teardown failed");
    expect(HARNESS).toContain("null count");
    expect(HARNESS).toContain("still exists");
    expect(HARNESS).not.toContain(".catch(() => {})");

    const finalizer = HARNESS.slice(HARNESS.lastIndexOf("await main()"));
    const cleanup = finalizer.indexOf("await teardown()");
    const verifyCleanup = finalizer.indexOf("await verifyTeardown()");
    const exitCode = finalizer.indexOf("process.exitCode = failed === 0 ? 0 : 1");

    expect(finalizer).toMatch(/^await main\(\)\s*\.catch\(/);
    expect(finalizer).toContain(".finally(async () =>");
    expect(cleanup).toBeGreaterThan(-1);
    expect(verifyCleanup).toBeGreaterThan(cleanup);
    expect(exitCode).toBeGreaterThan(verifyCleanup);
    expect(finalizer).not.toContain("process.exit(");
  });

  it("never prints database credentials or auth material", () => {
    expect(HARNESS).not.toMatch(/console\.(?:log|error)\([^)]*(?:serviceKey|anonKey|SUPABASE_URL)/);
    expect(HARNESS).not.toContain("getSession");
    expect(HARNESS).not.toContain("access_token");
    expect(HARNESS).not.toContain("refresh_token");
  });

  it("redacts synthetic identifiers from database diagnostics", () => {
    expect(HARNESS).toContain("function redactSensitiveText");
    expect(HARNESS).toContain('"[email]"');
    expect(HARNESS).toContain('"[id]"');
    expect(HARNESS).toMatch(/function safeError[\s\S]*return redactSensitiveText/);
  });
});
