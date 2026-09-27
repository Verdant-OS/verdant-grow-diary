import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260927012000_quicklog_event_replay_active_receipt.sql"),
  "utf8",
);
const priorWrapper = readFileSync(
  resolve(root, "supabase/migrations/20260725024026_quicklog_dual_timestamp_foundation.sql"),
  "utf8",
);
const priorDelegate = readFileSync(
  resolve(root, "supabase/migrations/20260725023000_core_schema_forward_repair.sql"),
  "utf8",
);

function sourceHash(sql: string, marker: string): string {
  const text = sql.replace(/\r/g, "");
  const start = text.indexOf(marker);
  const open = text.indexOf("AS $function$", start);
  const close = text.indexOf("$function$;", open + 13);
  if (start < 0 || open < 0 || close < 0) throw new Error(`missing ${marker}`);
  return createHash("md5")
    .update(text.slice(open + 13, close))
    .digest("hex");
}

describe("Quick Log event replay active-receipt migration", () => {
  it("pins the exact previous public wrapper and private delegate before replacement", () => {
    const preflight = migration.split("CREATE OR REPLACE FUNCTION public.quicklog_save_event(")[0];
    expect(preflight).toContain(
      sourceHash(priorWrapper, "CREATE FUNCTION public.quicklog_save_event("),
    );
    expect(preflight).toContain(
      sourceHash(priorDelegate, "CREATE OR REPLACE FUNCTION public.quicklog_save_event("),
    );
    expect(preflight).toContain("quicklog_event_replay_preflight_unrecognized");
  });

  it("checks a locked, active event and diary mirror before either reuse path", () => {
    const eventLock = migration.indexOf("FOR UPDATE OF ge;");
    const eventRefusal = migration.indexOf("'idempotency_key_retracted'");
    const diaryLock = migration.indexOf("FOR UPDATE OF de;");
    const diaryRefusal = migration.indexOf("'idempotency_receipt_missing'");
    const legacyReuse = migration.indexOf("v_is_exact_legacy_retry :=");
    const delegateCall = migration.indexOf("v_result := public.quicklog_save_event_pre_logged_at(");
    expect(eventLock).toBeGreaterThan(-1);
    expect(eventRefusal).toBeGreaterThan(eventLock);
    expect(diaryLock).toBeGreaterThan(eventRefusal);
    expect(diaryRefusal).toBeGreaterThan(diaryLock);
    expect(legacyReuse).toBeGreaterThan(diaryRefusal);
    expect(delegateCall).toBeGreaterThan(legacyReuse);
    expect(migration).toMatch(/de\.retracted_at IS NULL/);
    expect(migration).toMatch(/de\.user_id = uid/);
    expect(migration).toMatch(/de\.grow_id = v_existing_grow_id/);
  });

  it("keeps the migration additive and the public execute grant scoped", () => {
    expect(migration).toMatch(/^--[\s\S]*?BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.quicklog_save_event(");
    expect(migration).not.toMatch(/\b(?:DROP FUNCTION|ALTER TABLE|CREATE POLICY)\b/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_event\([\s\S]*?FROM anon;/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_save_event\([\s\S]*?TO authenticated, service_role;/i,
    );
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]{0,180}TO anon\b/i);
  });
});
