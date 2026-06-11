/**
 * Database-level trust-boundary guardrails for public.quicklog_save_event.
 *
 * quicklog_save_event is the atomic Quick Log write boundary and is
 * SECURITY DEFINER, so RLS is bypassed inside the function body. The real
 * trust boundary is therefore the SQL of the function itself: it MUST
 *
 *   - derive identity from auth.uid() (never from a client param)
 *   - resolve grow/tent/plant against rows owned by auth.uid()
 *   - reject cross-grow tent/plant attachment
 *   - reject cross-tent plant attachment
 *   - validate event_type against a trigger-aligned whitelist
 *   - validate sensor snapshot shape before any insert
 *   - scope idempotency by (user_id, idempotency_key)
 *   - emit only safe, short reason codes (no JWTs, secrets, SQL, payload
 *     dumps, or UUIDs) on the audit table
 *   - never relabel manual sensor snapshots as "live"
 *
 * These assertions read the migration SQL directly so a future migration
 * cannot silently regress the trust boundary. They are complementary to the
 * runtime harness at scripts/run-quicklog-save-event-rls-harness.ts which
 * proves the same properties end-to-end against a real Supabase project.
 *
 * Safety scope: read-only static analysis. No alerts, no action_queue, no
 * ai_doctor_sessions, no automation, no device-control surfaces touched.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findLatestRpcSql(): { path: string; sql: string } | null {
  if (!existsSync(MIG_DIR)) return null;
  const matches: { path: string; sql: string; name: string }[] = [];
  for (const name of readdirSync(MIG_DIR)) {
    const p = join(MIG_DIR, name);
    const sql = readFileSync(p, "utf8");
    if (
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_event\b/i.test(
        sql,
      )
    ) {
      matches.push({ path: p, sql, name });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches[matches.length - 1];
}

const mig = findLatestRpcSql();
const sql = mig?.sql ?? "";

// Isolate the function body so assertions don't accidentally match an
// unrelated migration block.
const bodyMatch = sql.match(
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_event[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
);
const body = bodyMatch?.[1] ?? "";

describe("quicklog_save_event — migration discoverable", () => {
  it("a migration defines public.quicklog_save_event", () => {
    expect(mig).not.toBeNull();
    expect(body.length).toBeGreaterThan(200);
  });
});

describe("quicklog_save_event — identity and authentication", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(
      /SET\s+search_path\s+TO\s+'public'\s*,\s*'pg_temp'/i,
    );
  });

  it("derives uid from auth.uid(), never from a client param", () => {
    expect(body).toMatch(/uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
    // Reject any client-supplied user_id parameter shapes.
    expect(sql).not.toMatch(/\bp_user_id\b/i);
    expect(sql).not.toMatch(/\b_user_id\s+uuid\b/i);
  });

  it("rejects unauthenticated callers with 'not_authenticated'", () => {
    expect(body).toMatch(
      /IF\s+uid\s+IS\s+NULL[\s\S]{0,200}'not_authenticated'/i,
    );
  });
});

describe("quicklog_save_event — ownership and cross-boundary attachment", () => {
  it("validates grow ownership against auth.uid() with 'grow_not_owned'", () => {
    expect(body).toMatch(
      /FROM\s+public\.grows\s+WHERE\s+id\s*=\s*p_grow_id\s+AND\s+user_id\s*=\s*uid[\s\S]{0,200}'grow_not_owned'/i,
    );
  });

  it("resolves tent by id AND user_id = uid (rejects User B's tent)", () => {
    expect(body).toMatch(
      /FROM\s+public\.tents[\s\S]{0,200}id\s*=\s*p_tent_id\s+AND\s+user_id\s*=\s*uid/i,
    );
  });

  it("rejects tent that does not belong to the selected grow with 'tent_not_in_grow'", () => {
    expect(body).toMatch(
      /v_tent_grow\s+IS\s+DISTINCT\s+FROM\s+p_grow_id[\s\S]{0,200}'tent_not_in_grow'/i,
    );
  });

  it("resolves plant by id AND user_id = uid (rejects User B's plant)", () => {
    expect(body).toMatch(
      /FROM\s+public\.plants\s+WHERE\s+id\s*=\s*p_plant_id\s+AND\s+user_id\s*=\s*uid/i,
    );
  });

  it("rejects plant that does not belong to the selected grow with 'plant_not_in_grow'", () => {
    expect(body).toMatch(
      /v_plant_grow\s+IS\s+DISTINCT\s+FROM\s+p_grow_id[\s\S]{0,200}'plant_not_in_grow'/i,
    );
  });

  it("rejects plant that does not belong to the selected tent with 'plant_not_in_tent'", () => {
    expect(body).toMatch(
      /v_plant_tent[\s\S]{0,80}<>\s*p_tent_id[\s\S]{0,200}'plant_not_in_tent'/i,
    );
  });

  it("all ownership/scope checks occur before the first INSERT into grow_events", () => {
    const firstEventInsert = body.search(
      /INSERT\s+INTO\s+public\.grow_events\s*\(\s*user_id/i,
    );
    expect(firstEventInsert).toBeGreaterThan(-1);
    for (const code of [
      "grow_not_owned",
      "tent_not_in_grow",
      "plant_not_in_grow",
      "plant_not_in_tent",
    ]) {
      const at = body.indexOf(`'${code}'`);
      expect(at, code).toBeGreaterThan(-1);
      expect(at, code).toBeLessThan(firstEventInsert);
    }
  });

  it("parent grow_events insert binds user_id to uid, not a client value", () => {
    expect(body).toMatch(
      /INSERT\s+INTO\s+public\.grow_events[\s\S]{0,300}VALUES\s*\(\s*uid\s*,/i,
    );
  });
});

describe("quicklog_save_event — event_type whitelist (trigger-aligned)", () => {
  it("rejects invalid event types before any insert with 'invalid_event_type'", () => {
    expect(body).toMatch(
      /p_event_type\s+NOT\s+IN[\s\S]{0,400}'invalid_event_type'/i,
    );
    const at = body.indexOf("'invalid_event_type'");
    const firstEventInsert = body.search(
      /INSERT\s+INTO\s+public\.grow_events\s*\(\s*user_id/i,
    );
    expect(at).toBeLessThan(firstEventInsert);
  });

  it("whitelist matches the validate_grow_event trigger exactly", () => {
    // The trigger accepts watering, feeding, training, observation, photo,
    // environment. 'note' is deliberately NOT here — client maps to
    // observation with p_details.kind='note'.
    const m = body.match(/p_event_type\s+NOT\s+IN\s*\(([^)]+)\)/i);
    expect(m).not.toBeNull();
    const list = (m?.[1] ?? "").toLowerCase();
    for (const ok of [
      "watering",
      "feeding",
      "training",
      "observation",
      "photo",
      "environment",
    ]) {
      expect(list).toContain(`'${ok}'`);
    }
    expect(list).not.toContain("'note'");
  });
});

describe("quicklog_save_event — sensor snapshot validation", () => {
  it("rejects non-numeric sensor metrics with 'invalid_sensor_metric'", () => {
    expect(body).toMatch(
      /jsonb_typeof\(v_val\)\s*<>\s*'number'[\s\S]{0,200}'invalid_sensor_metric'/i,
    );
  });

  it("requires a non-empty sensor source with 'invalid_sensor_source'", () => {
    expect(body).toMatch(
      /v_src\s+IS\s+NULL\s+OR\s+length\(btrim\(v_src\)\)\s*=\s*0[\s\S]{0,200}'invalid_sensor_source'/i,
    );
  });

  it("requires a parseable captured_at with 'invalid_sensor_captured_at'", () => {
    expect(body).toMatch(/PERFORM\s+v_cap::timestamptz/i);
    expect(body).toMatch(/'invalid_sensor_captured_at'/);
  });

  it("preserves source and captured_at verbatim into the diary payload", () => {
    expect(body).toMatch(
      /jsonb_build_object\(\s*'source'\s*,\s*v_src\s*,\s*'captured_at'\s*,\s*v_cap\s*,\s*'metrics'\s*,\s*v_metrics/i,
    );
  });

  it("never relabels manual sensor snapshots as 'live'", () => {
    expect(body).not.toMatch(/'live'/i);
    expect(body).not.toMatch(/\bsynced\b/i);
    expect(body).not.toMatch(/\bconnected\b/i);
  });

  it("snapshot validation runs before the grow_events insert", () => {
    const firstEventInsert = body.search(
      /INSERT\s+INTO\s+public\.grow_events\s*\(\s*user_id/i,
    );
    for (const code of [
      "invalid_sensor_metric",
      "invalid_sensor_source",
      "invalid_sensor_captured_at",
    ]) {
      const at = body.indexOf(`'${code}'`);
      expect(at, code).toBeGreaterThan(-1);
      expect(at, code).toBeLessThan(firstEventInsert);
    }
  });
});

describe("quicklog_save_event — idempotency scope", () => {
  it("idempotency lookup is scoped by (user_id, idempotency_key)", () => {
    expect(body).toMatch(
      /FROM\s+public\.quicklog_idempotency[\s\S]{0,200}user_id\s*=\s*uid\s+AND\s+idempotency_key\s*=\s*p_idempotency_key/i,
    );
  });

  it("duplicate key replays the original grow_event_id (no second insert)", () => {
    expect(body).toMatch(
      /IF\s+FOUND\s+THEN[\s\S]{0,300}'duplicate_reused'[\s\S]{0,300}RETURN\s+jsonb_build_object\([\s\S]{0,200}'reused'\s*,\s*true/i,
    );
    // The replay branch must return BEFORE the grow_events insert.
    const replayAt = body.search(/'duplicate_reused'/);
    const firstEventInsert = body.search(
      /INSERT\s+INTO\s+public\.grow_events\s*\(\s*user_id/i,
    );
    expect(replayAt).toBeGreaterThan(-1);
    expect(replayAt).toBeLessThan(firstEventInsert);
  });

  it("idempotency persistence binds user_id to uid", () => {
    expect(body).toMatch(
      /INSERT\s+INTO\s+public\.quicklog_idempotency\s*\(\s*user_id\s*,\s*idempotency_key\s*,\s*grow_event_id\s*\)\s*VALUES\s*\(\s*uid\s*,/i,
    );
  });

  it("validates idempotency key length bounds with 'invalid_idempotency_key'", () => {
    expect(body).toMatch(
      /length\(p_idempotency_key\)\s*<\s*8[\s\S]{0,200}'invalid_idempotency_key'/i,
    );
  });
});

describe("quicklog_save_event — atomic write + companion diary", () => {
  it("grow_events insert and diary_entries insert share the same BEGIN/EXCEPTION block (atomic)", () => {
    // Both inserts must live inside the same BEGIN ... EXCEPTION WHEN OTHERS block
    // so a diary failure rolls back the grow_events row (no orphans).
    const block = body.match(
      /BEGIN\s+INSERT\s+INTO\s+public\.grow_events[\s\S]*?EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?RAISE\s*;\s*END\s*;/i,
    );
    expect(block).not.toBeNull();
    expect(block?.[0] ?? "").toMatch(/INSERT\s+INTO\s+public\.diary_entries/i);
    expect(block?.[0] ?? "").toMatch(
      /INSERT\s+INTO\s+public\.quicklog_idempotency/i,
    );
  });

  it("on failure, audits 'save_failed' and re-raises (no swallowed errors)", () => {
    expect(body).toMatch(
      /EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]{0,300}'save_failed'[\s\S]{0,100}RAISE\s*;/i,
    );
  });
});

describe("quicklog_save_event — audit emissions are safe", () => {
  it("emits a 'save_started' audit before validation work", () => {
    expect(body).toMatch(/'save_started'/);
  });

  it("emits 'validation_failed' with a short reason code for rejected calls", () => {
    expect(body).toMatch(
      /quicklog_audit_events[\s\S]{0,200}'validation_failed'/i,
    );
  });

  it("emits 'duplicate_reused' on idempotent replay", () => {
    expect(body).toMatch(/'duplicate_reused'/);
  });

  it("emits 'save_succeeded' with the new grow_event_id on success", () => {
    expect(body).toMatch(
      /quicklog_audit_events[\s\S]{0,200}grow_event_id[\s\S]{0,200}'save_succeeded'/i,
    );
  });

  it("audit reason codes are short safe tokens — no SQL, table names, or UUIDs", () => {
    const reasons = Array.from(
      body.matchAll(/'reason'\s*,\s*'([^']+)'/g),
    ).map((m) => m[1]);
    // Also collect any literal inserted into quicklog_audit_events.reason.
    const auditReasons = Array.from(
      body.matchAll(
        /quicklog_audit_events[^;]*?'(?:validation_failed|save_failed)'\s*,\s*'([^']+)'/gi,
      ),
    ).map((m) => m[1]);
    const all = [...reasons, ...auditReasons];
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) {
      expect(r).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
      expect(r).not.toMatch(/select|insert|update|delete|from|where/i);
      expect(r).not.toMatch(/public\.|auth\.|jwt|bearer|token|secret/i);
      expect(r).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    }
  });

  it("save_failed audit logs SQLSTATE only, not the full error text", () => {
    // The function intentionally stores SQLSTATE (a 5-char code) to avoid
    // leaking raw SQL/JWT/secret fragments from SQLERRM.
    expect(body).toMatch(/'save_failed'\s*,\s*SQLSTATE\b/);
    expect(body).not.toMatch(/'save_failed'\s*,\s*SQLERRM\b/);
  });
});

describe("quicklog_save_event — grants and surface scope", () => {
  it("REVOKEs from PUBLIC and GRANTs EXECUTE to authenticated only", () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.quicklog_save_event[\s\S]{0,400}FROM\s+PUBLIC/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_event[\s\S]{0,400}TO\s+authenticated/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_event[\s\S]{0,400}TO\s+anon\b/i,
    );
  });

  it("does not touch alerts, action_queue, or ai_doctor_sessions", () => {
    expect(body).not.toMatch(/\bpublic\.alerts\b/i);
    expect(body).not.toMatch(/\bpublic\.action_queue\b/i);
    expect(body).not.toMatch(/\bpublic\.ai_doctor_sessions\b/i);
  });

  it("contains no device-control language", () => {
    expect(body).not.toMatch(
      /\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control)\b/i,
    );
  });
});
