/**
 * S2 parity: SQL public.ai_credit_allowance(plan_id) MUST mirror the TS
 * PLAN_CATALOG. Both definitions exist on purpose (TS for client previews,
 * SQL for atomic server enforcement). They must never drift.
 *
 * Runs only when SUPABASE_DB_URL is set so CI is not forced to spin up a
 * database. Skipped otherwise with a visible note.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { PLAN_CATALOG } from "@/lib/entitlements/planCatalog";

const DB_URL = process.env.SUPABASE_DB_URL;

function q(sql: string): string {
  return execSync(`psql "${DB_URL}" -At -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: "utf8",
  }).trim();
}

describe.skipIf(!DB_URL)("ai_credit_allowance ↔ PLAN_CATALOG parity", () => {
  for (const planId of Object.keys(PLAN_CATALOG)) {
    it(`SQL allowance matches TS capabilities for ${planId}`, () => {
      const row = q(
        `select coalesce(per_grow::text,'null') || '|' || coalesce(per_month::text,'null') from public.ai_credit_allowance('${planId}')`,
      );
      const [perGrowStr, perMonthStr] = row.split("|");
      const sqlPerGrow = perGrowStr === "null" ? null : Number(perGrowStr);
      const sqlPerMonth = perMonthStr === "null" ? null : Number(perMonthStr);

      const cap = PLAN_CATALOG[planId as keyof typeof PLAN_CATALOG];
      expect({ per_grow: sqlPerGrow, per_month: sqlPerMonth })
        .toEqual({ per_grow: cap.aiCreditsPerGrow, per_month: cap.aiMonthlyCredits });
    });
  }

  it("fails closed for unknown plan_id → (0,0), never null", () => {
    const row = q(
      `select coalesce(per_grow::text,'null') || '|' || coalesce(per_month::text,'null') from public.ai_credit_allowance('not_a_real_plan')`,
    );
    expect(row).toBe("0|0");
  });

  it("founder_lifetime is hard-pinned to 100/month (not unlimited)", () => {
    const row = q(`select per_month from public.ai_credit_allowance('founder_lifetime')`);
    expect(row).toBe("100");
  });
});
