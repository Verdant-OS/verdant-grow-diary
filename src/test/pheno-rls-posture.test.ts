/**
 * C1 — Pheno RLS posture (Operator / Customer access contract).
 *
 * Encodes and locks the access model for the pheno-hunt tables, reading the
 * actual migration SQL (the same files applied to live knkw). The contract:
 *
 *  - Every pheno table has RLS ENABLED.
 *  - Reads and writes are OWNER-SCOPED (`auth.uid() = user_id`) — a customer
 *    only ever sees/creates/edits their own rows.
 *  - OPERATORS ARE EXCLUDED: no policy ON a pheno table uses
 *    `has_role(...,'operator')`, so breeding data (keepers, decisions, crosses,
 *    reversals, lab/smoke, sex/herm) is private even from operators — matching
 *    the grows/tents posture, NOT the plants one.
 *  - APPEND-ONLY logs (reversals, sex observations, keeper-decision log) grant
 *    the authenticated role SELECT+INSERT only — never UPDATE, DELETE, or ALL —
 *    and declare no UPDATE/DELETE policy.
 *  - No pheno table grants access to the `anon` role.
 *
 * IMPORTANT: this scans ALL migration files (not just *pheno*-named ones) and
 * scopes every negative assertion to statements that target a pheno table, so a
 * UUID-named migration that loosens a pheno table's RLS, adds operator access,
 * or grants anon/ALL still fails this guard. Pure text — no DB, no client.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIG_DIR = resolve(process.cwd(), "supabase/migrations");
// ALL migrations, not only *pheno*-named — a UUID-named file could touch pheno.
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(resolve(MIG_DIR, f), "utf8"))
  .join("\n");
const flat = allSql.replace(/\s+/g, " ");
// Pheno policy/grant statements are simple single-statement DDL (no internal
// `;`), so splitting on `;` isolates them cleanly for per-table scoping.
const statements = flat.split(";").map((s) => s.trim());

/** `\b` after the exact name so pheno_keeper_decisions ≠ pheno_keeper_decisions_log. */
function onTable(stmt: string, table: string): boolean {
  return new RegExp(`ON public\\.${table}\\b`, "i").test(stmt);
}
function policiesOn(table: string): string[] {
  return statements.filter((s) => /CREATE POLICY/i.test(s) && onTable(s, table));
}
function grantsToAuthenticatedOn(table: string): string[] {
  return statements.filter(
    (s) => /^GRANT\b/i.test(s) && onTable(s, table) && /TO authenticated\b/i.test(s),
  );
}
function grantsOn(table: string): string[] {
  return statements.filter((s) => /^GRANT\b/i.test(s) && onTable(s, table));
}

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

const APPEND_ONLY_TABLES = [
  "pheno_keeper_decisions_log",
  "pheno_sex_observations",
  "pheno_reversals",
] as const;

const ALL_TABLES = [...MUTABLE_TABLES, ...APPEND_ONLY_TABLES];

describe("every pheno table: RLS enabled (never disabled) + owner-scoped read/write", () => {
  for (const t of ALL_TABLES) {
    it(`${t}: RLS on, never disabled; SELECT/INSERT owner-scoped; NO permissive policy`, () => {
      expect(flat).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
      // A later DISABLE would remove RLS even though the ENABLE lingers — reject it.
      expect(flat).not.toMatch(
        new RegExp(`ALTER TABLE public\\.${t} DISABLE ROW LEVEL SECURITY`, "i"),
      );
      const policies = policiesOn(t);
      const ownerScoped = (kind: string) =>
        policies.some(
          (p) => new RegExp(`FOR ${kind}`, "i").test(p) && /auth\.uid\(\) = user_id/.test(p),
        );
      expect(ownerScoped("SELECT")).toBe(true);
      expect(ownerScoped("INSERT")).toBe(true);
      // Postgres OR-combines permissive policies, so a single broad policy
      // (e.g. FOR SELECT USING (true)) alongside the owner one exposes the
      // table. Require EVERY pheno policy to carry the owner gate and reject any
      // bare `true` USING/WITH CHECK.
      for (const p of policies) {
        expect(p).toMatch(/auth\.uid\(\) = user_id/);
        expect(p).not.toMatch(/(USING|WITH CHECK)\s*\(\s*true\s*\)/i);
      }
    });
  }
});

describe("OPERATORS are excluded from every pheno table (private breeding IP)", () => {
  for (const t of ALL_TABLES) {
    it(`${t}: no policy references has_role or the operator role`, () => {
      for (const p of policiesOn(t)) {
        expect(p).not.toMatch(/has_role/i);
        expect(p).not.toMatch(/'operator'/i);
      }
    });
  }
});

describe("no pheno table is exposed to the anon or PUBLIC role", () => {
  for (const t of ALL_TABLES) {
    it(`${t}: no grant reaches anon (anywhere in the grantee list) or PUBLIC`, () => {
      for (const g of grantsOn(t)) {
        // `TO authenticated, anon` and `TO PUBLIC` both expose the table to
        // unauthenticated callers — reject anon anywhere and a grant to the
        // PUBLIC role. (Match `TO PUBLIC`, NOT the `public.` schema qualifier.)
        expect(g).not.toMatch(/\banon\b/i);
        expect(g).not.toMatch(/\bTO\s+PUBLIC\b/i);
      }
    });
  }
});

describe("append-only logs are immutable (no UPDATE/DELETE/ALL)", () => {
  for (const t of APPEND_ONLY_TABLES) {
    it(`${t}: authenticated grant is SELECT+INSERT only; no update/delete policy`, () => {
      const grants = grantsToAuthenticatedOn(t);
      expect(grants.length).toBeGreaterThan(0);
      for (const g of grants) {
        // Reject UPDATE, DELETE, or ALL (ALL would implicitly allow both).
        expect(g).not.toMatch(/\b(UPDATE|DELETE|ALL)\b/i);
      }
      for (const p of policiesOn(t)) {
        expect(p).not.toMatch(/FOR UPDATE/i);
        expect(p).not.toMatch(/FOR DELETE/i);
      }
    });
  }
});

describe("mutable pheno tables keep OWNER-SCOPED full CRUD", () => {
  for (const t of MUTABLE_TABLES) {
    it(`${t}: UPDATE and DELETE policies exist and are owner-scoped`, () => {
      const policies = policiesOn(t);
      const ownerScoped = (kind: string) =>
        policies.some(
          (p) => new RegExp(`FOR ${kind}`, "i").test(p) && /auth\.uid\(\) = user_id/.test(p),
        );
      // Not just "an UPDATE policy exists" — it must be owner-scoped, so a
      // future USING (true) policy can't slip through.
      expect(ownerScoped("UPDATE")).toBe(true);
      expect(ownerScoped("DELETE")).toBe(true);
    });
  }
});
