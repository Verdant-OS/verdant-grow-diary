/**
 * genetics-propagation-trace-resolver-migration-safety
 *
 * Static assertions over the bidirectional trace resolver + evidence rollup.
 * Encodes the review's determinism / honesty / isolation fixes:
 *   - seed ownership gate first (generic not_found); every edge filters user_id
 *     on BOTH endpoints
 *   - node identity is (kind, id); DISTINCT ON prefix matches the ORDER BY so it
 *     compiles AND is deterministic on diamonds
 *   - traversal is path-guarded + depth-capped + statement_timeout-bounded
 *   - truncated reflects BOTH the node cap and the depth frontier
 *   - evidence rollup is worst-wins and NEVER renders untested/inconclusive/
 *     superseded as negative or clean
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720146000_genetics_traceability_trace_resolver.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics trace resolver migration safety", () => {
  const sql = read(MIGRATION);

  it("defines both functions as SECURITY DEFINER + search_path-pinned", () => {
    for (const fn of ["genetics_subject_evidence", "genetics_trace_resolve"]) {
      const i = sql.indexOf(`FUNCTION public.${fn}`);
      expect(i, `${fn} defined`).toBeGreaterThan(-1);
      const body = sql.slice(i, i + 4000);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = public, pg_temp/);
    }
  });

  it("gates the seed by ownership and returns a generic not_found", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_trace_resolve"));
    expect(body).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(body).toMatch(/'not_found'/);
    expect(body).toMatch(/'invalid_direction'/);
  });

  it("filters user_id on BOTH endpoints of every legacy edge join", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_trace_resolve"));
    // Each JOIN to a far endpoint re-asserts ownership.
    expect(body).toMatch(/JOIN public\.plants p ON p\.id = [a-z_.]+ AND p\.user_id = uid/);
    expect(body).toMatch(/JOIN public\.pheno_keepers k ON k\.id = [a-z_.]+ AND k\.user_id = uid/);
    expect(body).toMatch(/JOIN public\.genetics_accessions a ON a\.id = [a-z_.]+ AND a\.user_id = uid/);
  });

  it("is deterministic: (kind,id) node identity with a matching DISTINCT ON prefix", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_trace_resolve"));
    expect(body).toMatch(/DISTINCT ON \(kind, id\)/);
    // DISTINCT ON list must be a prefix of ORDER BY (else it does not compile).
    expect(body).toMatch(/ORDER BY kind, id, depth ASC/);
  });

  it("bounds the recursion: path guard, depth cap, statement_timeout", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_trace_resolve"));
    expect(body).toMatch(/NOT \(\(w\.dst_kind \|\| ':' \|\| w\.dst_id::text\) = ANY\(t\.path\)\)/);
    expect(body).toMatch(/t\.depth < v_depth/);
    expect(body).toMatch(/set_config\('statement_timeout'/);
  });

  it("truncated reflects BOTH the node cap and the depth frontier", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_trace_resolve"));
    // node-count cap contributes to truncated
    expect(body).toMatch(/> v_cap/);
    // depth-frontier: a node at max depth with an unexplored outgoing edge
    expect(body).toMatch(/c\.depth = v_depth/);
    expect(body).toMatch(/v_truncated/);
  });

  it("evidence rollup is worst-wins and never renders clean/negative from gaps", () => {
    const body = sql.slice(sql.indexOf("FUNCTION public.genetics_subject_evidence"));
    // superseded rows excluded from 'current'.
    expect(body).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM public\.genetics_screening_results s2\s*WHERE s2\.supersedes_id = r\.id/,
    );
    // worst-wins ordering: positive, then inconclusive/not_tested, then negative_scoped, else untested.
    expect(body).toMatch(/'positive'[\s\S]*?'inconclusive'[\s\S]*?'negative_scoped'[\s\S]*?'untested'/);
    // never a "clean"/"pathogen_free" state.
    expect(body).not.toMatch(/pathogen_free|'clean'|'healthy'|'cleared'/i);
  });

  it("grants trace to authenticated, revokes from PUBLIC, no automation", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_trace_resolve[\s\S]*?FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.genetics_trace_resolve[\s\S]*?TO authenticated, service_role/,
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
  });
});
