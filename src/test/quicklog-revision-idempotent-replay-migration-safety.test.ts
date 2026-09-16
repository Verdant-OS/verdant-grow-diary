import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static safety proof for Quick Log revision idempotent replay (#1460).
 * Reads migration SQL only — no database required.
 */
const MIGRATION = join(
  __dirname,
  "..",
  "..",
  "supabase/migrations/20260916111000_quicklog_revision_idempotent_replay.sql",
);
const SQL = readFileSync(MIGRATION, "utf8");

describe("Quick Log revision idempotent replay migration — static safety", () => {
  it("wraps in a transaction", () => {
    expect(SQL).toMatch(/BEGIN;/);
    expect(SQL).toMatch(/COMMIT;/);
  });

  it("creates a private idempotency receipt store with no client policies", () => {
    expect(SQL).toMatch(/CREATE TABLE public\.quicklog_revision_idempotency/);
    expect(SQL).toMatch(/PRIMARY KEY \(user_id, idempotency_key\)/);
    expect(SQL).toMatch(/CHECK \(char_length\(idempotency_key\) BETWEEN 8 AND 200\)/);
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(SQL).not.toMatch(/CREATE POLICY[\s\S]*quicklog_revision_idempotency/);
    expect(SQL).toMatch(
      /REVOKE ALL ON public\.quicklog_revision_idempotency FROM PUBLIC, anon, authenticated/,
    );
    expect(SQL).toMatch(/GRANT ALL ON public\.quicklog_revision_idempotency TO service_role/);
  });

  it("derives identity from auth.uid() and rejects short or missing keys", () => {
    expect(SQL).toMatch(/uid UUID := auth\.uid\(\)/);
    expect(SQL).toMatch(/'invalid_idempotency_key'/);
    expect(SQL).toMatch(/char_length\(p_idempotency_key\) NOT BETWEEN 8 AND 200/);
  });

  it("replays an exact request and rejects changed payload with idempotency_conflict", () => {
    expect(SQL).toMatch(/'idempotency_conflict'/);
    expect(SQL).toMatch(/v_prior\.request IS DISTINCT FROM v_request/);
    expect(SQL).toMatch(/jsonb_build_object\('reused', true\)/);
  });

  it("delegates to the existing unkeyed mutations without a client user id", () => {
    expect(SQL).not.toMatch(/p_user_id/i);
    expect(SQL).toMatch(/public\.quicklog_correct_entry\(\s*p_reason_code => p_reason_code/);
    expect(SQL).toMatch(/public\.quicklog_retract_entry\(\s*p_reason_code => p_reason_code/);
  });

  it("stores receipts only after a successful mutation", () => {
    expect(SQL).toMatch(/IF v_receipt ->> 'ok' = 'true' THEN/);
    expect(SQL).toMatch(
      /INSERT INTO public\.quicklog_revision_idempotency \(user_id, idempotency_key, request, receipt\)/,
    );
  });

  it("publishes keyed overloads with definer trust boundaries", () => {
    for (const fn of ["quicklog_correct_entry", "quicklog_retract_entry"]) {
      expect(SQL).toMatch(new RegExp(`CREATE FUNCTION public\\.${fn}\\(`));
      const idx = SQL.indexOf(`CREATE FUNCTION public.${fn}`);
      const body = SQL.slice(idx, idx + 600);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    }
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.quicklog_revision_apply_once/);
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_correct_entry\(TEXT, TEXT, JSONB, UUID, UUID, TEXT\)\s+TO authenticated, service_role/,
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_retract_entry\(TEXT, TEXT, UUID, UUID, TEXT\)\s+TO authenticated, service_role/,
    );
  });

  it("does not drop grower diary data or the original ledger", () => {
    expect(SQL).not.toMatch(/DELETE\s+FROM\s+public\.(diary_entries|grow_events)/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/TRUNCATE/i);
  });
});
