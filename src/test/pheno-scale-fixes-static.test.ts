/**
 * Static contracts for the pheno-hunt scale fixes (2026-07-09 data-layer
 * audit): bounded log reads, latest-per-plant sex view, save dirty-checks,
 * chunked candidate tagging, single-pass stress summaries.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("pheno scale — migration (indexes + latest-sex view)", () => {
  const sql = read(
    "supabase/migrations/20260709170000_pheno_scale_indexes_and_latest_sex_view.sql",
  );

  it("adds time-ordered per-hunt indexes for both append-only logs", () => {
    expect(sql).toMatch(/ON public\.pheno_keeper_decisions_log \(hunt_id, decided_at DESC\)/);
    expect(sql).toMatch(/ON public\.pheno_sex_observations \(hunt_id, observed_at DESC\)/);
  });

  it("latest-sex view is DISTINCT ON per plant and security_invoker (RLS applies)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.pheno_sex_observations_latest/);
    expect(sql).toMatch(/security_invoker = true/);
    expect(sql).toMatch(/SELECT DISTINCT ON \(hunt_id, plant_id\)/);
    expect(sql).toMatch(/ORDER BY hunt_id, plant_id, observed_at DESC/);
  });

  it("grants only SELECT to authenticated and refreshes PostgREST", () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.pheno_sex_observations_latest TO authenticated/);
    expect(sql).not.toMatch(/GRANT (ALL|INSERT|UPDATE|DELETE) ON public\.pheno_sex_observations_latest/);
    expect(sql).toMatch(/NOTIFY pgrst/);
  });
});

describe("pheno scale — bounded reads", () => {
  it("sex service reads the latest-per-plant view with a legacy fallback", () => {
    const src = read("src/lib/phenoSexObservationService.ts");
    expect(src).toMatch(/pheno_sex_observations_latest/);
    // fallback still present for deploy skew
    expect(src).toMatch(/from\("pheno_sex_observations"\)/);
  });

  it("decision-log history read is bounded", () => {
    const src = read("src/lib/phenoKeeperDecisionLogService.ts");
    expect(src).toMatch(/\.order\("decided_at", \{ ascending: false \}\)[\s\S]{0,400}\.limit\(500\)/);
  });
});

describe("pheno scale — write-path hygiene", () => {
  it("workspace saves dirty-check before appending to the audit logs", () => {
    const src = read("src/hooks/usePhenoHuntWorkspace.ts");
    expect(src).toMatch(/const existingDecision = decisionsByPlant\[plantId\]/);
    expect(src).toMatch(/const existingSex = sexByPlant\[plantId\]/);
    // dep arrays include the compared state (no stale-closure dirty-check)
    expect(src).toMatch(/\[id, decisionsByPlant\]/);
    expect(src).toMatch(/\[id, sexByPlant\]/);
  });

  it("hunt creation tags candidates in bounded-concurrency chunks with rollback", () => {
    const src = read("src/lib/phenoHuntService.ts");
    expect(src).toMatch(/TAG_CHUNK_SIZE = 10/);
    expect(src).toMatch(/Promise\.all\(/);
    // rollback untags before deleting the hunt row
    expect(src).toMatch(/pheno_hunt_id: null, candidate_label: null/);
  });

  it("stress summaries group rows once instead of per-candidate filtering", () => {
    const src = read("src/hooks/usePhenoStressObservations.ts");
    expect(src).toMatch(/grouped\[r\.plantId\] \?\?= \[\]/);
  });
});
