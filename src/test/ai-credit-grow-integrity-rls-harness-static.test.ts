import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const CREDIT_HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-ai-credit-grow-scope-integrity-harness.ts"),
  "utf8",
);
const RECEIPT_HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-ai-doctor-review-evidence-receipt-rls-harness.ts"),
  "utf8",
);

describe("AI credit grow-integrity runtime harness contracts", () => {
  it("keeps the broad credit harness opt-in, local-first, unique, and cleanup-safe", () => {
    expect(CREDIT_HARNESS).toContain(
      'const CONFIRM_ENV = "AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS"',
    );
    expect(CREDIT_HARNESS).toContain('process.env[CONFIRM_ENV] !== "1"');
    expect(CREDIT_HARNESS).toContain(
      'const REMOTE_CONFIRM_ENV = "AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS_ALLOW_REMOTE"',
    );
    expect(CREDIT_HARNESS).toContain('process.env[REMOTE_CONFIRM_ENV] !== "1"');
    expect(CREDIT_HARNESS).toContain('hostname === "localhost"');
    expect(CREDIT_HARNESS).toContain('hostname === "127.0.0.1"');
    expect(CREDIT_HARNESS).toContain('hostname === "[::1]"');
    expect(CREDIT_HARNESS).toContain('hostname === "::1"');
    expect(CREDIT_HARNESS).toContain("const runId = crypto.randomUUID().slice(0, 8)");
    expect(CREDIT_HARNESS).toContain("`ai-credit-grow-free-${runId}@verdant.test`");
    expect(CREDIT_HARNESS).toContain("`ai-credit-grow-pro-${runId}@verdant.test`");
    expect(CREDIT_HARNESS).toContain("`ai-credit-grow-staff-${runId}@verdant.test`");
    expect(CREDIT_HARNESS).not.toContain("admin.auth.admin.listUsers");
    expect(CREDIT_HARNESS).toContain("} finally {");
    expect(CREDIT_HARNESS).toContain("cleanupFailures");
    expect(CREDIT_HARNESS).toContain("cleanup failures for ${runId}");
    expect(CREDIT_HARNESS).not.toContain("deleteUser(uid).catch");
  });

  it("proves the service overload enforces owned, foreign, missing, and null grow rules", () => {
    for (const assertion of [
      "service Pro foreign grow rejected with no spend delta",
      "service Pro nonexistent grow rejected with no spend delta",
      "service Pro own grow succeeds",
      "service paid null grow remains allowed",
      "service staff foreign grow rejected with no spend delta",
      "service staff nonexistent grow rejected with no spend delta",
      "service staff own grow succeeds",
      "service staff null grow remains allowed",
      "service Free null grow remains rejected with no spend delta",
    ]) {
      expect(CREDIT_HARNESS).toContain(assertion);
    }
    expect(CREDIT_HARNESS).toContain('"grow_not_owned"');
    expect(CREDIT_HARNESS).toContain('"grow_id_required_for_plan"');
    expect(CREDIT_HARNESS).toContain("after === before");
    expect(CREDIT_HARNESS).toContain("rowsWithKey?.length === 0");
    expect(CREDIT_HARNESS).toContain('.eq("idempotency_key", idempotencyKey)');
  });

  it("covers the legacy expand overload without weakening the contract-phase revoke proof", () => {
    for (const assertion of [
      "legacy Pro foreign grow rejected with no spend delta",
      "legacy Pro nonexistent grow rejected with no spend delta",
      "legacy Pro own grow succeeds",
      "legacy paid null grow remains allowed",
      "legacy staff foreign grow rejected with no spend delta",
      "legacy staff nonexistent grow rejected with no spend delta",
      "legacy staff own grow succeeds",
      "legacy staff null grow remains allowed",
      "legacy Free null grow remains rejected with no spend delta",
      "contract legacy spend overload is revoked with no spend delta",
    ]) {
      expect(CREDIT_HARNESS).toContain(assertion);
    }
    expect(CREDIT_HARNESS).toContain('if (legacyMode === "available")');
    expect(CREDIT_HARNESS).toContain("AI_CREDIT_GROW_SCOPE_LEGACY_MODE=revoked");
    expect(CREDIT_HARNESS).toContain("isExpectedLegacyRevocation(error, data)");
    expect(CREDIT_HARNESS).toContain('code === "42501"');
    expect(CREDIT_HARNESS).toContain('code === "42883"');
    expect(CREDIT_HARNESS).toContain('code === "PGRST202"');
    expect(CREDIT_HARNESS).not.toContain(
      '(!!error || spendReply(data)?.reason === "not_authorized")',
    );
    expect(CREDIT_HARNESS).toContain('.select("user_id,grow_id,idempotency_key,feature,status")');
    expect(CREDIT_HARNESS).toContain("after === before + 1");
    expect(CREDIT_HARNESS).toContain("ledgerRow?.user_id === userId");
    expect(CREDIT_HARNESS).toContain("ledgerRow?.grow_id === expectedGrowId");
    expect(CREDIT_HARNESS).toContain("ledgerRow?.idempotency_key === idempotencyKey");
    expect(CREDIT_HARNESS).toContain('ledgerRow?.feature === "ai_doctor_review"');
    expect(CREDIT_HARNESS).toContain('ledgerRow?.status === "spent"');
  });

  it("proves same-id grow recreation cannot erase Free usage", () => {
    expect(CREDIT_HARNESS).toContain(
      "Free grow deletion preserves all historical grow-scoped spend rows",
    );
    expect(CREDIT_HARNESS).toContain(
      "same-UUID Free grow recreation cannot reset the three-credit allowance",
    );
    expect(CREDIT_HARNESS).toContain(
      'createGrow(uidFree, "Free recreated ownership fixture", growFree)',
    );
    expect(CREDIT_HARNESS).toContain("countBeforeGrowDelete");
    expect(CREDIT_HARNESS).toContain("const { error: growDeleteError } = await free");
  });

  it("proves grow deletion preserves financial history and account deletion still erases it", () => {
    for (const assertion of [
      "grow deletion removes the grow row without a database error",
      "grow deletion preserves the spend and its historical grow_id",
      "grow deletion preserves the monthly used credit weight",
      "grow deletion preserves the result-cache row and evidence receipt pair",
      "account deletion succeeds after grow deletion",
      "account deletion removes the spend, result-cache row, and evidence receipt",
    ]) {
      expect(RECEIPT_HARNESS).toContain(assertion);
    }
    expect(RECEIPT_HARNESS).toContain('select("id,user_id,grow_id,period_key,weight,status")');
    expect(RECEIPT_HARNESS).toContain("monthlyUsedWeight(uidA)");
    expect(RECEIPT_HARNESS).toContain("hasIntactPair(pairAfterGrowDelete, args)");
    expect(RECEIPT_HARNESS).toContain("const { error: growDeleteError } = await owner");
    expect(RECEIPT_HARNESS).toContain('.eq("user_id", uidA)');
    const growDeleteIndex = RECEIPT_HARNESS.indexOf('from("grows")\n      .delete()');
    const accountDeleteIndex = RECEIPT_HARNESS.indexOf("admin.auth.admin.deleteUser(uidA)");
    expect(growDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(accountDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(growDeleteIndex).toBeLessThan(accountDeleteIndex);
    expect(RECEIPT_HARNESS).toContain('admin.from("grows").delete().in("user_id", userIds)');
    expect(RECEIPT_HARNESS).toContain("if (userId === uidA && authUserADeleted) continue");
  });
});
