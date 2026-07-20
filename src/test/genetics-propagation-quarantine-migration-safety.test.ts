/**
 * genetics-propagation-quarantine-migration-safety
 *
 * Static assertions over quarantine episodes + append-only transitions. Encodes
 * the adversarial-review clearance-bypass fixes:
 *   - release binds the negative to the episode's subject AND target (another
 *     plant's certificate cannot clear)
 *   - a superseded or contradicted/newer result cannot clear
 *   - clearance evidence must be collected after the last (re)open, same-day
 *     allowed, UTC-pinned
 *   - override forces closure_kind='override' (never 'cleared'); a table CHECK
 *     ties closure_kind='cleared' to a non-null screening result
 *   - transitions are row-locked (FOR UPDATE) with a legal-transition whitelist
 *   - dispose/override require substantive reasons; transition history is immutable
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720145000_genetics_traceability_quarantine.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("genetics quarantine migration safety", () => {
  const sql = read(MIGRATION);

  it("creates episodes + append-only transitions with RLS", () => {
    expect(sql).toMatch(/CREATE TABLE public\.quarantine_episodes/);
    expect(sql).toMatch(/CREATE TABLE public\.quarantine_transition_events/);
    expect(sql).toMatch(/ALTER TABLE public\.quarantine_episodes ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /ALTER TABLE public\.quarantine_transition_events ENABLE ROW LEVEL SECURITY/,
    );
    const grant = sql.match(
      /GRANT ([^;]*) ON public\.quarantine_transition_events TO authenticated/,
    );
    expect(grant![1].toUpperCase()).not.toMatch(/UPDATE|DELETE/);
  });

  it("ties closure_kind='cleared' to a non-null screening result (no laundered clearance)", () => {
    expect(sql).toMatch(
      /CHECK \(\s*\(closure_kind = 'cleared'\) = \(closure_screening_result_id IS NOT NULL\)\s*\)/,
    );
    expect(sql).toMatch(
      /status text NOT NULL[\s\S]*?CHECK \(status IN \('open', 'released', 'disposed'\)\)/,
    );
    expect(sql).toMatch(/closure_kind[\s\S]*?CHECK \(closure_kind IN \('cleared', 'disposed', 'override'\)\)/);
  });

  it("transition events constrain action, override flag, and reason substance", () => {
    expect(sql).toMatch(
      /action text NOT NULL[\s\S]*?CHECK \(action IN \('open', 'release', 'dispose', 'reopen', 'override'\)\)/,
    );
    // is_override is derived from the action.
    expect(sql).toMatch(/CHECK \(is_override = \(action = 'override'\)\)/);
    // dispose/override require substantive reasons.
    expect(sql).toMatch(
      /CHECK \(\s*action NOT IN \('dispose', 'override'\) OR \(reason IS NOT NULL AND length\(btrim\(reason\)\) >= 8\)\s*\)/,
    );
    // screening_result_id has a real FK (no dangling cross-tenant provenance).
    expect(sql).toMatch(
      /screening_result_id uuid REFERENCES public\.genetics_screening_results\(id\) ON DELETE SET NULL/,
    );
  });

  it("transition RPC row-locks the episode and enforces a legal-transition whitelist", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_quarantine_transition");
    expect(fnStart).toBeGreaterThan(-1);
    const body = sql.slice(fnStart);
    expect(body).toMatch(/FROM public\.quarantine_episodes[\s\S]*?FOR UPDATE/);
    expect(body).toMatch(/'illegal_transition'/);
  });

  it("release binds the negative to subject+target and rejects stale/contradicted evidence", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_quarantine_transition");
    const body = sql.slice(fnStart);
    // subject + target binding (not target+owner alone).
    expect(body).toMatch(/subject_type = ep\.subject_type AND subject_id = ep\.subject_id/);
    expect(body).toMatch(/'screening_subject_mismatch'/);
    expect(body).toMatch(/'screening_not_negative'/);
    // collected after the last (re)open, UTC-pinned, same-day allowed (>=).
    expect(body).toMatch(/AT TIME ZONE 'UTC'/);
    expect(body).toMatch(/'screening_not_after_open'/);
    // superseded or newer/equal contradicting evidence blocks clearance.
    expect(body).toMatch(/'screening_superseded'/);
    expect(body).toMatch(/'contradicting_or_newer_evidence'/);
  });

  it("override never renders cleared; dispose/reopen behave", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_quarantine_transition");
    const body = sql.slice(fnStart);
    // override forces closure_kind='override' with a null screening result.
    expect(body).toMatch(/'override'[\s\S]*?closure_kind/);
    expect(body).toMatch(/'override_reason_required'/);
    expect(body).toMatch(/'disposition_reason_required'/);
    // reopen sets a fresh effective-open so a stale negative cannot re-clear.
    expect(body).toMatch(/v_reopened := now\(\)/);
    expect(body).toMatch(/coalesce\(ep\.reopened_at, ep\.opened_at\)/);
  });

  it("open RPC checks subject ownership generically and normalizes target", () => {
    const fnStart = sql.indexOf("FUNCTION public.genetics_quarantine_open");
    const body = sql.slice(fnStart);
    expect(body).toMatch(/'subject_not_found'/);
    expect(body).toMatch(/lower\(btrim\(/);
    expect(body).toMatch(/uid uuid := auth\.uid\(\)/);
  });

  it("grants nothing to anon/public, revokes execute, no automation", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.quarantine_episodes TO anon/i);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.genetics_quarantine_transition[\s\S]*?FROM PUBLIC/,
    );
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|device_command|action_queue|mqtt/,
    );
  });
});
