import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260619083000_add_soil_moisture_calibration_v1.sql",
);

const sql = readFileSync(MIGRATION_PATH, "utf8");

function policyBlock(action: "INSERT" | "UPDATE"): string {
  const re = new RegExp(
    `CREATE\\s+POLICY\\s+"Users\\s+${action === "INSERT" ? "insert" : "update"}\\s+own\\s+soil\\s+moisture\\s+calibrations"[\\s\\S]*?FOR\\s+${action}[\\s\\S]*?;`,
    "i",
  );
  return sql.match(re)?.[0] ?? "";
}

describe("soil moisture calibration migration", () => {
  const insertPolicy = policyBlock("INSERT");
  const updatePolicy = policyBlock("UPDATE");

  it("creates a grower-owned calibration table with RLS", () => {
    expect(sql).toMatch(/CREATE TABLE public\.soil_moisture_calibrations/);
    expect(sql).toMatch(/ALTER TABLE public\.soil_moisture_calibrations ENABLE ROW LEVEL SECURITY/);
    expect(sql).not.toMatch(/\bTO anon\b/i);
  });

  it("enforces same-grow tent ownership on INSERT", () => {
    expect(insertPolicy).toMatch(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents\s+t[\s\S]*?WHERE\s+t\.id\s*=\s*tent_id[\s\S]*?AND\s+t\.user_id\s*=\s*auth\.uid\(\)[\s\S]*?AND\s+t\.grow_id\s*=\s*grow_id/i,
    );
  });

  it("enforces same-grow tent ownership on UPDATE", () => {
    expect(updatePolicy).toMatch(
      /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.tents\s+t[\s\S]*?WHERE\s+t\.id\s*=\s*tent_id[\s\S]*?AND\s+t\.user_id\s*=\s*auth\.uid\(\)[\s\S]*?AND\s+t\.grow_id\s*=\s*grow_id/i,
    );
  });

  it("does not mutate sensor readings, alerts, action queue, or device-control paths", () => {
    expect(sql).not.toMatch(
      /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|ALTER\s+TABLE)\s+public\.(sensor_readings|alerts|action_queue)\b/i,
    );
    expect(sql).not.toMatch(
      /CREATE\s+FUNCTION|CREATE\s+EXTENSION|\bcron\b|execute_device|setpoint_write|irrigation_control|light_control|fan_control/i,
    );
  });
});
