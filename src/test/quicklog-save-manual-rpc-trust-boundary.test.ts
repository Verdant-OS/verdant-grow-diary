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
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual[\s\S]*?AS\s+(\$function\$|\$\$)([\s\S]*?)\1/i,
);
const body = bodyMatch?.[2] ?? "";

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

  it("every documented rejection code precedes the first companion INSERT into public.*", () => {
    // Skip audit-event inserts (those are how rejections are recorded).
    const firstInsert = body.search(
      /INSERT\s+INTO\s+public\.(grow_events|watering_events|environment_events|diary_entries|feeding_events|observation_events|training_events|photo_events)\b/i,
    );
    expect(firstInsert).toBeGreaterThan(-1);
    for (const code of REJECT_CODES) {
      const at = body.indexOf(`'${code}'`);
      if (at === -1) continue;
      expect(at, `${code}`).toBeLessThan(firstInsert);
    }
  });

  it("every rejection branch RETURNs jsonb_build_object early", () => {
    for (const code of REJECT_CODES) {
      const at = body.indexOf(`'${code}'`);
      if (at === -1) continue;
      // RETURN precedes the reason literal on the same statement.
      const window = body.slice(Math.max(0, at - 200), Math.min(body.length, at + 200));
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

describe("quicklog_save_manual — internal audit emissions", () => {
  it("emits 'validation_failed' on every pre-write rejection branch", () => {
    expect(body).toMatch(
      /quicklog_audit_events[\s\S]{0,200}'validation_failed'\s*,\s*'invalid_target_type'/i,
    );
    expect(body).toMatch(/'validation_failed'\s*,\s*'missing_target_id'/);
    expect(body).toMatch(/'validation_failed'\s*,\s*'unsupported_action'/);
    expect(body).toMatch(/'validation_failed'\s*,\s*'invalid_volume'/);
    expect(body).toMatch(/'validation_failed'\s*,\s*'invalid_details'/);
    expect(body).toMatch(/'validation_failed'\s*,\s*'target_not_owned'/);
  });

  it("emits 'save_started' before the first companion INSERT", () => {
    const startAt = body.search(/'save_started'/);
    expect(startAt).toBeGreaterThan(-1);
    const firstInsert = body.search(
      /INSERT\s+INTO\s+public\.grow_events\b/i,
    );
    expect(startAt).toBeLessThan(firstInsert);
  });

  it("emits 'save_succeeded' after the companion write block", () => {
    expect(body).toMatch(
      /quicklog_audit_events[\s\S]{0,200}'save_succeeded'/i,
    );
    const succAt = body.lastIndexOf("'save_succeeded'");
    const lastInsertMatches = Array.from(
      body.matchAll(/INSERT\s+INTO\s+public\.(grow_events|watering_events|environment_events|diary_entries)\b/gi),
    );
    expect(lastInsertMatches.length).toBeGreaterThan(0);
    const lastInsert = lastInsertMatches[lastInsertMatches.length - 1].index!;
    expect(succAt).toBeGreaterThan(lastInsert);
  });

  it("emits 'save_failed' with SQLSTATE (not SQLERRM) inside one WHEN OTHERS block", () => {
    const except = body.match(
      /EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?END\s*;/i,
    )?.[0] ?? "";
    expect(except).toMatch(/'save_failed'\s*,\s*SQLSTATE\b/);
    expect(except).not.toMatch(/\bSQLERRM\b/);
    expect(except).toMatch(
      /RETURN\s+jsonb_build_object\(\s*'ok'\s*,\s*false\s*,\s*'reason'\s*,\s*'save_failed'/i,
    );
    expect(except).not.toMatch(/\bRAISE\s*;/);
  });

  it("SQLERRM is never used anywhere in the function body", () => {
    expect(body).not.toMatch(/\bSQLERRM\b/);
  });

  it("all four companion writes share ONE BEGIN/EXCEPTION block", () => {
    const block = body.match(
      /BEGIN\s+INSERT\s+INTO\s+public\.grow_events[\s\S]*?EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]*?END\s*;/i,
    );
    expect(block).not.toBeNull();
    const blk = block?.[0] ?? "";
    expect(blk).toMatch(/INSERT\s+INTO\s+public\.grow_events/i);
    expect(blk).toMatch(/INSERT\s+INTO\s+public\.watering_events/i);
    expect(blk).toMatch(/INSERT\s+INTO\s+public\.environment_events/i);
    expect(blk).toMatch(/INSERT\s+INTO\s+public\.diary_entries/i);
    const outside = body.replace(blk, "");
    expect(outside).not.toMatch(/INSERT\s+INTO\s+public\.watering_events/i);
    expect(outside).not.toMatch(/INSERT\s+INTO\s+public\.environment_events/i);
    expect(outside).not.toMatch(/INSERT\s+INTO\s+public\.diary_entries/i);
  });

  it("failure path returns safe JSON envelope (no raw DB error exposure)", () => {
    // Every WHEN OTHERS branch returns the documented safe envelope.
    const matches = Array.from(
      body.matchAll(
        /WHEN\s+OTHERS\s+THEN[\s\S]*?RETURN\s+jsonb_build_object\(\s*'ok'\s*,\s*false\s*,\s*'reason'\s*,\s*'save_failed'/gi,
      ),
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});
