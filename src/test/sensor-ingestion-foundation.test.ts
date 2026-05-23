// Static + behavioral guardrails for the sensor ingestion foundation.
// Covers: new nullable columns wired through types, batch helper validation,
// safety surface (no forbidden tables/keywords).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/lib/growRepo", () => ({
  insertSensorReadingsBatch: vi.fn(),
}));

import * as repo from "@/lib/growRepo";
import {
  validateSensorReadingBatch,
  VALID_SENSOR_SOURCES,
} from "@/hooks/useInsertSensorReadings";

const goodRow = {
  tent_id: "11111111-1111-1111-1111-111111111111",
  metric: "temperature_c",
  value: 22.5,
  source: "manual",
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

const repoSrc = readFileSync(
  resolve(process.cwd(), "src/lib/growRepo.ts"),
  "utf8",
);
const hookSrc = readFileSync(
  resolve(process.cwd(), "src/hooks/useInsertSensorReadings.ts"),
  "utf8",
);
const typesSrc = readFileSync(
  resolve(process.cwd(), "src/integrations/supabase/types.ts"),
  "utf8",
);
const snapshotSrc = readFileSync(
  resolve(process.cwd(), "src/lib/sensorSnapshot.ts"),
  "utf8",
);
const persistenceSrc = readFileSync(
  resolve(process.cwd(), "src/lib/environmentAlertPersistence.ts"),
  "utf8",
);

describe("sensor_readings new nullable columns (generated types)", () => {
  it("types.ts knows about device_id, raw_payload, captured_at", () => {
    expect(typesSrc).toMatch(/device_id/);
    expect(typesSrc).toMatch(/raw_payload/);
    expect(typesSrc).toMatch(/captured_at/);
  });
});

describe("source whitelist is unchanged", () => {
  it("only allows manual, pi_bridge, sim", () => {
    expect([...VALID_SENSOR_SOURCES].sort()).toEqual(
      ["manual", "pi_bridge", "sim"].sort(),
    );
  });
});

describe("validateSensorReadingBatch", () => {
  it("accepts an empty batch (no-op)", () => {
    expect(() => validateSensorReadingBatch([])).not.toThrow();
  });
  it("accepts a batch of valid rows", () => {
    expect(() =>
      validateSensorReadingBatch([goodRow, { ...goodRow, metric: "co2_ppm", value: 800 }]),
    ).not.toThrow();
  });
  it("rejects entire batch when one row has invalid metric", () => {
    expect(() =>
      validateSensorReadingBatch([goodRow, { ...goodRow, metric: "bogus" }]),
    ).toThrow(/batch row 1/);
  });
  it("rejects entire batch when one row has invalid source", () => {
    expect(() =>
      validateSensorReadingBatch([
        goodRow,
        { ...goodRow, source: "mqtt" },
      ]),
    ).toThrow(/invalid source/);
  });
  it("rejects when tent_id is missing", () => {
    expect(() =>
      validateSensorReadingBatch([{ ...goodRow, tent_id: "" }]),
    ).toThrow(/tent_id/);
  });
  it("rejects when value is not finite", () => {
    expect(() =>
      validateSensorReadingBatch([{ ...goodRow, value: Number.NaN }]),
    ).toThrow(/finite/);
  });
});

describe("batch helper write surface", () => {
  it("repo helper only writes to sensor_readings table", () => {
    // Source check: insertSensorReadingsBatch must only reference
    // sensor_readings table, never other tables.
    const fn = repoSrc.match(
      /export async function insertSensorReadingsBatch[\s\S]*?\n\}/,
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toMatch(/\.from\("sensor_readings"\)/);
    // No other .from() calls inside the function body
    const fromCalls = fn!.match(/\.from\(/g) ?? [];
    expect(fromCalls.length).toBe(1);
  });
});

describe("safety: no forbidden surfaces in batch ingestion code", () => {
  const forbidden = [
    "action_queue",
    "alert_events",
    "alerts",
    "service_role",
    "SUPABASE_SERVICE_ROLE_KEY",
    "homeassistant",
    "home_assistant",
    "mqtt",
    "webhook",
    "device_control",
    "automation",
    ".rpc(",
  ];
  for (const term of forbidden) {
    it(`hook does not reference \`${term}\``, () => {
      expect(hookSrc.toLowerCase()).not.toContain(term.toLowerCase());
    });
  }
});

describe("snapshot pipeline ignores raw_payload", () => {
  it("sensorSnapshot.ts never reads raw_payload", () => {
    expect(snapshotSrc).not.toMatch(/raw_payload/);
  });
});

describe("alert persistence behavior unchanged", () => {
  it("environmentAlertPersistence.ts does not reference new ingestion fields", () => {
    expect(persistenceSrc).not.toMatch(/raw_payload/);
    expect(persistenceSrc).not.toMatch(/device_id/);
    expect(persistenceSrc).not.toMatch(/captured_at/);
  });
});

describe("repo function exists and is exported", () => {
  it("insertSensorReadingsBatch is exported from growRepo", () => {
    expect(typeof repo.insertSensorReadingsBatch).toBe("function");
  });
});
