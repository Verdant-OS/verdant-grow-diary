import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-ai-doctor-review-completion-rls-harness.ts"),
  "utf8",
);
const PACKAGE = readFileSync(resolve(ROOT, "package.json"), "utf8");

describe("AI Doctor review completion runtime harness contract", () => {
  it("requires explicit opt-in and remote acknowledgement before writing fixtures", () => {
    expect(HARNESS).toContain('const CONFIRM_ENV = "AI_DOCTOR_COMPLETION_RLS_HARNESS"');
    expect(HARNESS).toContain('process.env[CONFIRM_ENV] !== "1"');
    expect(HARNESS).toContain(
      'const REMOTE_CONFIRM_ENV = "AI_DOCTOR_COMPLETION_RLS_HARNESS_ALLOW_REMOTE"',
    );
    expect(HARNESS).toContain('process.env[REMOTE_CONFIRM_ENV] !== "1"');
  });

  it("proves browser roles cannot access a known protected completion or invoke its writer", () => {
    expect(HARNESS).toContain('from("ai_doctor_review_completions")');
    expect(HARNESS).toContain("server-recorded completion exists before client-role probes");
    expect(HARNESS).toContain("authenticated SELECT cannot read the server-recorded completion");
    expect(HARNESS).toContain("authenticated INSERT cannot forge a completion");
    expect(HARNESS).toContain("authenticated UPDATE cannot alter a completion");
    expect(HARNESS).toContain("authenticated DELETE cannot remove a completion");
    expect(HARNESS).toContain("authenticated RPC cannot record a completion");
    expect(HARNESS).toContain("anon SELECT cannot read the server-recorded completion");
    expect(HARNESS).toContain("anon INSERT cannot forge a completion");
    expect(HARNESS).toContain("anon UPDATE cannot alter a completion");
    expect(HARNESS).toContain("anon DELETE cannot remove a completion");
    expect(HARNESS).toContain("anon RPC cannot record a completion");
    expect(HARNESS).toContain("isIntactCompletion(");
    expect(HARNESS).toContain('return error?.code === "42501"');
    expect(HARNESS).not.toContain("data?.length === 0");
  });

  it("proves the server writer is idempotent and rejects ineligible ledger rows", () => {
    expect(HARNESS).toContain('admin.rpc("record_ai_doctor_review_completion"');
    expect(HARNESS).toContain(
      "service retry is idempotent and returns expected completion linkage",
    );
    expect(HARNESS).toContain("service role rejects mismatched expected user");
    expect(HARNESS).toContain("service role rejects AI Coach spend");
    expect(HARNESS).toContain("service role rejects refunded spend");
  });

  it("cleans every disposable fixture and reports cleanup failures", () => {
    expect(HARNESS).toContain('admin.from("profiles").delete().in("user_id", userIds)');
    expect(HARNESS).toContain("cleanupFailures");
    expect(HARNESS).toContain("cleanup failures for");
    expect(HARNESS).toContain("admin.auth.admin.deleteUser(userId)");
    expect(HARNESS).not.toContain("deleteUser(id).catch");
  });

  it("recognizes the browser's bracketed IPv6 loopback hostname", () => {
    expect(HARNESS).toContain('hostname === "[::1]"');
  });

  it("is exposed through an explicit, opt-in package command", () => {
    expect(PACKAGE).toContain('"test:ai-doctor-review-completion-rls"');
  });
});
