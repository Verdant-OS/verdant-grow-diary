import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSensorReading } from "@/lib/sensors/normalizeSensorReading";
import { normalizedReadingToLongFormRows } from "@/lib/sensors/sensorReadingLongForm";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-15T12:00:00Z");
const FRESH = "2026-06-15T11:50:00Z";

function fresh() {
  return normalizeSensorReading(
    { temperature_c: 24, humidity: 50, co2: 800 },
    {
      source: "live",
      sourceIdentity: "ecowitt",
      transport: "webhook",
      tentId: TENT,
      plantId: "plant-1",
      capturedAt: FRESH,
      now: NOW,
    },
  );
}

describe("normalizedReadingToLongFormRows", () => {
  it("produces one row per non-null metric", () => {
    const rows = normalizedReadingToLongFormRows(fresh());
    const metrics = rows.map((r) => r.metric).sort();
    expect(metrics).toContain("temperature_c");
    expect(metrics).toContain("temperature_f");
    expect(metrics).toContain("humidity_pct");
    expect(metrics).toContain("vpd_kpa");
    expect(metrics).toContain("co2_ppm");
    expect(rows.every((r) => Number.isFinite(r.value))).toBe(true);
  });

  it("rejects readings without tent_id", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "live", capturedAt: FRESH, now: NOW },
    );
    expect(normalizedReadingToLongFormRows(r)).toEqual([]);
  });

  it("rejects readings without captured_at", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "live", tentId: TENT, now: NOW },
    );
    expect(normalizedReadingToLongFormRows(r)).toEqual([]);
  });

  it("rejects invalid readings", () => {
    const r = normalizeSensorReading(
      {},
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(normalizedReadingToLongFormRows(r)).toEqual([]);
  });

  it("preserves truth source, identity, transport, confidence, warnings, raw payload", () => {
    const r = fresh();
    const rows = normalizedReadingToLongFormRows(r);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.source).toBe(r.source);
      expect(row.source_identity).toBe(r.source_identity);
      expect(row.transport).toBe(r.transport);
      expect(row.confidence).toBe(r.confidence);
      expect(row.is_stale).toBe(r.is_stale);
      expect(row.warnings).toBe(r.warnings);
      expect(row.raw_payload).toBe(r.raw_payload);
      expect(row.tent_id).toBe(TENT);
      expect(row.plant_id).toBe("plant-1");
      expect(row.captured_at).toBe(r.captured_at);
    }
  });

  it("does not import Supabase, write helpers, or edge calls", () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/sensors/sensorReadingLongForm.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/insertSensorReading/);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.upload\(/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/action_queue/);
    expect(source).not.toMatch(/alerts/);
    expect(source).not.toMatch(/device[_-]?control/i);
    expect(source).not.toMatch(/automation/i);
  });
});
