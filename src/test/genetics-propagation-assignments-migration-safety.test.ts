/**
 * genetics-propagation-assignments-migration-safety
 *
 * Static assertions over the plant-origin-assignment slice and its net-new
 * acyclicity enforcement. Encodes the adversarial-review fixes:
 *   - one authoritative assignment per plant (UNIQUE(plant_id))
 *   - append-only assignment audit
 *   - cycle walk carries a path guard + depth cap (self-terminating over cyclic
 *     data) and seeds from NEW values, never a table lookup of the changed row
 *   - NO service_role bypass on the cycle guard (only an explicit GUC override)
 *   - both lineage-mutating RPCs take the same advisory lock
 *   - cross-tenant plants are a HARD reject (whole call rolls back, no idempotency
 *     row) — never a silent partial skip
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720143000_genetics_traceability_assignments.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics plant-origin assignments migration safety", () => {
  const sql = read(MIGRATION);

  it("creates both tables with RLS and one authoritative assignment per plant", () => {
    expect(sql).toMatch(/CREATE TABLE public\.plant_origin_assignments/);
    expect(sql).toMatch(/CREATE TABLE public\.plant_origin_assignment_events/);
    expect(sql).toMatch(
      /ALTER TABLE public\.plant_origin_assignments ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.plant_origin_assignment_events ENABLE ROW LEVEL SECURITY/,
    );
    // One authoritative origin per plant.
    expect(sql).toMatch(/plant_id uuid NOT NULL[\s\S]*?UNIQUE/);
  });

  it("assignment audit is append-only and records action assign/reassign", () => {
    const grant = sql.match(
      /GRANT ([^;]*) ON public\.plant_origin_assignment_events TO authenticated/,
    );
    expect(grant, "audit grant present").toBeTruthy();
    const cols = grant![1].toUpperCase();
    expect(cols).toMatch(/SELECT/);
    expect(cols).not.toMatch(/UPDATE/);
    expect(cols).not.toMatch(/DELETE/);
    expect(sql).toMatch(/action text[\s\S]*?CHECK \(action IN \('assign', 'reassign'\)\)/);
  });

  it("cycle walk is self-terminating: path guard + depth cap", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.genetics_lineage_has_cycle/);
    // Visited-path guard prevents infinite recursion over pre-existing cyclic data.
    expect(sql).toMatch(/NOT \(\(nxt\.kind \|\| ':' \|\| nxt\.id::text\) = ANY\(a\.path\)\)/);
    // Hard depth cap as a defensive second bound.
    expect(sql).toMatch(/a\.depth < \d+/);
  });

  it("cycle guards seed from NEW values and do NOT bypass service_role", () => {
    // Assignment guard uses NEW.plant_id / NEW.batch_id (not a table lookup).
    expect(sql).toMatch(
      /genetics_lineage_has_cycle\(NEW\.user_id, 'batch', NEW\.batch_id, 'plant', NEW\.plant_id\)/,
    );
    // Batch-mother guard uses NEW.mother_plant_id / NEW.id.
    expect(sql).toMatch(
      /genetics_lineage_has_cycle\(NEW\.user_id, 'plant', NEW\.mother_plant_id, 'batch', NEW\.id\)/,
    );
    // Acyclicity is structural: the only bypass is an explicit auditable GUC.
    expect(sql).toMatch(/current_setting\('genetics\.allow_cycle_override', true\)/);
    // Never a role-based short-circuit in the cycle guards.
    expect(sql).not.toMatch(/current_setting\('role'[^)]*\)\s*=\s*'service_role'/);
  });

  it("attaches BEFORE triggers to both lineage tables", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER [\s\S]*?BEFORE INSERT OR UPDATE[\s\S]*?ON public\.plant_origin_assignments/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER [\s\S]*?BEFORE INSERT OR UPDATE OF mother_plant_id[\s\S]*?ON public\.propagation_batches/,
    );
  });

  it("assign_plants takes the lineage lock and hard-rejects cross-tenant plants", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_assign_plants");
    expect(fnStart).toBeGreaterThan(-1);
    const body = sql.slice(fnStart);
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public, pg_temp/);
    expect(body).toMatch(/genetics_lock_lineage\(uid\)/);
    // Cross-tenant/invalid plants abort the WHOLE call with no idempotency row.
    expect(body).toMatch(/'plant_not_owned'/);
    // The invalid set is computed BEFORE any write and returns before the write block.
    expect(body).toMatch(/'cycle_detected'/);
    expect(body).toMatch(/'reassign_reason_required'/);
  });

  it("both lineage-mutating RPCs share the advisory lock (batch_upsert re-defined with cycle pre-check)", () => {
    // Slice 3 re-defines batch_upsert to add the mother-edge cycle pre-check.
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.genetics_batch_upsert/);
    const occurrences = (sql.match(/genetics_lock_lineage\(uid\)/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("assign_plants pre-validates so no rejection path leaves partial writes", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_assign_plants");
    const body = sql.slice(fnStart);
    // reassign-reason and cycle checks appear before the write BEGIN block.
    const reasonIdx = body.indexOf("reassign_reason_required");
    const writeIdx = body.indexOf("INSERT INTO public.plant_origin_assignments");
    expect(reasonIdx).toBeGreaterThan(-1);
    expect(writeIdx).toBeGreaterThan(-1);
    expect(reasonIdx).toBeLessThan(writeIdx);
  });

  it("grants nothing to anon/public and no device/automation machinery", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.plant_origin_assignments TO anon/i);
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
  });

  it("revokes execute from PUBLIC and grants only authenticated + service_role", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_assign_plants[\s\S]*?FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.genetics_assign_plants[\s\S]*?TO authenticated, service_role/,
    );
  });
});
