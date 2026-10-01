// @source-scan-justified: pins the forward repair's preflight hashes, version order and branch structure as text; runtime replay, receipt and locking behaviour is proven by scripts/run-quicklog-event-replay-lock-pg15-harness.mjs on both history paths.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const migrationsDir = resolve(root, "supabase/migrations");
const FORWARD = "20261001140000_quicklog_event_replay_mirrorless_legacy.sql";
const PRIOR = "20260927012000_quicklog_event_replay_active_receipt.sql";
const read = (name: string) =>
  readFileSync(resolve(migrationsDir, name), "utf8").replace(/\r/g, "");
const forward = read(FORWARD);
const prior = read(PRIOR);
const foundation = read("20260725024026_quicklog_dual_timestamp_foundation.sql");
const delegate = read("20260725023000_core_schema_forward_repair.sql");

function sourceHash(sql: string, marker: string): string {
  const start = sql.indexOf(marker);
  const open = sql.indexOf("AS $function$", start);
  const close = sql.indexOf("$function$;", open + 13);
  if (start < 0 || open < 0 || close < 0) throw new Error(`missing ${marker}`);
  return createHash("md5")
    .update(sql.slice(open + 13, close))
    .digest("hex");
}

describe("Quick Log event replay mirrorless-legacy forward repair", () => {
  it("is versioned after every migration recorded before it", () => {
    const version = FORWARD.slice(0, 14);
    const earlier = readdirSync(migrationsDir).filter(
      (name) => name.endsWith(".sql") && name !== FORWARD && name.slice(0, 14) < "20261001140000",
    );
    expect(earlier).toContain(PRIOR);
    expect(earlier).toContain("20260928183000_quicklog_manual_replay_metadata_lock.sql");
    for (const name of earlier) expect(name.slice(0, 14) < version).toBe(true);
    expect(PRIOR.slice(0, 14) < "20260928183000").toBe(true);
  });

  it("accepts either predecessor wrapper and the unchanged delegate, nothing else", () => {
    const preflight = forward.split("CREATE OR REPLACE FUNCTION public.quicklog_save_event(")[0];
    const foundationHash = sourceHash(foundation, "CREATE FUNCTION public.quicklog_save_event(");
    const priorHash = sourceHash(prior, "CREATE OR REPLACE FUNCTION public.quicklog_save_event(");
    const delegateHash = sourceHash(
      delegate,
      "CREATE OR REPLACE FUNCTION public.quicklog_save_event(",
    );
    expect(foundationHash).not.toBe(priorHash);
    expect(preflight).toContain(`'${foundationHash}'`);
    expect(preflight).toContain(`'${priorHash}'`);
    expect(preflight).toContain(`'${delegateHash}'`);
    expect(preflight.match(/'[0-9a-f]{32}'/g)).toHaveLength(3);
    expect(preflight).toContain("quicklog_event_replay_mirrorless_preflight_unrecognized");
  });

  it("refuses a missing companion only when the exact legacy request needed one", () => {
    const diaryCheck = forward.indexOf("PERFORM 1\n      FROM public.diary_entries AS de");
    const notFound = forward.indexOf("IF NOT FOUND THEN", diaryCheck);
    const mirrorless = forward.indexOf("v_is_mirrorless_legacy_retry :=", notFound);
    const legacyHash = forward.indexOf(
      "public.quicklog_event_request_hash_pre_logged_at(",
      mirrorless,
    );
    const guard = forward.indexOf("IF NOT v_is_mirrorless_legacy_retry THEN", legacyHash);
    const refusal = forward.indexOf("'idempotency_receipt_missing'", guard);
    expect(diaryCheck).toBeGreaterThan(forward.indexOf("'idempotency_key_retracted'"));
    for (const index of [notFound, mirrorless, legacyHash, guard, refusal])
      expect(index).toBeGreaterThan(-1);
    expect(forward.indexOf("'idempotency_receipt_missing'")).toBe(refusal);
    const predicate = forward.slice(legacyHash, guard);
    // The delegate's v_needs_diary inputs, mirrored term by term.
    expect(predicate).toContain("jsonb_typeof(p_sensor_snapshot->'metrics') = 'object'");
    expect(predicate).toContain("p_sensor_snapshot->'metrics' <> '{}'::jsonb");
    expect(predicate).toContain("(p_photo_url IS NOT NULL AND length(p_photo_url) > 0)");
    expect(predicate).toContain("p_details <> '{}'::jsonb");
    expect(predicate).toContain("OR p_water IS NOT NULL");
    expect(predicate).toContain("OR p_feed IS NOT NULL");
  });

  it("changes only the wrapper body and keeps the public execute grant scoped", () => {
    expect(forward).not.toMatch(/\b(?:DROP FUNCTION|ALTER TABLE|CREATE POLICY)\b/i);
    expect(forward.trimEnd()).toMatch(/COMMIT;$/);
    expect(forward).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_event\([\s\S]*?FROM anon;/i,
    );
    expect(forward).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_event\([\s\S]*?TO authenticated, service_role;/i,
    );
    expect(forward).not.toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]{0,180}TO anon\b/i);
    expect(forward).toContain("FOR UPDATE OF de SKIP LOCKED");
    expect(forward).not.toContain("FOR UPDATE OF de;");
  });
});
