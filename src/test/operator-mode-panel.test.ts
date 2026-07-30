import { describe, it, expect } from "vitest";
import { __test } from "@/components/OperatorModePanel";
import type { SchemaAuditResponse } from "@/lib/schemaAuditRules";

const { CRITICAL_CHECKS, evaluateCriticalCheck } = __test;

function response(partial: Partial<SchemaAuditResponse>): SchemaAuditResponse {
  return {
    migrations: [],
    tables: [],
    columns: [],
    rls_audit: [],
    user_id: "u",
    checked_at: new Date(0).toISOString(),
    snapshot_fingerprint: "fp",
    ...partial,
  } as SchemaAuditResponse;
}

describe("evaluateCriticalCheck", () => {
  const phenoCheck = CRITICAL_CHECKS.find((c) => c.id === "pheno-crosses-taxonomy")!;

  it("reports unknown when no data has loaded yet", () => {
    const result = evaluateCriticalCheck(phenoCheck, null);
    expect(result.status).toBe("unknown");
    expect(result.migrationApplied).toBeNull();
  });

  it("reports missing when the migration is absent from the ledger", () => {
    const result = evaluateCriticalCheck(
      phenoCheck,
      response({
        migrations: [],
        tables: [
          { table: "pheno_crosses", exists: true },
          { table: "pheno_reversals", exists: true },
        ],
        columns: [{ table: "pheno_crosses", column: "channel", exists: true }],
      }),
    );
    expect(result.status).toBe("missing");
    expect(result.migrationApplied).toBe(false);
  });

  it("reports missing when the required column is absent even if migration is applied", () => {
    const result = evaluateCriticalCheck(
      phenoCheck,
      response({
        migrations: [
          {
            filename: phenoCheck.migration,
            version: "20260707210000",
            applied: true,
            match_kind: "exact_version",
            candidate_count: 1,
            matched_version: "20260707210000",
            matched_name: phenoCheck.migration,
          },
        ],
        tables: [
          { table: "pheno_crosses", exists: true },
          { table: "pheno_reversals", exists: true },
        ],
        columns: [{ table: "pheno_crosses", column: "channel", exists: false }],
      }),
    );
    expect(result.status).toBe("missing");
    expect(result.missingColumns).toEqual([{ table: "pheno_crosses", column: "channel" }]);
  });

  it("reports ok when ledger, tables and columns all check out", () => {
    const result = evaluateCriticalCheck(
      phenoCheck,
      response({
        migrations: [
          {
            filename: phenoCheck.migration,
            version: "20260707210000",
            applied: true,
            match_kind: "exact_version",
            candidate_count: 1,
            matched_version: "20260707210000",
            matched_name: phenoCheck.migration,
          },
        ],
        tables: [
          { table: "pheno_crosses", exists: true },
          { table: "pheno_reversals", exists: true },
        ],
        columns: [{ table: "pheno_crosses", column: "channel", exists: true }],
      }),
    );
    expect(result.status).toBe("ok");
    expect(result.missingTables).toEqual([]);
    expect(result.missingColumns).toEqual([]);
  });
});
