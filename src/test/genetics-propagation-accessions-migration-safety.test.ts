/**
 * genetics-propagation-accessions-migration-safety
 *
 * Static assertions over the accessions foundation migration: RLS enabled,
 * SELECT-own only for authenticated (all writes go through SECURITY DEFINER
 * RPCs, so there are NO client write policies), no anon/public grants, the
 * idempotency ledger is owner-scoped, provenance dates are NOT defaulted to
 * now(), and the write RPCs are search_path-pinned + revoked from PUBLIC.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720141000_genetics_traceability_accessions.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics accessions migration safety", () => {
  const sql = read(MIGRATION);

  it("creates both tables and enables row level security on each", () => {
    expect(sql).toMatch(/CREATE TABLE public\.genetics_accessions/);
    expect(sql).toMatch(/CREATE TABLE public\.genetics_mutation_idempotency/);
    expect(sql).toMatch(
      /ALTER TABLE public\.genetics_accessions ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.genetics_mutation_idempotency ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("grants authenticated SELECT only on both tables (writes go through RPCs)", () => {
    for (const t of ["genetics_accessions", "genetics_mutation_idempotency"]) {
      const grant = sql.match(
        new RegExp(`GRANT ([^;]*) ON public\\.${t} TO authenticated`),
      );
      expect(grant, `${t} authenticated grant present`).toBeTruthy();
      const cols = grant![1].toUpperCase();
      expect(cols).toMatch(/SELECT/);
      expect(cols).not.toMatch(/INSERT/);
      expect(cols).not.toMatch(/UPDATE/);
      expect(cols).not.toMatch(/DELETE/);
      expect(cols).not.toMatch(/\bALL\b/);
    }
  });

  it("has NO client write policies (no INSERT/UPDATE/DELETE policy, no USING(true))", () => {
    expect(sql).not.toMatch(/FOR INSERT/i);
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
    expect(sql).not.toMatch(/USING \(true\)/i);
    expect(sql).not.toMatch(/WITH CHECK \(true\)/i);
  });

  it("scopes SELECT to the owner on both tables", () => {
    expect(sql).toMatch(
      /genetics_accessions_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(sql).toMatch(
      /genetics_mutation_idempotency_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
  });

  it("grants nothing to anon or public", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.genetics_accessions TO anon/i);
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.genetics_accessions TO public/i,
    );
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.genetics_mutation_idempotency TO anon/i,
    );
  });

  it("never defaults provenance dates to now() (unknown stays explicit NULL)", () => {
    // The column definition is a plain nullable date — no NOT NULL, no DEFAULT.
    expect(sql).toMatch(/\n\s*acquisition_date date,\n/);
    // No same-line DEFAULT on the acquisition_date column definition.
    expect(sql).not.toMatch(/acquisition_date date[^\n]*DEFAULT/i);
  });

  it("models the explicit provenance CHECK sets (source_kind + known_state)", () => {
    expect(sql).toMatch(
      /source_kind[\s\S]*?CHECK \(source_kind IN \('seed', 'clone', 'tissue_culture', 'unknown'\)\)/,
    );
    expect(sql).toMatch(
      /known_state[\s\S]*?CHECK \(known_state IN \('known', 'unknown', 'unassigned', 'not_applicable'\)\)/,
    );
  });

  it("idempotency ledger is operation-namespaced, hashed, and stores the envelope", () => {
    expect(sql).toMatch(
      /CONSTRAINT genetics_mutation_idempotency_pkey PRIMARY KEY \(user_id, operation, idempotency_key\)/,
    );
    expect(sql).toMatch(/request_hash text NOT NULL/);
    expect(sql).toMatch(/result jsonb NOT NULL/);
  });

  it("distinguishes an idempotency replay from a domain unique violation", () => {
    // Only the named idempotency PK short-circuits to a replay; anything else re-raises.
    expect(sql).toMatch(/GET STACKED DIAGNOSTICS[\s\S]*?PG_EXCEPTION_CONSTRAINT/);
    expect(sql).toMatch(
      /v_constraint = 'genetics_mutation_idempotency_pkey'/,
    );
    expect(sql).toMatch(/'idempotency_key_conflict'/);
    // A bare re-raise guarantees a domain conflict is never laundered as reused.
    expect(sql).toMatch(/\n\s*RAISE;/);
  });

  it("write RPCs are SECURITY DEFINER, search_path-pinned, and derive identity from auth.uid()", () => {
    for (const fn of ["genetics_accession_upsert", "genetics_accession_archive"]) {
      const body = sql.match(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`,
        ),
      );
      expect(body, `${fn} defined`).toBeTruthy();
      const full = sql.slice(sql.indexOf(`FUNCTION public.${fn}`));
      expect(full).toMatch(/SECURITY DEFINER/);
      expect(full).toMatch(/SET search_path = public, pg_temp/);
      expect(body![1]).toMatch(/uid uuid := auth\.uid\(\)/);
      expect(body![1]).toMatch(/'not_authenticated'/);
    }
  });

  it("mutation RPCs enforce a NULL-safe 8..200 idempotency key and never trust client user_id", () => {
    // NULL-safe explicit bounds (a bare NOT BETWEEN would let a NULL key through).
    expect(sql).toMatch(
      /p_idempotency_key IS NULL OR length\(p_idempotency_key\) < 8 OR length\(p_idempotency_key\) > 200/,
    );
    // user_id is always set from uid, never read from the client payload.
    expect(sql).not.toMatch(/p_payload->>'user_id'/);
    expect(sql).not.toMatch(/p_payload->>'recorded_by'/);
  });

  it("revokes execute from PUBLIC and grants only authenticated + service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_accession_upsert[\s\S]*?FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.genetics_accession_upsert[\s\S]*?TO authenticated, service_role/,
    );
  });

  it("is suggest-only provenance: no device/automation/action-queue machinery", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
    expect(lower).not.toMatch(/delete\s+from\s+public\.plants/);
  });
});
