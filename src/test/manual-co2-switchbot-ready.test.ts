/**
 * SwitchBot-ready manual CO2 entry guardrail tests.
 *
 * CO2 ppm is part of the existing manual sensor reading flow (schema trigger
 * `validate_sensor_reading` already allows `co2_ppm`). These tests lock that
 * a grower can manually enter CO2 from a SwitchBot CO2 Monitor without the
 * app pretending the data is live, without CO2 alone triggering alerts, and
 * without any device-control/integration drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildManualReadingPayloads,
  validateManualEntry,
} from "@/lib/sensorReadingManualEntryRules";

describe("manual CO2 entry (SwitchBot-ready)", () => {
  it("accepts a typical SwitchBot CO2 ppm reading", () => {
    const v = validateManualEntry({ co2Ppm: 850 });
    expect(v.ok).toBe(true);
    const co2 = v.metrics.find((m) => m.metric === "co2_ppm");
    expect(co2?.value).toBe(850);
    expect(co2?.derived).toBeUndefined();
  });

  it("treats missing CO2 as acceptable (other metrics still valid)", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    expect(v.ok).toBe(true);
    expect(v.metrics.some((m) => m.metric === "co2_ppm")).toBe(false);
    // temp + RH still derive VPD
    expect(v.metrics.find((m) => m.metric === "vpd_kpa")?.derived).toBe(true);
  });

  it("rejects negative CO2 as invalid", () => {
    const v = validateManualEntry({ co2Ppm: -50 });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ").toLowerCase()).toMatch(/co/);
  });

  it("rejects non-numeric CO2", () => {
    const v = validateManualEntry({ co2Ppm: "not-a-number" });
    // No valid metric ends up in the batch — equivalent to empty entry.
    expect(v.metrics.some((m) => m.metric === "co2_ppm")).toBe(false);
  });

  it("preserves temp/RH → VPD derivation when CO2 is also present", () => {
    const v = validateManualEntry({ airTempF: 78, humidityPct: 50, co2Ppm: 900 });
    expect(v.ok).toBe(true);
    const vpd = v.metrics.find((m) => m.metric === "vpd_kpa");
    expect(vpd?.derived).toBe(true);
    expect(v.metrics.some((m) => m.metric === "co2_ppm")).toBe(true);
  });

  it("builds payload tagged source=manual with quality=ok", () => {
    const v = validateManualEntry({ co2Ppm: 800 });
    const rows = buildManualReadingPayloads({
      tentId: "11111111-1111-1111-1111-111111111111",
      metrics: v.metrics,
    });
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      metric: "co2_ppm",
      value: 800,
      source: "manual",
      quality: "ok",
    });
    // Never trust client user_id on writes.
    expect("user_id" in rows[0]).toBe(false);
  });
});

describe("static safety: manual CO2 surface", () => {
  const files = [
    "src/components/ManualSensorReadingCard.tsx",
    "src/lib/sensorReadingManualEntryRules.ts",
  ];
  const forbidden = [
    "service_role",
    "mqtt",
    "home_assistant",
    "homeassistant",
    "pi_bridge",
    "actuator",
    "device_command",
    "autopilot",
    "Leads",
    "writeWateringTypedEvent",
    "action_queue",
    "switchbot.com",
    "api.switch-bot",
  ];
  for (const f of files) {
    const src = readFileSync(resolve(process.cwd(), f), "utf8");
    for (const term of forbidden) {
      it(`${f} does not reference \`${term}\``, () => {
        expect(src).not.toContain(term);
      });
    }
  }
});
