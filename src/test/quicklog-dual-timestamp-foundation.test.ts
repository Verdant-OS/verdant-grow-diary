import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATIONS = resolve(ROOT, "supabase/migrations");
const migrationName = readdirSync(MIGRATIONS).find((name) =>
  name.endsWith("_quicklog_dual_timestamp_foundation.sql"),
);
const sql = migrationName ? readFileSync(resolve(MIGRATIONS, migrationName), "utf8") : "";

function functionBody(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    sql.match(
      new RegExp(
        `CREATE\\s+FUNCTION\\s+public\\.${escaped}[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`,
        "i",
      ),
    )?.[1] ?? ""
  );
}

describe("Quick Log dual-timestamp migration identity", () => {
  it("is a single discoverable forward migration", () => {
    expect(migrationName).toMatch(/^\d{14}_quicklog_dual_timestamp_foundation\.sql$/);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
  });

  it("adds real logged_at columns without changing occurred fields", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.diary_entries[\s\S]{0,100}ADD COLUMN IF NOT EXISTS logged_at timestamptz/i,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.grow_events[\s\S]{0,100}ADD COLUMN IF NOT EXISTS logged_at timestamptz/i,
    );
    expect(sql).not.toMatch(
      /ALTER\s+(?:TABLE|COLUMN)[\s\S]{0,100}\b(?:occurred_at|entry_at)\b[\s\S]{0,100}(?:TYPE|DROP|RENAME)/i,
    );
  });

  it("fails closed before DDL when the core request_hash repair is absent", () => {
    const preflightAt = sql.indexOf("quicklog_dual_timestamp_requires_request_hash");
    const firstDdlAt = sql.indexOf("ALTER TABLE public.diary_entries");
    expect(preflightAt).toBeGreaterThan(-1);
    expect(preflightAt).toBeLessThan(firstDdlAt);
    expect(sql.slice(0, firstDdlAt)).toMatch(
      /information_schema\.columns[\s\S]*?table_name\s*=\s*'quicklog_idempotency'[\s\S]*?column_name\s*=\s*'request_hash'/i,
    );
  });
});

describe("Quick Log dual-timestamp legacy parsing", () => {
  it("uses exception-safe timestamp and UUID parsers", () => {
    const timestampParser = functionBody("quicklog_try_parse_logged_at");
    const uuidParser = functionBody("quicklog_try_parse_uuid");
    expect(timestampParser).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i);
    expect(timestampParser).toMatch(/RETURN\s+NULL/i);
    expect(timestampParser).toMatch(/pg_catalog\.isfinite/i);
    expect(uuidParser).toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i);
    expect(uuidParser).toMatch(/RETURN\s+NULL/i);
    expect(uuidParser).toMatch(/length\(p_value\)\s*<>\s*36/i);
  });

  it("never directly casts a JSON timestamp or mirror UUID", () => {
    expect(sql).not.toMatch(/details\s*->>\s*'logged_at'\s*\)\s*::\s*timestamptz/i);
    expect(sql).not.toMatch(
      /details\s*->>\s*'(?:linked_grow_event_id|grow_event_id)'\s*\)\s*::\s*uuid/i,
    );
  });

  it("accepts legacy diary capture only near created_at and otherwise uses created_at", () => {
    expect(sql).toMatch(
      /diary_capture_candidates[\s\S]*?quicklog_try_parse_logged_at\([\s\S]*?details->>'logged_at'[\s\S]*?legacy_logged_at BETWEEN[\s\S]*?created_at - interval '5 minutes'[\s\S]*?created_at \+ interval '5 minutes'[\s\S]*?ELSE dc\.created_at/i,
    );
    const diaryBackfill = sql.slice(
      sql.indexOf("WITH diary_capture_candidates"),
      sql.indexOf("ALTER TABLE public.grow_events DISABLE TRIGGER"),
    );
    expect(diaryBackfill).not.toMatch(/\bde\.entry_at\b/i);
  });
});

describe("Quick Log dual-timestamp mirror correlation", () => {
  it("requires same user and same grow before correlating mirrors", () => {
    expect(sql).toMatch(/de\.user_id\s*=\s*ge\.user_id/i);
    expect(sql).toMatch(/de\.grow_id\s*=\s*ge\.grow_id/i);
  });

  it("uses deterministic duplicate-mirror tie breaking", () => {
    expect(sql).toMatch(/row_number\(\)\s+OVER/i);
    expect(sql).toMatch(/PARTITION BY ge\.id/i);
    expect(sql).toMatch(
      /ORDER BY[\s\S]*?link\.key_priority ASC[\s\S]*?de\.entry_at ASC[\s\S]*?de\.id ASC/i,
    );
    expect(sql).toMatch(/WHERE mirror_rank = 1/i);
  });

  it("falls unmatched grow events back to created_at", () => {
    expect(sql).toMatch(
      /UPDATE public\.grow_events\s+SET logged_at = created_at\s+WHERE logged_at IS NULL/i,
    );
  });

  it("backfills without rewriting historical grow-event updated_at", () => {
    const disableAt = sql.indexOf(
      "ALTER TABLE public.grow_events DISABLE TRIGGER trg_validate_grow_event",
    );
    const firstGrowBackfillAt = sql.indexOf("UPDATE public.grow_events AS ge");
    const fallbackAt = sql.indexOf("SET logged_at = created_at");
    const enableAt = sql.indexOf(
      "ALTER TABLE public.grow_events ENABLE TRIGGER trg_validate_grow_event",
    );
    expect(disableAt).toBeGreaterThan(-1);
    expect(disableAt).toBeLessThan(firstGrowBackfillAt);
    expect(firstGrowBackfillAt).toBeLessThan(fallbackAt);
    expect(fallbackAt).toBeLessThan(enableAt);
  });
});

describe("Quick Log dual-timestamp write compatibility", () => {
  it("backstops untouched writers with protected INSERT triggers", () => {
    for (const triggerFunction of [
      "quicklog_stamp_diary_logged_at",
      "quicklog_stamp_grow_event_logged_at",
    ]) {
      const body = functionBody(triggerFunction);
      expect(body).toMatch(/NEW\.logged_at\s*:=\s*COALESCE/i);
      expect(sql).toMatch(
        new RegExp(
          `CREATE\\s+FUNCTION\\s+public\\.${triggerFunction}[\\s\\S]*?SECURITY\\s+DEFINER[\\s\\S]*?SET\\s+search_path\\s+TO\\s+'public'\\s*,\\s*'pg_temp'`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${triggerFunction}\\([^)]*\\)\\s+FROM\\s+PUBLIC`,
          "i",
        ),
      );
    }
    for (const triggerFunction of [
      "quicklog_stamp_diary_logged_at",
      "quicklog_stamp_grow_event_logged_at",
    ]) {
      const body = functionBody(triggerFunction);
      expect(body).toMatch(/current_setting\(\s*'verdant\.quicklog_logged_at'\s*,\s*true\s*\)/i);
      expect(body).toMatch(/pg_catalog\.clock_timestamp\(\)/i);
      expect(body).not.toMatch(/NEW\.(?:entry_at|occurred_at|created_at)/i);
      expect(body).not.toMatch(/NEW\.details/i);
      expect(body).not.toMatch(/NEW\.logged_at\s*,/i);
    }
  });

  it("retains the exact public RPC signatures through protected delegates", () => {
    expect(sql).toMatch(
      /ALTER FUNCTION public\.quicklog_save_event\([\s\S]*?\)\s+RENAME TO quicklog_save_event_pre_logged_at/i,
    );
    expect(sql).toMatch(
      /ALTER FUNCTION public\.quicklog_save_manual\([\s\S]*?\)\s+RENAME TO quicklog_save_manual_pre_logged_at/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_event_pre_logged_at\([\s\S]*?\) FROM authenticated/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_save_manual_pre_logged_at\([\s\S]*?\) FROM authenticated/i,
    );
  });

  it("preserves the manual RPC's non-object details validation contract", () => {
    const body = functionBody("quicklog_save_manual");
    expect(body).toMatch(
      /jsonb_typeof\(p_details\)\s*<>\s*'object'[\s\S]*?RETURN public\.quicklog_save_manual_pre_logged_at\([\s\S]*?p_details/i,
    );
  });

  it("recognizes exact pre-migration event hashes without weakening conflicts", () => {
    const body = functionBody("quicklog_save_event");
    expect(body).toMatch(
      /v_legacy_request_hash\s*:=\s*public\.quicklog_event_request_hash_pre_logged_at\([\s\S]*?p_details[\s\S]*?p_feed/i,
    );
    expect(body).toMatch(
      /v_is_exact_legacy_retry\s*:=[\s\S]*?v_existing_request_hash\s*=\s*v_legacy_request_hash[\s\S]*?IF v_is_exact_legacy_retry THEN[\s\S]*?'duplicate_reused'/i,
    );
    expect(body).toMatch(/ELSE[\s\S]*?quicklog_save_event_pre_logged_at\(/i);
    expect(sql).toMatch(
      /CREATE FUNCTION public\.quicklog_event_request_hash_pre_logged_at\([\s\S]*?'details'\s*,\s*p_details[\s\S]*?'feed'\s*,\s*p_feed/i,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.quicklog_event_request_hash_pre_logged_at\([\s\S]*?\) FROM authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.quicklog_event_request_hash_pre_logged_at\([\s\S]*?\) TO service_role/i,
    );
    const lookupAt = body.indexOf("SELECT qi.grow_event_id, ge.logged_at, qi.request_hash");
    const legacyRecognitionAt = body.indexOf("v_is_exact_legacy_retry :=");
    const capturedValidationAt = body.indexOf("p_details ? 'logged_at'");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeLessThan(legacyRecognitionAt);
    expect(legacyRecognitionAt).toBeLessThan(capturedValidationAt);
    expect(body).toMatch(/IF NOT v_is_exact_legacy_retry[\s\S]*?p_details \? 'logged_at'/i);
  });

  it("keeps raw non-object event details in validation and retry identity", () => {
    const body = functionBody("quicklog_save_event");
    const invalidKeyDelegateAt = body.indexOf("IF p_idempotency_key IS NULL");
    const legacyRecognitionAt = body.indexOf("v_is_exact_legacy_retry :=");
    const rawValidationAt = body.indexOf("length(p_details::text) > 20000");
    const fingerprintAt = body.indexOf("v_raw_details_fingerprint :=");
    const delegateAt = body.indexOf("v_result := public.quicklog_save_event_pre_logged_at(");

    expect(invalidKeyDelegateAt).toBeGreaterThan(-1);
    expect(invalidKeyDelegateAt).toBeLessThan(legacyRecognitionAt);
    expect(body).toMatch(
      /IF p_idempotency_key IS NULL[\s\S]*?NOT BETWEEN 8 AND 200[\s\S]*?RETURN public\.quicklog_save_event_pre_logged_at\([\s\S]*?p_details/i,
    );
    expect(legacyRecognitionAt).toBeGreaterThan(-1);
    expect(legacyRecognitionAt).toBeLessThan(rawValidationAt);
    expect(rawValidationAt).toBeLessThan(fingerprintAt);
    expect(fingerprintAt).toBeLessThan(delegateAt);
    expect(body).toMatch(
      /IF NOT v_is_exact_legacy_retry[\s\S]*?length\(p_details::text\) > 20000[\s\S]*?p_details::text[\s\S]*?sk_\(live\|test\)_[\s\S]*?jsonb_object_keys\(p_details\)[\s\S]*?'user_id'[\s\S]*?'auth\.uid'[\s\S]*?RETURN public\.quicklog_save_event_pre_logged_at\([\s\S]*?p_details/i,
    );
    expect(body).not.toMatch(
      /jsonb_typeof\(p_details\) = 'object'[\s\S]*?p_details \? '__verdant_request_details_hash_v1'[\s\S]*?'invalid_typed_payload'/i,
    );
    expect(body).toMatch(
      /v_raw_details_fingerprint\s*:=\s*pg_catalog\.md5\([\s\S]*?'is_sql_null'\s*,\s*p_details IS NULL[\s\S]*?'json_type'\s*,\s*jsonb_typeof\(p_details\)[\s\S]*?'value'\s*,\s*p_details/i,
    );
    expect(body).toMatch(
      /v_call_details\s*:=\s*jsonb_build_object\(\s*'__verdant_request_details_hash_v1'\s*,\s*v_raw_details_fingerprint\s*\)\s*\|\|\s*jsonb_build_object\('logged_at', v_logged_at\)/i,
    );
    expect(body).toMatch(
      /UPDATE public\.diary_entries[\s\S]*?details\s*=[\s\S]*?WHEN v_is_exact_legacy_retry[\s\S]*?THEN COALESCE\(de\.details[\s\S]*?ELSE[\s\S]*?jsonb_typeof\(p_details\) = 'object'[\s\S]*?THEN p_details[\s\S]*?-\s*'__verdant_request_details_hash_v1'[\s\S]*?jsonb_build_object\('logged_at', v_logged_at\)/i,
    );
    expect(body).toMatch(
      /AND\s*\(\s*NOT v_is_reused\s+OR de\.logged_at IS DISTINCT FROM v_logged_at/i,
    );
    expect(body).toMatch(
      /p_details \? '__verdant_request_details_hash_v1'[\s\S]*?de\.details->'__verdant_request_details_hash_v1'[\s\S]*?IS NOT DISTINCT FROM[\s\S]*?p_details->'__verdant_request_details_hash_v1'/i,
    );
    expect(body).toMatch(
      /jsonb_typeof\(p_details\) <> 'object'[\s\S]*?NOT \(\s*de\.details \? '__verdant_request_details_hash_v1'\s*\)/i,
    );
  });

  it("preserves manual reuse before validating changed retry details", () => {
    const body = functionBody("quicklog_save_manual");
    const lookupAt = body.indexOf("SELECT qi.grow_event_id, ge.logged_at");
    const capturedValidationAt = body.indexOf("p_details ? 'logged_at'");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeLessThan(capturedValidationAt);
    expect(body).toMatch(/IF v_existing_event_id IS NOT NULL THEN[\s\S]*?'duplicate_reused'/i);
  });
});

describe("Quick Log dual-timestamp RPC invariants", () => {
  for (const rpc of ["quicklog_save_event", "quicklog_save_manual"]) {
    it(`${rpc} validates and persists one canonical Captured timestamp`, () => {
      const body = functionBody(rpc);
      expect(body).toMatch(/quicklog_try_parse_logged_at\(p_details->>'logged_at'\)/i);
      expect(body).toMatch(/'invalid_logged_at'/i);
      expect(body).toMatch(/jsonb_build_object\('logged_at', v_logged_at\)/i);
      expect(body).toMatch(
        /SELECT ge\.grow_id[\s\S]*?ge\.logged_at IS NOT DISTINCT FROM v_logged_at/i,
      );
      expect(body).not.toMatch(/UPDATE public\.grow_events/i);
      expect(body).toMatch(
        /UPDATE public\.diary_entries[\s\S]*?SET logged_at = v_logged_at[\s\S]*?jsonb_build_object\('logged_at', v_logged_at\)/i,
      );
      expect(body).toMatch(
        /set_config\(\s*'verdant\.quicklog_logged_at'[\s\S]*?quicklog_save_(?:event|manual)_pre_logged_at/i,
      );
    });

    it(`${rpc} scopes mirror updates by caller and grow`, () => {
      const body = functionBody(rpc);
      expect(body).toMatch(/de\.user_id\s*=\s*uid/i);
      expect(body).toMatch(/de\.grow_id\s*=\s*v_grow_id/i);
      expect(body).toMatch(/quicklog_try_parse_uuid/i);
    });

    it(`${rpc} freezes retries under a per-user idempotency lock`, () => {
      const body = functionBody(rpc);
      expect(body).toMatch(/pg_catalog\.pg_advisory_xact_lock/i);
      expect(body).toMatch(/uid::text\s*\|\|\s*':'\s*\|\|/i);
      expect(body).toMatch(
        /qi\.user_id\s*=\s*uid[\s\S]*?qi\.idempotency_key\s*=\s*p_idempotency_key/i,
      );
    });

    it(`${rpc} is fixed-search-path SECURITY DEFINER and authenticated-only`, () => {
      expect(sql).toMatch(
        new RegExp(
          `CREATE\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]*?SECURITY\\s+DEFINER[\\s\\S]*?SET\\s+search_path\\s+TO\\s+'public'\\s*,\\s*'pg_temp'`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]{0,500}?FROM\\s+PUBLIC`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]{0,500}?FROM\\s+anon`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}[\\s\\S]{0,500}?TO\\s+authenticated`,
          "i",
        ),
      );
    });
  }
});

describe("Quick Log dual-timestamp scope fence", () => {
  it("does not touch AI, billing, device control, alerts, or action execution", () => {
    expect(sql).not.toMatch(
      /\b(ai_doctor|billing|paddle|stripe|device_control|mqtt|action_queue|alerts)\b/i,
    );
  });
});
