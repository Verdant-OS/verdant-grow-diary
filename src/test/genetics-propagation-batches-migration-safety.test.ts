/**
 * genetics-propagation-batches-migration-safety
 *
 * Static assertions over the propagation-batches foundation: RLS + SELECT-own,
 * append-only status history, counts that are never defaulted to zero and dates
 * never defaulted to now(), an owner-unique batch_code, and a batch-upsert RPC
 * that takes the shared lineage advisory lock, validates every referenced id
 * against auth.uid(), and pre-checks batch_code (never launders a domain unique
 * violation through the idempotency handler).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720142000_genetics_traceability_batches.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics propagation batches migration safety", () => {
  const sql = read(MIGRATION);

  it("creates both tables and enables RLS on each", () => {
    expect(sql).toMatch(/CREATE TABLE public\.propagation_batches/);
    expect(sql).toMatch(/CREATE TABLE public\.propagation_batch_status_events/);
    expect(sql).toMatch(
      /ALTER TABLE public\.propagation_batches ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.propagation_batch_status_events ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("grants authenticated SELECT only (writes via RPC); status events are append-only", () => {
    for (const t of ["propagation_batches", "propagation_batch_status_events"]) {
      const grant = sql.match(
        new RegExp(`GRANT ([^;]*) ON public\\.${t} TO authenticated`),
      );
      expect(grant, `${t} grant present`).toBeTruthy();
      const cols = grant![1].toUpperCase();
      expect(cols).toMatch(/SELECT/);
      expect(cols).not.toMatch(/INSERT/);
      expect(cols).not.toMatch(/UPDATE/);
      expect(cols).not.toMatch(/DELETE/);
      expect(cols).not.toMatch(/\bALL\b/);
    }
  });

  it("has no client write policies and no USING(true)", () => {
    expect(sql).not.toMatch(/FOR INSERT/i);
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
    expect(sql).not.toMatch(/USING \(true\)/i);
    expect(sql).not.toMatch(/WITH CHECK \(true\)/i);
  });

  it("scopes SELECT to owner on both tables and grants nothing to anon/public", () => {
    expect(sql).toMatch(
      /propagation_batches_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.propagation_batches TO anon/i);
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.propagation_batch_status_events TO public/i,
    );
  });

  it("never defaults counts to zero or dates to now() (unknown stays explicit)", () => {
    for (const d of ["cut_date", "received_date", "started_date", "rooted_date"]) {
      expect(sql).toMatch(new RegExp(`\\n\\s*${d} date,\\n`));
      expect(sql).not.toMatch(new RegExp(`${d} date[^\\n]*DEFAULT`, "i"));
    }
    // Counts are plain nullable ints (no DEFAULT 0), with explicit counts_unknown.
    expect(sql).not.toMatch(/initial_quantity int[^\n]*DEFAULT 0/i);
    expect(sql).not.toMatch(/viable_quantity int[^\n]*DEFAULT 0/i);
    expect(sql).toMatch(/counts_unknown boolean NOT NULL DEFAULT false/);
  });

  it("guards counts with CHECKs (non-negative, viable <= initial)", () => {
    expect(sql).toMatch(/initial_quantity[\s\S]*?CHECK \(initial_quantity >= 0\)/);
    expect(sql).toMatch(
      /CHECK \(\s*viable_quantity IS NULL OR initial_quantity IS NULL OR viable_quantity <= initial_quantity\s*\)/,
    );
  });

  it("constrains propagation_method and status vocabularies", () => {
    expect(sql).toMatch(/propagation_method[\s\S]*?CHECK \(propagation_method IN \(/);
    expect(sql).toMatch(/status[\s\S]*?CHECK \(status IN \(/);
  });

  it("enforces an owner-unique batch_code via a named constraint", () => {
    expect(sql).toMatch(
      /CONSTRAINT propagation_batches_user_batch_code_key UNIQUE \(user_id, batch_code\)/,
    );
  });

  it("defines the shared lineage advisory-lock helper used by lineage RPCs", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.genetics_lock_lineage/,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock\(hashtext\('genetics_lineage:' \|\| p_owner::text\)\)/,
    );
  });

  it("batch upsert RPC takes the lineage lock, is search_path-pinned, and derives auth.uid()", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_batch_upsert");
    expect(fnStart, "genetics_batch_upsert defined").toBeGreaterThan(-1);
    const body = sql.slice(fnStart);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
    expect(body).toMatch(/uid uuid := auth\.uid\(\)/);
    // Lock is taken (R7): both lineage-mutating RPCs must serialize on the same key.
    expect(body).toMatch(/genetics_lock_lineage\(uid\)/);
  });

  it("validates every referenced id against the caller and pre-checks batch_code", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_batch_upsert");
    const body = sql.slice(fnStart);
    // Ownership re-checks for each optional reference.
    for (const ref of ["source_accession", "mother_plant", "grow", "tent"]) {
      expect(body).toMatch(new RegExp(`${ref}[\\s\\S]*?user_id = uid`));
    }
    // batch_code uniqueness is pre-checked, not left to a laundered unique_violation.
    expect(body).toMatch(/'batch_code_exists'/);
    // Client user_id is never trusted.
    expect(sql).not.toMatch(/p_payload->>'user_id'/);
  });

  it("writes an append-only status event and hardens idempotency", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_batch_upsert");
    const body = sql.slice(fnStart);
    expect(body).toMatch(/INSERT INTO public\.propagation_batch_status_events/);
    expect(body).toMatch(/GET STACKED DIAGNOSTICS[\s\S]*?PG_EXCEPTION_CONSTRAINT/);
    expect(body).toMatch(/genetics_mutation_idempotency_pkey/);
  });

  it("revokes execute from PUBLIC and grants only authenticated + service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_batch_upsert[\s\S]*?FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.genetics_batch_upsert[\s\S]*?TO authenticated, service_role/,
    );
  });

  it("is suggest-only provenance: no device/automation/action-queue machinery", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
  });
});
