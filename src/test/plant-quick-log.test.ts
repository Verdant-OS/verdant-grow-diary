/**
 * Plant Detail Gate 1 Quick Log — pure helper + safety contract tests.
 *
 * Covers:
 *  - parseOptionalNumber treats empty/invalid as null (never 0)
 *  - buildManualSensorSnapshot omits all-empty, labels manual source
 *  - buildQuickLogInsertDraft requires plant_id + grow_id + note
 *  - draft NEVER includes user_id
 *  - presenter has no alert/action_queue/sensor_readings/device-control surface
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  parseOptionalNumber,
  buildManualSensorSnapshot,
  buildQuickLogInsertDraft,
  QUICK_LOG_EVENT_TYPE,
  MANUAL_SENSOR_SOURCE,
} from "@/lib/quickLogRules";

const ROOT = resolve(__dirname, "../..");
const COMP = readFileSync(resolve(ROOT, "src/components/PlantQuickLog.tsx"), "utf8");
const RULES = readFileSync(resolve(ROOT, "src/lib/quickLogRules.ts"), "utf8");
const PAGE = readFileSync(resolve(ROOT, "src/pages/PlantDetail.tsx"), "utf8");

describe("parseOptionalNumber", () => {
  it("returns null for empty / whitespace / non-numeric / NaN / Infinity", () => {
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("   ")).toBeNull();
    expect(parseOptionalNumber("abc")).toBeNull();
    expect(parseOptionalNumber(null)).toBeNull();
    expect(parseOptionalNumber(undefined)).toBeNull();
    expect(parseOptionalNumber("Infinity")).toBeNull();
    expect(parseOptionalNumber("NaN")).toBeNull();
  });
  it("parses decimals (pH, EC)", () => {
    expect(parseOptionalNumber("6.2")).toBe(6.2);
    expect(parseOptionalNumber("1.45")).toBe(1.45);
    expect(parseOptionalNumber("78")).toBe(78);
  });
  it("never coerces empty to 0", () => {
    expect(parseOptionalNumber("")).not.toBe(0);
  });
});

describe("buildManualSensorSnapshot", () => {
  it("returns null when every field is empty", () => {
    expect(
      buildManualSensorSnapshot({ temp: "", humidity: "", ph: "", ec: "" }),
    ).toBeNull();
  });
  it("labels source = 'manual' and preserves nulls for empty fields", () => {
    const snap = buildManualSensorSnapshot({ temp: "77.7", humidity: "", ph: "6.2", ec: "" });
    expect(snap).toEqual({
      temp_f: 77.7,
      humidity_percent: null,
      ph: 6.2,
      ec: null,
      source: MANUAL_SENSOR_SOURCE,
    });
  });
});

describe("buildQuickLogInsertDraft", () => {
  const base = {
    plantId: "p1",
    plantName: "Sour Diesel #1",
    growId: "g1",
    tentId: "t1",
    note: "Watered 1 gallon",
    sensors: { temp: "", humidity: "", ph: "", ec: "" },
  };

  it("fails without note", () => {
    const r = buildQuickLogInsertDraft({ ...base, note: "   " });
    expect(r.ok).toBe(false);
  });
  it("fails without plant_id", () => {
    const r = buildQuickLogInsertDraft({ ...base, plantId: "" });
    expect(r.ok).toBe(false);
  });
  it("fails without grow_id", () => {
    const r = buildQuickLogInsertDraft({ ...base, growId: "" });
    expect(r.ok).toBe(false);
  });

  it("builds a draft with plant_id, tent_id, grow_id, note, no user_id", () => {
    const r = buildQuickLogInsertDraft(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.plant_id).toBe("p1");
    expect(r.draft.grow_id).toBe("g1");
    expect(r.draft.tent_id).toBe("t1");
    expect(r.draft.note).toBe("Watered 1 gallon");
    expect(r.draft.photo_url).toBeNull();
    expect(r.draft.details.event_type).toBe(QUICK_LOG_EVENT_TYPE);
    // No user_id anywhere
    const json = JSON.stringify(r.draft);
    expect(json).not.toContain("user_id");
  });

  it("omits manual_sensor_snapshot when all sensor fields empty", () => {
    const r = buildQuickLogInsertDraft(base);
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.details.manual_sensor_snapshot).toBeUndefined();
  });

  it("attaches manual_sensor_snapshot with manual source when any sensor provided", () => {
    const r = buildQuickLogInsertDraft({
      ...base,
      sensors: { temp: "77.7", humidity: "50.4", ph: "6.2", ec: "1.4" },
    });
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.details.manual_sensor_snapshot).toEqual({
      temp_f: 77.7,
      humidity_percent: 50.4,
      ph: 6.2,
      ec: 1.4,
      source: "manual",
    });
  });

  it("never saves empty optional sensor fields as 0", () => {
    const r = buildQuickLogInsertDraft({
      ...base,
      sensors: { temp: "77", humidity: "", ph: "", ec: "" },
    });
    if (!r.ok) throw new Error("expected ok");
    const snap = r.draft.details.manual_sensor_snapshot!;
    expect(snap.humidity_percent).toBeNull();
    expect(snap.ph).toBeNull();
    expect(snap.ec).toBeNull();
    // and definitely not 0
    expect(snap.humidity_percent).not.toBe(0);
  });

  it("preserves photoPath when provided", () => {
    const r = buildQuickLogInsertDraft({ ...base, photoPath: "u/g/123.jpg" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.draft.photo_url).toBe("u/g/123.jpg");
  });
});

describe("PlantQuickLog presenter — safety contract (source-level)", () => {
  it("writes only to diary_entries + diary-photos storage", () => {
    const tables = [...COMP.matchAll(/\.from\(["']([a-z_]+)["']\)/g)].map((m) => m[1]);
    for (const t of tables) {
      expect(["diary_entries", "diary-photos"]).toContain(t);
    }
  });
  it("never writes user_id in the insert payload", () => {
    expect(COMP).not.toMatch(/user_id\s*:/);
  });
  it("never touches alerts / action_queue / sensor_readings / plants / tents", () => {
    for (const t of [
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "sensor_readings",
      "plants",
      "tents",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
    ]) {
      expect(COMP).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
    }
  });
  it("contains no AI / Doctor / chat / automation / device-control strings", () => {
    expect(COMP).not.toMatch(
      /ai[-_]?coach|ai[-_]?doctor|openai|gpt|mqtt|home[\s_-]?assistant|webhook|relay|actuator|service_role|autopilot|auto[-_ ]?execute/i,
    );
    expect(RULES).not.toMatch(
      /ai[-_]?coach|mqtt|home[\s_-]?assistant|webhook|relay|actuator|service_role/i,
    );
  });
  it("does not invent live sensor data — manual snapshot only", () => {
    // Pure helper labels source as 'manual'; presenter never sets pi_bridge/live.
    expect(COMP).not.toMatch(/source:\s*["'](pi_bridge|live|home_assistant|mqtt)["']/i);
  });
  it("Save button is wired to disabled-when-empty + busy", () => {
    expect(COMP).toMatch(/canSave\s*=\s*note\.trim\(\)\.length\s*>\s*0\s*&&\s*!busy/);
    expect(COMP).toMatch(/disabled=\{!canSave\}/);
  });

  it("source-tagging is documented as a Sensors-phase safety default", () => {
    // One clear comment near MANUAL_SENSOR_SOURCE — not over-commented.
    expect(RULES).toMatch(
      /Manual logs are source-tagged and never trigger alerts or Action Queue\./,
    );
    expect(RULES).toMatch(/Sensors phase safety defaults/);
  });

  it("MANUAL_SENSOR_SOURCE is the accepted 'manual' tag", () => {
    expect(MANUAL_SENSOR_SOURCE).toBe("manual");
  });
});

describe("PlantDetail wiring", () => {
  it("opens PlantQuickLog via a dedicated Quick Log button", () => {
    expect(PAGE).toContain("PlantQuickLog");
    expect(PAGE).toContain("plant-detail-quick-log-open");
    expect(PAGE).toMatch(/setQuickLogOpen\(true\)/);
  });
  it("passes plant.id, growId, tentId, plantName to PlantQuickLog", () => {
    expect(PAGE).toMatch(/plantId=\{plant\.id\}/);
    expect(PAGE).toMatch(/growId=\{plant\.growId\s*\?\?\s*null\}/);
    expect(PAGE).toMatch(/tentId=\{plant\.tentId\s*\?\?\s*null\}/);
    expect(PAGE).toMatch(/plantName=\{plant\.name\}/);
  });
});
