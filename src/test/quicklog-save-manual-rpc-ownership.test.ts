/**
 * QuickLog v2 RPC ownership regression — static guardrails for
 * public.quicklog_save_manual.
 *
 * These tests assert on the migration SQL directly so the ownership boundary
 * (auth.uid() must own the selected plant/tent and resolved grow) cannot
 * silently regress. The RPC is SECURITY DEFINER, so RLS is bypassed; the
 * tests therefore prove the internal ownership checks reject cross-user
 * writes and that no INSERT can run before those checks.
 *
 * Safety scope: read-only static analysis. No alerts, no action_queue, no
 * ai_doctor_sessions, no device control writes are exercised or referenced.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findRpcMigration(): { path: string; sql: string } | null {
  if (!existsSync(MIG_DIR)) return null;
  for (const name of readdirSync(MIG_DIR)) {
    const p = join(MIG_DIR, name);
    const sql = readFileSync(p, "utf8");
    if (
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i.test(
        sql,
      )
    ) {
      return { path: p, sql };
    }
  }
  return null;
}

const mig = findRpcMigration();
const sql = mig?.sql ?? "";

describe("quicklog_save_manual RPC — migration exists", () => {
  it("a migration defines public.quicklog_save_manual", () => {
    expect(mig).not.toBeNull();
  });
});

describe("quicklog_save_manual RPC — ownership boundary", () => {
  it("is SECURITY DEFINER with pinned search_path", () => {
    expect(sql).toMatch(/security\s+definer/i);
    expect(sql).toMatch(
      /set\s+search_path\s+to\s+'public'\s*,\s*'pg_temp'/i,
    );
  });

  it("derives caller identity from auth.uid(), not a client param", () => {
    expect(sql).toMatch(/uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
    // No p_user_id / _user_id input parameter exists.
    expect(sql).not.toMatch(/\bp_user_id\b/i);
  });

  it("rejects unauthenticated callers before any insert", () => {
    expect(sql).toMatch(
      /IF\s+uid\s+IS\s+NULL[\s\S]{0,200}'not_authenticated'/i,
    );
  });

  it("resolves selected plant target by id AND user_id = auth.uid()", () => {
    expect(sql).toMatch(
      /FROM\s+public\.plants\s+p\s+WHERE\s+p\.id\s*=\s*p_target_id\s+AND\s+p\.user_id\s*=\s*uid/i,
    );
  });

  it("resolves selected tent target by id AND user_id = auth.uid()", () => {
    expect(sql).toMatch(
      /FROM\s+public\.tents\s+t\s+WHERE\s+t\.id\s*=\s*p_target_id\s+AND\s+t\.user_id\s*=\s*uid/i,
    );
  });

  it("rejects target not owned by caller with a safe reason code", () => {
    expect(sql).toMatch(
      /IF\s+v_grow_id\s+IS\s+NULL[\s\S]{0,200}'target_not_owned'/i,
    );
  });

  it("defense-in-depth: verifies resolved grow ownership against auth.uid()", () => {
    expect(sql).toMatch(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.grows\s+g\s+WHERE\s+g\.id\s*=\s*v_grow_id\s+AND\s+g\.user_id\s*=\s*uid/i,
    );
    expect(sql).toMatch(/'grow_not_owned'/i);
  });

  it("all ownership checks occur before the first INSERT", () => {
    const firstInsert = sql.search(/INSERT\s+INTO\s+public\./i);
    const targetCheck = sql.search(/'target_not_owned'/i);
    const growCheck = sql.search(/'grow_not_owned'/i);
    expect(firstInsert).toBeGreaterThan(-1);
    expect(targetCheck).toBeGreaterThan(-1);
    expect(growCheck).toBeGreaterThan(-1);
    expect(targetCheck).toBeLessThan(firstInsert);
    expect(growCheck).toBeLessThan(firstInsert);
  });

  it("derives v_tent_id / v_grow_id from DB rows, not client payload", () => {
    // Plant branch reads tent_id and grow_id from the plants row.
    expect(sql).toMatch(
      /SELECT\s+p\.tent_id\s*,\s*p\.grow_id[\s\S]{0,200}INTO\s+v_tent_id\s*,\s*v_grow_id/i,
    );
    // No "p_grow_id" or "p_tent_id" parameters trusted from the client.
    expect(sql).not.toMatch(/\bp_grow_id\b/i);
    expect(sql).not.toMatch(/\bp_tent_id\b/i);
  });

  it("parent grow_event insert uses uid (not a client-supplied user_id)", () => {
    expect(sql).toMatch(
      /INSERT\s+INTO\s+public\.grow_events[\s\S]{0,400}VALUES\s*\(\s*uid\s*,/i,
    );
  });

  it("environment parent + child inserts also use uid", () => {
    expect(sql).toMatch(
      /INSERT\s+INTO\s+public\.environment_events[\s\S]{0,400}VALUES\s*\(\s*v_env_parent\s*,\s*uid\s*,/i,
    );
  });

  it("environment parent is only inserted under the sensor branch", () => {
    // Sensor branch is gated on v_has_sensors.
    expect(sql).toMatch(
      /IF\s+v_has_sensors\s+THEN[\s\S]{0,600}'environment'/i,
    );
  });

  it("reason codes are short safe tokens — no SQL or table names leaked", () => {
    const reasonMatches = Array.from(
      sql.matchAll(/'reason'\s*,\s*'([^']+)'/g),
    ).map((m) => m[1]);
    expect(reasonMatches.length).toBeGreaterThan(0);
    for (const r of reasonMatches) {
      expect(r).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
      expect(r).not.toMatch(/select|insert|update|delete|from|where/i);
      expect(r).not.toMatch(/public\.|auth\./i);
      // No UUID-shaped leakage.
      expect(r).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
    }
  });

  it("granted to authenticated only; revoked from PUBLIC", () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]{0,400}FROM\s+PUBLIC/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]{0,400}TO\s+authenticated/i,
    );
  });
});

describe("quicklog_save_manual RPC — static safety scope", () => {
  it("does not write to alerts", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.alerts\b/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.alerts\b/i);
  });

  it("does not write to action_queue", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.action_queue\b/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.action_queue\b/i);
  });

  it("does not write to ai_doctor_sessions", () => {
    expect(sql).not.toMatch(
      /INSERT\s+INTO\s+public\.ai_doctor_sessions\b/i,
    );
  });

  it("contains no device-control language", () => {
    expect(sql).not.toMatch(
      /\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control)\b/i,
    );
  });

  it("contains no live/synced/connected/imported wording", () => {
    expect(sql).not.toMatch(/\blive\b/i);
    expect(sql).not.toMatch(/\bsynced\b/i);
    expect(sql).not.toMatch(/\bconnected\b/i);
    expect(sql).not.toMatch(/\bimported\b/i);
  });
});
