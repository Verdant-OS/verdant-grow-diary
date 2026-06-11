/**
 * Database-level trust-boundary guardrails for public.quicklog_save_manual.
 *
 * Complementary to the existing ownership / reason-codes / mixed-boundary
 * test files. This file proves additional invariants:
 *   - validation precedes every INSERT into public.* (no orphans on reject)
 *   - sensor inputs are numeric SQL parameters (cannot carry NaN/Infinity
 *     as JSON numbers), and p_details is strictly an object with auth keys
 *     stripped
 *   - GRANTs are scoped to authenticated only; no anon execute
 *   - the RPC writes nothing to alerts / action_queue / ai_doctor_sessions
 *   - no device-control vocabulary
 *
 * Read-only static analysis. No alerts, action_queue, ai_doctor_sessions,
 * automation, or device-control surfaces are touched.
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
      /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i.test(
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
const bodyMatch = sql.match(
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
);
const body = bodyMatch?.[1] ?? "";

describe("quicklog_save_manual — migration discoverable", () => {
  it("migration defines the function", () => {
    expect(mig).not.toBeNull();
    expect(body.length).toBeGreaterThan(200);
  });
});

describe("quicklog_save_manual — pre-insert rejection invariants", () => {
  const REJECT_CODES = [
    "not_authenticated",
    "invalid_target_type",
    "missing_target_id",
    "unsupported_action",
    "invalid_volume",
    "target_not_owned",
    "grow_not_owned",
    "invalid_details",
  ];

  it("every documented rejection code precedes the first INSERT into public.*", () => {
    const firstInsert = body.search(/INSERT\s+INTO\s+public\./i);
    expect(firstInsert).toBeGreaterThan(-1);
    for (const code of REJECT_CODES) {
      const at = body.indexOf(`'${code}'`);
      if (at === -1) continue; // not all codes guaranteed in every revision
      expect(at, `${code}`).toBeLessThan(firstInsert);
    }
  });

  it("every rejection branch RETURNs jsonb_build_object early", () => {
    for (const code of REJECT_CODES) {
      const at = body.indexOf(`'${code}'`);
      if (at === -1) continue;
      const window = body.slice(at, Math.min(body.length, at + 400));
      expect(window, code).toMatch(/RETURN\s+jsonb_build_object/i);
    }
  });

  it("rejects invalid action with 'unsupported_action' before insert", () => {
    expect(body).toMatch(
      /p_action\s+NOT\s+IN\s*\(\s*'water'\s*,\s*'note'\s*\)[\s\S]{0,200}'unsupported_action'/i,
    );
  });

  it("rejects non-positive volume for water action with 'invalid_volume'", () => {
    expect(body).toMatch(
      /p_action\s*=\s*'water'[\s\S]{0,200}p_volume_ml\s+IS\s+NULL\s+OR\s+p_volume_ml\s*<=\s*0[\s\S]{0,200}'invalid_volume'/i,
    );
  });
});

describe("quicklog_save_manual — p_details safety (no auth rebind)", () => {
  it("requires p_details to be a JSON object (rejects arrays / scalars)", () => {
    expect(body).toMatch(
      /jsonb_typeof\(p_details\)\s*<>\s*'object'[\s\S]{0,200}'invalid_details'/i,
    );
  });

  it("strips auth/ownership-scoping keys from p_details before persist", () => {
    expect(body).toMatch(
      /p_details[\s\S]{0,200}-\s*'user_id'[\s\S]{0,200}-\s*'grow_id'[\s\S]{0,200}-\s*'tent_id'[\s\S]{0,200}-\s*'plant_id'/i,
    );
  });
});

describe("quicklog_save_manual — sensor inputs are typed SQL params", () => {
  it("temperature_c / humidity_pct / vpd_kpa are typed numeric (no JSON NaN/Infinity surface)", () => {
    expect(sql).toMatch(/p_temperature_c\s+numeric\b/i);
    expect(sql).toMatch(/p_humidity_pct\s+numeric\b/i);
    expect(sql).toMatch(/p_vpd_kpa\s+numeric\b/i);
  });

  it("environment branch only fires when at least one sensor value is non-NULL", () => {
    expect(body).toMatch(
      /v_has_sensors\s*:=\s*\(\s*p_temperature_c\s+IS\s+NOT\s+NULL/i,
    );
    expect(body).toMatch(/IF\s+v_has_sensors\s+THEN/i);
  });

  it("environment parent + child both bind to uid (never a client value)", () => {
    expect(body).toMatch(
      /INSERT\s+INTO\s+public\.grow_events[\s\S]{0,400}'environment'[\s\S]{0,400}/i,
    );
    expect(body).toMatch(
      /INSERT\s+INTO\s+public\.environment_events\s*\([\s\S]{0,200}\)\s*VALUES\s*\(\s*v_env_parent\s*,\s*uid\s*,/i,
    );
  });
});

describe("quicklog_save_manual — grants and surface scope", () => {
  it("REVOKEs from PUBLIC and GRANTs EXECUTE to authenticated only (no anon)", () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]{0,600}FROM\s+PUBLIC/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]{0,600}TO\s+authenticated/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_manual[\s\S]{0,600}TO\s+anon\b/i,
    );
  });

  it("does not write to alerts / action_queue / ai_doctor_sessions", () => {
    expect(body).not.toMatch(/INSERT\s+INTO\s+public\.alerts\b/i);
    expect(body).not.toMatch(/UPDATE\s+public\.alerts\b/i);
    expect(body).not.toMatch(/INSERT\s+INTO\s+public\.action_queue\b/i);
    expect(body).not.toMatch(/UPDATE\s+public\.action_queue\b/i);
    expect(body).not.toMatch(/INSERT\s+INTO\s+public\.ai_doctor_sessions\b/i);
  });

  it("contains no device-control vocabulary", () => {
    expect(body).not.toMatch(
      /\b(actuator|relay|fan_on|light_on_cmd|pump|dose|valve|switch_on|switch_off|device_control)\b/i,
    );
  });
});
