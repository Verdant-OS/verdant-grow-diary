/**
 * Static safety for the irrigation boundary-hardening migration. Pins the NULL-
 * correct plant/tent boundary, the request-hash idempotency (over raw params,
 * compared in both the pre-check and the race handler), the pin-preserving
 * follow-on UPDATE (no 4-column INSERT, no DROP FUNCTION), and the stricter
 * typed-payload validation — all without introducing banned vocabulary.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION =
  "supabase/migrations/20260720160000_quicklog_save_event_irrigation_boundary_hardening.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("irrigation boundary-hardening migration safety", () => {
  it("uses CREATE OR REPLACE with the unchanged 12-arg signature and no DROP FUNCTION", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.quicklog_save_event\(/);
    // A DROP would hijack quicklog-typed-payloads-migration-safety's findMigration.
    expect(sql).not.toMatch(/DROP FUNCTION IF EXISTS public\.quicklog_save_event\(/);
    expect(sql).toMatch(/SECURITY\s+DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });

  it("adds the nullable request_hash column to the shared idempotency ledger", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.quicklog_idempotency ADD COLUMN IF NOT EXISTS request_hash text/,
    );
  });

  it("fixes the plant/tent boundary to be NULL-correct (untented plant + tent fails closed)", () => {
    expect(sql).toMatch(/p_tent_id IS DISTINCT FROM v_plant_tent[\s\S]{0,200}'plant_not_in_tent'/);
    expect(sql).not.toMatch(/v_plant_tent IS NOT NULL AND v_plant_tent <> p_tent_id/);
  });

  it("hashes the RAW request over every distinguishing param (incl. grow_id, occurred_at, photo_url)", () => {
    const hash = sql.match(/v_request_hash\s*:=\s*md5\(jsonb_build_object\(([\s\S]*?)\)::text\)/);
    expect(hash, "request hash computed").toBeTruthy();
    const body = hash![1];
    for (const key of [
      "'grow_id', p_grow_id",
      "'event_type', p_event_type",
      "'tent_id', p_tent_id",
      "'plant_id', p_plant_id",
      "'note', p_note",
      "'photo_url', p_photo_url",
      "'occurred_at', p_occurred_at",
      "'sensor_snapshot', p_sensor_snapshot",
      "'details', p_details",
      "'water', p_water",
      "'feed', p_feed",
    ]) {
      expect(body).toContain(key);
    }
    // Hashed over the raw param, never the resolved v_occurred/now().
    expect(hash![0]).not.toMatch(/v_occurred|now\(\)/);
  });

  it("rejects a same-key different-request in BOTH the pre-check and the race handler", () => {
    // Pre-check uses IF FOUND AND ... so the pinned duplicate IF FOUND THEN block is untouched.
    expect(sql).toMatch(/IF FOUND AND v_request_hash IS NOT NULL AND v_existing_hash IS NOT NULL AND v_existing_hash <> v_request_hash THEN/);
    expect((sql.match(/'idempotency_key_conflict'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Both the pre-check SELECT and the race re-read pull request_hash.
    expect((sql.match(/SELECT grow_event_id, request_hash INTO v_existing, v_existing_hash/g) ?? []).length).toBe(2);
  });

  it("sets the hash via a follow-on UPDATE, keeping the pinned 3-column INSERT", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.quicklog_idempotency \(user_id, idempotency_key, grow_event_id\)/,
    );
    expect(sql).toMatch(
      /UPDATE public\.quicklog_idempotency SET request_hash = v_request_hash\s*WHERE user_id = uid AND idempotency_key = p_idempotency_key/,
    );
    // No 4-column idempotency insert.
    expect(sql).not.toMatch(/INSERT INTO public\.quicklog_idempotency \(user_id, idempotency_key, grow_event_id, request_hash\)/);
  });

  it("adds stricter typed-payload validation under the single invalid_typed_payload code", () => {
    // Unexpected keys, product cap, sizes, ownership-spoof + secret-shaped details.
    expect(sql).toMatch(/jsonb_object_keys\(p_water\)[\s\S]{0,120}NOT IN/);
    expect(sql).toMatch(/jsonb_object_keys\(p_feed\)[\s\S]{0,160}NOT IN/);
    expect(sql).toMatch(/jsonb_array_length\(COALESCE\(p_feed->'products'[\s\S]{0,40}> 24/);
    expect(sql).toMatch(/length\(p_note\) > 500/);
    expect(sql).toMatch(/length\(p_details::text\) > 20000/);
    expect(sql).toMatch(/dk IN \('user_id','grow_id','tent_id','plant_id','auth_uid'/);
  });

  it("emits no new reason codes beyond invalid_typed_payload + idempotency_key_conflict", () => {
    const reasons = new Set(Array.from(sql.matchAll(/'reason', '([a-z_]+)'/g)).map((m) => m[1]));
    // Every reason code is either a pre-existing v2 code or one of the two new ones.
    const allowed = new Set([
      "not_authenticated", "invalid_idempotency_key", "invalid_event_type",
      "invalid_typed_payload", "grow_not_owned", "tent_not_in_grow",
      "plant_not_in_grow", "plant_not_in_tent", "invalid_sensor_metric",
      "invalid_sensor_source", "invalid_sensor_captured_at", "save_failed",
      "idempotency_key_conflict",
    ]);
    for (const r of reasons) expect(allowed.has(r), `unexpected reason ${r}`).toBe(true);
  });

  it("introduces no device-control / fake-live / alert / action-queue surface", () => {
    const body = sql.match(/\$function\$([\s\S]*?)\$function\$/)![1];
    expect(body).not.toMatch(/\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control)\b/i);
    expect(body).not.toMatch(/'live'|\bsynced\b|\bconnected\b/i);
    expect(body).not.toMatch(/\bpublic\.(alerts|action_queue|ai_doctor_sessions)\b/i);
    expect(body).not.toMatch(/\bSQLERRM\b/);
  });
});
