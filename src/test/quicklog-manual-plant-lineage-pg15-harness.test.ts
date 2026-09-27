import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  runPlantLineageHarness,
  validateLocalTarget,
} from "../../scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260927160000_quicklog_manual_plant_tent_lineage.sql",
  ),
  "utf8",
);
const harness = readFileSync(
  resolve(process.cwd(), "scripts/run-quicklog-manual-plant-lineage-pg15-harness.mjs"),
  "utf8",
);

describe("Quick Log manual plant/tent lineage fence", () => {
  it("replaces only the private delegate after an exact source preflight", () => {
    expect(migration).toContain("7ec296e422f7f47c8b2793b051840798");
    expect(migration).toContain(
      'CREATE OR REPLACE FUNCTION public."quicklog_save_manual_pre_logged_at"',
    );
    expect(migration).not.toMatch(/CREATE OR REPLACE FUNCTION public\.quicklog_save_manual\s*\(/i);
    expect(migration).not.toMatch(/(?:ALTER|DROP)\s+TABLE/i);
  });

  it("checks the same-owner assigned tent's grow before any event insert", () => {
    const guard = migration.indexOf("plant_tent_grow_mismatch");
    expect(guard).toBeGreaterThan(0);
    expect(migration).toContain("v_tent_grow_id IS DISTINCT FROM v_grow_id");
    expect(migration).toContain("t.id = v_tent_id AND t.user_id = uid");
    expect(guard).toBeLessThan(migration.indexOf("INSERT INTO public.grow_events"));
    expect(guard).toBeLessThan(migration.indexOf("INSERT INTO public.diary_entries"));
  });

  it("locks target rows and preserves tentless plant saves", () => {
    expect(migration).toMatch(/WHERE p\.id = p_target_id AND p\.user_id = uid\s+FOR SHARE/i);
    expect(migration).toMatch(/WHERE t\.id = p_target_id AND t\.user_id = uid\s+FOR SHARE/i);
    expect(migration).toContain("v_plant_id IS NOT NULL AND v_tent_id IS NOT NULL");
  });

  it("refuses non-disposable database targets before running SQL", async () => {
    expect(validateLocalTarget({ url: "postgresql://postgres:x@db.example/verdant" })).toBeNull();
    expect(
      validateLocalTarget({ url: "postgresql://postgres:x@127.0.0.1:5432/verdant" }),
    ).toBeNull();
    expect(
      validateLocalTarget({
        url: "postgresql://postgres:x@127.0.0.1:5432/verdant_quicklog_delegate_repair",
        containerId: "not-a-container",
      }),
    ).toBeNull();
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(
        await runPlantLineageHarness({ url: "postgresql://postgres:x@db.example/verdant" }),
      ).toBe(1);
    } finally {
      write.mockRestore();
    }
  });

  it("requires a pre-fix wrong-target witness, then rejects the new save with no rows", () => {
    expect(harness).toContain("baseline_wrong_target_save_not_reproduced");
    expect(harness).toContain("baseline_mixed_row");
    expect(harness).toContain("mixed_plant_not_rejected");
    expect(harness).toContain("rejection_wrote_no_rows");
    expect(harness).toContain("same_grow_save_failed");
    expect(harness).toContain("unassigned_save_failed");
  });
});
