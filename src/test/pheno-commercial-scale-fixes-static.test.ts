/**
 * Static contracts for the pheno-hunt COMMERCIAL-scale fixes (2026-07-09
 * audit wave): on-demand history/round loading, memoized per-candidate and
 * per-keeper cards, explicit read bounds on every unbounded list, collapsed
 * per-candidate documentation, filter + paging on the workspace, the CSV
 * export, and the DB posture migration (owner-only hunts + stress index).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("pheno scale — on-demand loading (not hunt-wide upfront)", () => {
  const hook = read("src/hooks/usePhenoHuntWorkspace.ts");
  const logSvc = read("src/lib/phenoKeeperDecisionLogService.ts");
  const roundSvc = read("src/lib/phenoScoreRoundsService.ts");

  it("decision history is fetched per candidate, bounded, not hunt-wide on mount", () => {
    expect(logSvc).toMatch(/listKeeperDecisionHistoryForPlant/);
    expect(logSvc).toMatch(/\.eq\("plant_id", plant\)/);
    // per-plant read rides the (hunt_id, plant_id, decided_at) index with a cap
    expect(logSvc).toMatch(/\.limit\(50\)/);
    // the hook exposes the on-demand loader and no longer batch-loads history
    expect(hook).toMatch(/loadDecisionHistory/);
    expect(hook).not.toMatch(/listKeeperDecisionHistoryForHunt\(id\)/);
  });

  it("round cards are fetched per selected round, not all five upfront", () => {
    expect(hook).toMatch(/loadRound/);
    expect(roundSvc).toMatch(/round\?: PhenoScoreRound/);
    expect(roundSvc).toMatch(/query\.eq\("round", round\)/);
  });
});

describe("pheno scale — every unbounded list read is explicitly bounded", () => {
  it("stress observations read is capped and time-ordered", () => {
    const src = read("src/lib/pheno/phenoStressObservationsApi.ts");
    expect(src).toMatch(/listStressObservationsForHunt[\s\S]{0,600}\.limit\(1000\)/);
  });
  it("crosses / clones / lab / sex-fallback reads carry explicit limits", () => {
    expect(read("src/lib/phenoKeepersService.ts")).toMatch(
      /listCrossesForHunt[\s\S]{0,600}\.limit\(500\)/,
    );
    expect(read("src/lib/phenoKeepersService.ts")).toMatch(
      /listClonesForKeepers[\s\S]{0,900}\.limit\(2000\)/,
    );
    expect(read("src/lib/phenoLabResultsService.ts")).toMatch(/\.limit\(1500\)/);
    expect(read("src/lib/phenoSexObservationService.ts")).toMatch(
      /from\("pheno_sex_observations"\)[\s\S]{0,600}\.limit\(2000\)/,
    );
  });
  it("grow + tent name maps are fetched in parallel, not serially", () => {
    const src = read("src/lib/phenoHuntCandidatesService.ts");
    expect(src).toMatch(/Promise\.all\(\[\s*loadNameMap\("grows"/);
  });
});

describe("pheno scale — render cost bounded at hundreds of candidates", () => {
  const page = read("src/pages/PhenoHuntWorkspace.tsx");
  const keepers = read("src/pages/PhenoKeepersPage.tsx");
  const docs = read("src/components/PhenoDocumentationSections.tsx");

  it("candidate + keeper cards are memoized", () => {
    expect(page).toMatch(/const CandidateEditor = memo\(/);
    expect(keepers).toMatch(/const KeeperCard = memo\(/);
  });
  it("workspace paginates candidates and offers a filter", () => {
    expect(page).toMatch(/CANDIDATE_PAGE_SIZE/);
    expect(page).toMatch(/workspace-filter-text/);
    expect(page).toMatch(/workspace-show-more/);
  });
  it("keeper inputs are row-local (no page-level Record<id,value> keystroke maps)", () => {
    expect(keepers).not.toMatch(/setCloneLabels/);
    expect(keepers).not.toMatch(/setReversalMethods/);
  });
  it("per-candidate documentation supports collapsed lazy mount", () => {
    expect(docs).toMatch(/defaultOpen\?: boolean/);
    expect(page).toMatch(/defaultOpen=\{false\}/);
  });
});

describe("pheno scale — CSV export (breeder ask) is present and doctrine-safe", () => {
  const csv = read("src/lib/phenoHuntCsvExport.ts");
  it("exports a pure builder wired to the workspace", () => {
    expect(csv).toMatch(/export function buildPhenoHuntCsv/);
    expect(read("src/pages/PhenoHuntWorkspace.tsx")).toMatch(/workspace-export-csv/);
  });
  it("carries no AI / Action Queue / automation / secret in the new file", () => {
    for (const needle of ["action_queue", "aiDoctor", "openai", "service_role", "device"]) {
      expect(csv.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });
});

describe("pheno scale — DB posture migration", () => {
  const sql = read(
    "supabase/migrations/20260709180000_pheno_hunts_owner_only_and_stress_scale_index.sql",
  );
  it("drops operator cross-tenant policies on pheno_hunts (owner-only parity)", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Operators view all pheno_hunts"/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Operators update all pheno_hunts"/);
  });
  it("adds the missing stress-board composite index and reloads PostgREST", () => {
    expect(sql).toMatch(/ON public\.pheno_stress_observations \(hunt_id, created_at DESC\)/);
    expect(sql).toMatch(/NOTIFY pgrst/);
  });
  it("male-eval dedupe closes the hunt-null duplicate hole (file-only)", () => {
    const dedupe = read(
      "supabase/migrations/20260709190000_pheno_male_evaluations_dedupe_hunt_null.sql",
    );
    expect(dedupe).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}\(plant_id\)\s*WHERE hunt_id IS NULL/);
    expect(dedupe).toMatch(/NOT applied to the live project/i);
  });
});
