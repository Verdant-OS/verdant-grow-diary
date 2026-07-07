/**
 * C1 — Pheno RLS posture (Operator / Customer access contract).
 *
 * Encodes and locks the access model for the pheno-hunt tables, reading the
 * actual migration SQL (the same files applied to live knkw). The contract:
 *
 *  - Every pheno table has RLS ENABLED.
 *  - Reads and writes are OWNER-SCOPED (`auth.uid() = user_id`) — a customer
 *    only ever sees/creates their own rows.
 *  - OPERATORS ARE EXCLUDED: no pheno policy uses `has_role(...,'operator')`,
 *    so breeding data (keepers, decisions, crosses, reversals, lab/smoke,
 *    sex/herm) is private even from operators — matching the grows/tents
 *    posture, NOT the plants one. Sensitive breeding IP stays with the grower.
 *  - APPEND-ONLY logs (reversals, sex observations, keeper-decision log) grant
 *    only SELECT+INSERT and declare no UPDATE/DELETE policy.
 *  - No pheno table grants access to the `anon` role.
 *
 * Pure text assertions over the migration files — no DB, no client. If the
 * access model is ever loosened, this fails.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIG_DIR = resolve(process.cwd(), "supabase/migrations");
const phenoFiles = readdirSync(MIG_DIR)
  .filter((f) => /pheno/i.test(f) && f.endsWith(".sql"))
  .sort();
const phenoSql = phenoFiles.map((f) => readFileSync(resolve(MIG_DIR, f), "utf8")).join("\n");
/** Whitespace-collapsed so multi-line policy clauses match reliably. */
const flat = phenoSql.replace(/\s+/g, " ");

/** Owner-scoped tables with full CRUD policies. */
const MUTABLE_TABLES = [
  "pheno_candidate_scores",
  "pheno_keeper_decisions",
  "pheno_keepers",
  "pheno_score_rounds",
  "pheno_smoke_tests",
  "pheno_lab_results",
  "pheno_keeper_clones",
  "pheno_crosses",
] as const;

/** Append-only logs: SELECT + INSERT only. */
const APPEND_ONLY_TABLES = [
  "pheno_keeper_decisions_log",
  "pheno_sex_observations",
  "pheno_reversals",
] as const;

const ALL_TABLES = [...MUTABLE_TABLES, ...APPEND_ONLY_TABLES];

describe("pheno RLS posture — the 11 new tables cover their own migrations", () => {
  it("sanity: found the pheno migration files", () => {
    expect(phenoFiles.length).toBeGreaterThanOrEqual(11);
  });
});

describe("every pheno table enables RLS and is owner-scoped", () => {
  for (const t of ALL_TABLES) {
    it(`${t}: RLS enabled + owner-scoped SELECT and INSERT`, () => {
      expect(flat).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
      // Owner-scoped read: only the row's owner.
      expect(flat).toMatch(
        new RegExp(
          `CREATE POLICY[^;]*ON public\\.${t} FOR SELECT[^;]*auth\\.uid\\(\\) = user_id`,
          "i",
        ),
      );
      // Owner-scoped insert.
      expect(flat).toMatch(
        new RegExp(
          `CREATE POLICY[^;]*ON public\\.${t} FOR INSERT[^;]*auth\\.uid\\(\\) = user_id`,
          "i",
        ),
      );
    });
  }
});

describe("OPERATORS are excluded from all pheno data (private breeding IP)", () => {
  it("no pheno policy references has_role or the operator role", () => {
    expect(flat).not.toMatch(/has_role/i);
    expect(flat).not.toMatch(/'operator'/i);
  });
});

describe("no pheno table is exposed to the anon role", () => {
  it("there are no GRANT … TO anon statements in pheno migrations", () => {
    expect(flat).not.toMatch(/GRANT[^;]*TO anon/i);
  });
});

describe("append-only logs cannot be updated or deleted", () => {
  for (const t of APPEND_ONLY_TABLES) {
    it(`${t}: SELECT+INSERT grant only, no UPDATE/DELETE grant or policy`, () => {
      expect(flat).toMatch(new RegExp(`GRANT SELECT, INSERT ON public\\.${t} TO authenticated`));
      expect(flat).not.toMatch(
        new RegExp(`GRANT[^;]*(UPDATE|DELETE)[^;]*ON public\\.${t} TO authenticated`),
      );
      expect(flat).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${t} FOR UPDATE`, "i"));
      expect(flat).not.toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${t} FOR DELETE`, "i"));
    });
  }
});

describe("mutable pheno tables keep full owner-scoped CRUD", () => {
  for (const t of MUTABLE_TABLES) {
    it(`${t}: has UPDATE + DELETE policies (owner-scoped)`, () => {
      expect(flat).toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${t} FOR UPDATE`, "i"));
      expect(flat).toMatch(
        new RegExp(
          `CREATE POLICY[^;]*ON public\\.${t} FOR DELETE[^;]*auth\\.uid\\(\\) = user_id`,
          "i",
        ),
      );
    });
  }
});
