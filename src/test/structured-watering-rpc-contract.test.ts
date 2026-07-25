import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const migrations = resolve(__dirname, "../../supabase/migrations");
const EVENT_TYPE_SIGNATURE = [
  "text",
  "uuid",
  "text",
  "uuid",
  "uuid",
  "text",
  "text",
  "jsonb",
  "timestamptz",
  "jsonb",
  "jsonb",
  "jsonb",
].join("\\s*,\\s*");
const EVENT_NAMED_SIGNATURE = [
  ["p_idempotency_key", "text"],
  ["p_grow_id", "uuid"],
  ["p_event_type", "text"],
  ["p_tent_id", "uuid"],
  ["p_plant_id", "uuid"],
  ["p_note", "text"],
  ["p_photo_url", "text"],
  ["p_sensor_snapshot", "jsonb"],
  ["p_occurred_at", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)"],
  ["p_details", "jsonb"],
  ["p_water", "jsonb"],
  ["p_feed", "jsonb"],
]
  .map(([name, type]) => `${name}\\s+${type}(?:\\s+DEFAULT\\s+[^,)]*)?`)
  .join("\\s*,\\s*");

const eventDefinitionPattern = () =>
  new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.quicklog_save_event\\s*\\(\\s*${EVENT_NAMED_SIGNATURE}\\s*\\)\\s*RETURNS\\s+jsonb[\\s\\S]*?AS\\s+(\\$function\\$|\\$\\$)([\\s\\S]*?)\\1`,
    "i",
  );
const eventDelegateRenamePattern = () =>
  new RegExp(
    `ALTER\\s+FUNCTION\\s+public\\.quicklog_save_event\\s*\\(\\s*${EVENT_TYPE_SIGNATURE}\\s*\\)\\s+RENAME\\s+TO\\s+quicklog_save_event_pre_logged_at`,
    "i",
  );

/** Resolve only the exact 12-argument event overload renamed by the wrapper. */
function delegatedSaveEventContract(): { delegateBody: string; wrapperSql: string } {
  const files = readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(migrations, name), "utf8"),
    }));
  let wrapperIndex = -1;
  for (let index = files.length - 1; index >= 0; index -= 1) {
    const { sql } = files[index];
    if (eventDelegateRenamePattern().test(sql) && eventDefinitionPattern().test(sql)) {
      wrapperIndex = index;
      break;
    }
  }
  if (wrapperIndex < 1) {
    return { delegateBody: "", wrapperSql: "" };
  }

  for (let index = wrapperIndex - 1; index >= 0; index -= 1) {
    const match = files[index].sql.match(eventDefinitionPattern());
    if (match?.[2]) {
      return {
        delegateBody: match[2],
        wrapperSql: files[wrapperIndex].sql,
      };
    }
  }
  return { delegateBody: "", wrapperSql: files[wrapperIndex].sql };
}

const { delegateBody: body, wrapperSql: sql } = delegatedSaveEventContract();

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
