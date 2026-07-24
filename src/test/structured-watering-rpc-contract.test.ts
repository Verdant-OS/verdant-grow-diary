import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrations = resolve(__dirname, "../../supabase/migrations");
const latest = readdirSync(migrations)
  .sort()
  .reverse()
  .find((name) =>
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_event\b/i.test(
      readFileSync(join(migrations, name), "utf8"),
    ),
  );
const sql = latest ? readFileSync(join(migrations, latest), "utf8") : "";
const body =
  sql.match(
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_event[\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
  )?.[1] ?? "";

describe("structured Water RPC contract", () => {
  it("keeps the complete typed watering payload allowlist", () => {
    const waterBuilder =
      Array.from(body.matchAll(/IF\s+p_water\s+IS\s+NOT\s+NULL[\s\S]*?END\s+IF;/gi))
        .map((match) => match[0])
        .find((block) => /v_water\s*:=\s*jsonb_strip_nulls/i.test(block)) ?? "";
    for (const field of [
      "volume_ml",
      "ph",
      "ec_ms_cm",
      "runoff_ml",
      "runoff_ph",
      "runoff_ec",
      "water_temp_c",
    ]) {
      expect(waterBuilder, field).toContain(`'${field}'`);
    }
  });

  it("requires watering event type when p_water is present before any event insert", () => {
    const guard = body.search(/p_water\s+IS\s+NOT\s+NULL\s+AND\s+p_event_type\s*<>\s*'watering'/i);
    const insert = body.search(/INSERT\s+INTO\s+public\.grow_events/i);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(insert);
    expect(body).toMatch(/'invalid_typed_payload'/i);
  });

  it("writes the typed watering child inside the same atomic block", () => {
    const atomic =
      body.match(
        /BEGIN\s+INSERT\s+INTO\s+public\.grow_events[\s\S]*?EXCEPTION[\s\S]*?END\s*;/i,
      )?.[0] ?? "";
    expect(atomic).toMatch(/INSERT\s+INTO\s+public\.watering_events/i);
    expect(atomic).toMatch(/INSERT\s+INTO\s+public\.quicklog_idempotency/i);
    expect(atomic).toMatch(/INSERT\s+INTO\s+public\.diary_entries/i);
  });

  it("keeps execution authenticated-only and never touches control surfaces", () => {
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_event[\s\S]{0,500}TO\s+authenticated/i,
    );
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.quicklog_save_event[\s\S]{0,500}TO\s+anon\b/i,
    );
    expect(body).not.toMatch(/action_queue|alerts|device_control|relay|valve|pump/i);
  });
});
