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
  // The SQL function returns the *active* scope: when per_grow is non-null
  // the plan is per-grow scoped and per_month is null (and vice versa).
  // The TS catalog stores both fields independently; we project the active
  // scope so we're comparing apples to apples.
  function expected(planId: keyof typeof PLAN_CATALOG) {
    const cap = PLAN_CATALOG[planId];
    if (cap.aiCreditsPerGrow !== null) return { per_grow: cap.aiCreditsPerGrow, per_month: null };
    return { per_grow: null, per_month: cap.aiMonthlyCredits };
  }

  for (const planId of Object.keys(PLAN_CATALOG) as Array<keyof typeof PLAN_CATALOG>) {
    it(`SQL allowance matches active-scope TS capability for ${planId}`, () => {
      const row = q(
        `select coalesce(per_grow::text,'null') || '|' || coalesce(per_month::text,'null') from public.ai_credit_allowance('${planId}')`,
      );
      const [perGrowStr, perMonthStr] = row.split("|");
      const sql = {
        per_grow: perGrowStr === "null" ? null : Number(perGrowStr),
        per_month: perMonthStr === "null" ? null : Number(perMonthStr),
      };
      expect(sql).toEqual(expected(planId));
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
