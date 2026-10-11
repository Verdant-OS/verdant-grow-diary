/**
 * pheno-candidate-diary-topn-rpc-migration — SQL contract for
 * 20260826100000_pheno_candidate_diary_entries_top_n_rpc.sql, the server-side
 * top-N-per-plant diary evidence read that replaces the client's per-plant
 * query fan-out (#1144's deferred end-state).
 *
 * This is source-contract coverage in the same file-content style as the
 * repo's other migration tests (PGlite is not a repository dependency, so SQL
 * cannot be executed here). The behavioral half — a prolific candidate never
 * starving its siblings — is pinned by the PARTITION BY contract below plus
 * the client fixture test in pheno-candidate-diary-evidence-rpc.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_NAME = "20260826100000_pheno_candidate_diary_entries_top_n_rpc.sql";
const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const sql = readFileSync(resolve(MIGRATIONS_DIR, MIGRATION_NAME), "utf8").replace(/\r\n?/g, "\n");
/** Whitespace-normalized for multi-line clause pins. */
const flat = sql.replace(/\s+/g, " ");

describe("pheno_candidate_diary_entries_top_n — migration hygiene", () => {
  it("is one new additive migration with a unique timestamp", () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
    expect(names).toContain(MIGRATION_NAME);
    expect(names.filter((n) => n.startsWith("20260826100000_"))).toEqual([MIGRATION_NAME]);
  });

  it("creates the RPC only: no table, column, policy, or data change", () => {
    expect(sql).not.toMatch(/CREATE\s+TABLE/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)/i);
    // The only table it reads is diary_entries.
    const fromTables = [...flat.matchAll(/FROM public\.(\w+)/gi)].map((m) => m[1]);
    expect(fromTables).toEqual(["diary_entries"]);
  });
});

describe("pheno_candidate_diary_entries_top_n — RLS + privilege contract", () => {
  it("is SECURITY INVOKER (existing diary_entries RLS binds; never DEFINER)", () => {
    expect(sql).toMatch(/SECURITY INVOKER/);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/\nSTABLE\n/);
  });

  it("never accepts a client-supplied user id and never references service keys", () => {
    expect(sql).not.toMatch(/p_user_id/i);
    expect(sql.replace(/service_role/g, "")).not.toMatch(/service[_-]?key|secret/i);
  });

  it("grants EXECUTE to authenticated only; PUBLIC, anon, and service_role are revoked", () => {
    const fn = "public.pheno_candidate_diary_entries_top_n(uuid[], integer)";
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon;`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM service_role;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated;`);
    // Statement-anchored (comments legitimately discuss grants in prose).
    const grants = [...sql.matchAll(/^GRANT\b[^;]+?\bTO\s+(\w+);/gim)].map((m) => m[1]);
    expect(grants).toEqual(["authenticated"]);
  });
});

describe("pheno_candidate_diary_entries_top_n — top-N read contract", () => {
  it("returns exactly the six columns the client contract reads today", () => {
    expect(flat).toContain(
      "RETURNS TABLE ( id uuid, plant_id uuid, entry_at timestamptz, note text, photo_url text, details jsonb )",
    );
  });

  it("partitions per plant with the same ordering as the query it replaces", () => {
    // PARTITION BY plant_id is the anti-starvation contract: row numbering
    // restarts for every candidate, so a prolific sibling can never consume
    // another plant's budget. Ordering matches the client query verbatim:
    // entry_at DESC, id DESC.
    expect(flat).toContain(
      "row_number() OVER ( PARTITION BY d.plant_id ORDER BY d.entry_at DESC, d.id DESC ) AS rn",
    );
    expect(flat).toContain("WHERE r.rn <= v_limit");
  });

  it("excludes retracted entries server-side", () => {
    expect(flat).toContain("AND d.retracted_at IS NULL");
  });

  it("clamps the per-plant limit to a hard max of 40 (NULL → 40, floor 1)", () => {
    expect(flat).toContain("LEAST(GREATEST(COALESCE(p_limit_per_plant, 40), 1), 40)");
  });

  it("caps p_plant_ids at 100 and REJECTS oversized calls instead of clamping", () => {
    // Silently dropping plant ids would render those candidates as
    // evidence-free — the exact starvation defect this RPC exists to close —
    // so the overflow path must raise, never truncate.
    expect(flat).toContain("IF cardinality(p_plant_ids) > 100 THEN");
    expect(flat).toMatch(
      /RAISE EXCEPTION\s+'pheno_candidate_diary_entries_top_n: too many plant ids/,
    );
    expect(flat).toContain("USING ERRCODE = '22023'");
    expect(sql).not.toMatch(/p_plant_ids\s*\[\s*1\s*:\s*100\s*\]/);
  });

  it("returns an empty set (not an error) for NULL or empty plant ids", () => {
    expect(flat).toContain(
      "IF p_plant_ids IS NULL OR cardinality(p_plant_ids) = 0 THEN RETURN; END IF;",
    );
  });
});
