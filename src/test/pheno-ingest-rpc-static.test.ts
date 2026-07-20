/**
 * Static trust-boundary invariants for public.pheno_ingest (read-only analysis).
 * Mirrors the quicklog_save_manual static suite: auth.uid() trust, entitlement
 * gating, idempotency, atomic block, dual-write, safe grants — no live DB.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findSql(): string {
  if (!existsSync(MIG_DIR)) return "";
  for (const n of readdirSync(MIG_DIR)) {
    const sql = readFileSync(join(MIG_DIR, n), "utf8");
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.pheno_ingest/i.test(sql)) return sql;
  }
  return "";
}
const sql = findSql();

describe("pheno_ingest — trust boundary", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/i);
  });

  it("auth.uid() is the sole trust anchor and null is rejected", () => {
    expect(sql).toMatch(/uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
    expect(sql).toMatch(/uid\s+IS\s+NULL[\s\S]{0,80}'not_authenticated'/i);
  });

  it("gates on BOTH the top-tier and Pheno Hunt Premium entitlements", () => {
    expect(sql).toMatch(/NOT\s+public\.has_phenoid_entitlement\(uid\)[\s\S]{0,80}'phenoid_tier_required'/i);
    expect(sql).toMatch(/NOT\s+public\.has_pheno_tracker_entitlement\(uid\)[\s\S]{0,80}'pheno_tracker_required'/i);
  });

  it("validates the idempotency key and replays prior results", () => {
    expect(sql).toMatch(/length\(p_idempotency_key\)\s*<\s*8/i);
    expect(sql).toMatch(/FROM\s+public\.phenoid_ingest_idempotency[\s\S]{0,200}idempotency_key\s*=\s*p_idempotency_key/i);
    expect(sql).toMatch(/'reused',\s*true/i);
  });

  it("writes are atomic under one BEGIN/EXCEPTION block", () => {
    expect(sql).toMatch(/BEGIN[\s\S]*EXCEPTION[\s\S]*?WHEN\s+OTHERS\s+THEN[\s\S]{0,200}'ingest_failed'/i);
    // SQLSTATE only — never SQLERRM.
    expect(sql).toMatch(/'sqlstate',\s*SQLSTATE/i);
    expect(sql).not.toMatch(/\bSQLERRM\b/);
  });

  it("dual-writes: core pheno_* AND the gated phenoid_* add-on", () => {
    for (const t of [
      "public.plants",
      "public.pheno_score_rounds",
      "public.pheno_keeper_decisions",
      "public.phenoid_candidate_extras",
      "public.diary_entries",
    ]) {
      expect(sql, t).toMatch(new RegExp(`INSERT\\s+INTO\\s+${t.replace(".", "\\.")}`, "i"));
    }
  });

  it("all writes bind the uid local, never a client-supplied user_id", () => {
    expect(sql).not.toMatch(/p_user_id/i);
    // grow/tent/hunt/plant inserts lead with uid.
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.grows\s*\(user_id,[\s\S]{0,60}VALUES\s*\(uid/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.plants[\s\S]{0,200}VALUES\s*\n?\s*\(uid/i);
  });

  it("grants EXECUTE to authenticated only (revoked from PUBLIC, no anon)", () => {
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.pheno_ingest\(text,\s*jsonb\)\s+FROM\s+PUBLIC/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.pheno_ingest\(text,\s*jsonb\)\s+TO\s+authenticated/i);
    expect(sql).not.toMatch(/pheno_ingest[\s\S]{0,120}TO\s+anon\b/i);
  });

  it("evidence receipts are labeled manual/evidence-only — never automation/device-control", () => {
    expect(sql).toMatch(/'kind',\s*'pheno_evidence_receipt'/i);
    expect(sql).toMatch(/'device_control',\s*false/i);
    expect(sql).toMatch(/'action_queue_created',\s*false/i);
    expect(sql).not.toMatch(/\b(actuator|relay|pump|valve|mqtt_publish|setpoint)\b/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.action_queue\b/i);
  });
});
