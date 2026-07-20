/**
 * genetics-propagation-screening-migration-safety
 *
 * Static assertions over the append-only screening evidence ledger. Screening
 * is pathogen evidence — deliberately NOT overloaded onto pheno_lab_results
 * (COA/chemistry). Encodes evidence-honesty + review fixes:
 *   - every result carries target + result + subject; result is one of
 *     positive/negative/inconclusive/not_tested (never a bare "clean")
 *   - immutable (append-only): correction is a NEW superseding row
 *   - target normalized at the write seam; collected_date bounded (<= today,
 *     <= result_date) so a future/backdated cert cannot be fabricated
 *   - recorded_by is forced to auth.uid(), never read from the payload
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720144000_genetics_traceability_screening.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics screening ledger migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the ledger with RLS and is append-only", () => {
    expect(sql).toMatch(/CREATE TABLE public\.genetics_screening_results/);
    expect(sql).toMatch(
      /ALTER TABLE public\.genetics_screening_results ENABLE ROW LEVEL SECURITY/,
    );
    const grant = sql.match(
      /GRANT ([^;]*) ON public\.genetics_screening_results TO authenticated/,
    );
    expect(grant).toBeTruthy();
    const cols = grant![1].toUpperCase();
    expect(cols).toMatch(/SELECT/);
    expect(cols).not.toMatch(/UPDATE/);
    expect(cols).not.toMatch(/DELETE/);
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
  });

  it("always models subject + target + a four-value result (never a bare clean)", () => {
    expect(sql).toMatch(
      /subject_type text NOT NULL[\s\S]*?CHECK \(subject_type IN \('accession', 'batch', 'plant'\)\)/,
    );
    expect(sql).toMatch(/subject_id uuid NOT NULL/);
    expect(sql).toMatch(/target text NOT NULL/);
    expect(sql).toMatch(
      /result text NOT NULL[\s\S]*?CHECK \(result IN \('positive', 'negative', 'inconclusive', 'not_tested'\)\)/,
    );
  });

  it("bounds dates so evidence cannot be fabricated in the future or out of order", () => {
    // result_date ordering is a table CHECK; future-date is enforced in the RPC
    // (current_date is not immutable, so it cannot live in a CHECK).
    expect(sql).toMatch(
      /CHECK \(\s*collected_date IS NULL OR result_date IS NULL OR collected_date <= result_date\s*\)/,
    );
    expect(sql).toMatch(/'collected_date_in_future'/);
  });

  it("keeps history immutable via a self-referential supersedes link", () => {
    expect(sql).toMatch(
      /supersedes_id uuid REFERENCES public\.genetics_screening_results\(id\) ON DELETE SET NULL/,
    );
  });

  it("indexes subject+target by collected_date for current-evidence lookups", () => {
    expect(sql).toMatch(
      /CREATE INDEX[\s\S]*?ON public\.genetics_screening_results \(subject_type, subject_id, target, collected_date DESC\)/,
    );
  });

  it("record RPC forces recorded_by = uid and normalizes the target", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_screening_record");
    expect(fnStart).toBeGreaterThan(-1);
    const body = sql.slice(fnStart);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
    expect(body).toMatch(/uid uuid := auth\.uid\(\)/);
    // recorded_by is never client-sourced.
    expect(sql).not.toMatch(/p_payload->>'recorded_by'/);
    expect(sql).not.toMatch(/p_payload->>'user_id'/);
    // target normalized at the write seam.
    expect(body).toMatch(/lower\(btrim\(/);
  });

  it("validates subject + supersedes ownership with an indistinguishable reason", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_screening_record");
    const body = sql.slice(fnStart);
    // Subject ownership re-checked per type; one generic not-found reason.
    expect(body).toMatch(/'subject_not_found'/);
    // A correction must target the SAME subject + target and be owned.
    expect(body).toMatch(/'supersedes_invalid'/);
    expect(body).toMatch(/GET STACKED DIAGNOSTICS[\s\S]*?PG_EXCEPTION_CONSTRAINT/);
  });

  it("grants nothing to anon/public, revokes execute from PUBLIC, no automation", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.genetics_screening_results TO anon/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_screening_record[\s\S]*?FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.genetics_screening_record[\s\S]*?TO authenticated, service_role/,
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
  });
});
