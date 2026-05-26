/**
 * Recent Sensor Snapshot History — regression + safety pin.
 *
 * Read-only display layer. Confirms:
 *  - newest-first ordering and tie-breaking determinism
 *  - manual rows label as "Manual" (never "Live sensor")
 *  - sim-only groups label as "Simulated" (never live)
 *  - stale flag honored
 *  - missing optional metrics stay null (no invented values)
 *  - empty input returns empty list
 *  - existing latest Sensor Context view still computes correctly
 *  - static safety: helper file has no webhook / action_queue /
 *    service_role / device-control / automation / RPC / fake-live strings
 *  - PlantTentEnvironmentPanel.tsx does not duplicate SOURCE_LABEL
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildRecentSensorSnapshotHistory,
  RECENT_HISTORY_MAX_LIMIT,
} from "@/lib/recentSensorSnapshotHistoryRules";
import {
  buildPlantTentEnvironmentView,
} from "@/lib/plantTentEnvironmentRules";
import { SOURCE_LABEL } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-05-24T12:00:00Z").getTime();

function row(
  ts: string,
  metric: string,
  value: number | null,
  source: string | null,
) {
  return { ts, metric, value, source };
}

describe("buildRecentSensorSnapshotHistory", () => {
  it("returns newest-first by captured_at", () => {
    const rows = [
      row("2026-05-24T11:00:00Z", "temperature_c", 24, "manual"),
      row("2026-05-24T09:00:00Z", "temperature_c", 22, "manual"),
      row("2026-05-24T10:00:00Z", "temperature_c", 23, "manual"),
    ];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(out.map((r) => r.ts)).toEqual([
      "2026-05-24T11:00:00Z",
      "2026-05-24T10:00:00Z",
      "2026-05-24T09:00:00Z",
    ]);
  });

  it("is deterministic when timestamps tie (folds same ts into one snapshot)", () => {
    const rows = [
      row("2026-05-24T11:00:00Z", "temperature_c", 24, "manual"),
      row("2026-05-24T11:00:00Z", "humidity_pct", 55, "manual"),
      row("2026-05-24T11:00:00Z", "vpd_kpa", 1.2, "manual"),
    ];
    const a = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    const b = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ temp: 24, rh: 55, vpd: 1.2 });
  });

  it("labels manual rows as 'Manual', never 'Live sensor'", () => {
    const rows = [row("2026-05-24T11:00:00Z", "temperature_c", 24, "manual")];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(SOURCE_LABEL[out[0].source]).toBe("Manual");
    expect(SOURCE_LABEL[out[0].source]).not.toBe("Live sensor");
  });

  it("labels sim-only rows as 'Simulated', not live", () => {
    const rows = [row("2026-05-24T11:00:00Z", "temperature_c", 24, "sim")];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(SOURCE_LABEL[out[0].source]).toBe("Simulated");
    expect(SOURCE_LABEL[out[0].source]).not.toBe("Live sensor");
  });

  it("flags stale rows", () => {
    const stale = new Date(NOW - 60 * 60 * 1000).toISOString();
    const fresh = new Date(NOW - 60 * 1000).toISOString();
    const rows = [
      row(fresh, "temperature_c", 24, "manual"),
      row(stale, "temperature_c", 22, "manual"),
    ];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(out[0].stale).toBe(false);
    expect(out[1].stale).toBe(true);
  });

  it("does not invent missing optional metrics", () => {
    const rows = [row("2026-05-24T11:00:00Z", "temperature_c", 24, "manual")];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(out[0]).toMatchObject({ temp: 24, rh: null, vpd: null, co2: null });
  });

  it("returns empty list for empty / nullish input", () => {
    expect(buildRecentSensorSnapshotHistory([], { now: NOW })).toEqual([]);
    expect(buildRecentSensorSnapshotHistory(null, { now: NOW })).toEqual([]);
    expect(buildRecentSensorSnapshotHistory(undefined, { now: NOW })).toEqual([]);
  });

  it("caps result at the max history limit", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(
        new Date(NOW - i * 60 * 1000).toISOString(),
        "temperature_c",
        20 + i,
        "manual",
      ),
    );
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(out.length).toBeLessThanOrEqual(RECENT_HISTORY_MAX_LIMIT);
  });

  it("ignores rows with invalid ts", () => {
    const rows = [
      row("not-a-date", "temperature_c", 24, "manual"),
      row("2026-05-24T11:00:00Z", "temperature_c", 25, "manual"),
    ];
    const out = buildRecentSensorSnapshotHistory(rows, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].ts).toBe("2026-05-24T11:00:00Z");
  });
});

describe("Sensor Context — latest display remains intact", () => {
  it("buildPlantTentEnvironmentView still derives latest snapshot from same rows", () => {
    const rows = [
      row("2026-05-24T11:00:00Z", "temperature_c", 24, "manual"),
      row("2026-05-24T11:00:00Z", "humidity_pct", 55, "manual"),
      row("2026-05-24T10:00:00Z", "temperature_c", 22, "manual"),
    ];
    const view = buildPlantTentEnvironmentView(rows, NOW);
    expect(view.hasReadings).toBe(true);
    expect(view.sourceLabel).toBe("Manual reading");
    expect(view.capturedAt).toBe("2026-05-24T11:00:00Z");
  });
});

describe("Static safety — recentSensorSnapshotHistoryRules.ts", () => {
  const raw = readFileSync(
    resolve(__dirname, "../lib/recentSensorSnapshotHistoryRules.ts"),
    "utf8",
  );
  // Strip block + line comments so safety check matches actual code only.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  it.each([
    "webhook",
    "action_queue",
    "service_role",
    "device_control",
    "automation",
    ".rpc(",
    ".insert(",
    ".update(",
    ".delete(",
  ])("does not contain %s", (needle) => {
    expect(src.toLowerCase()).not.toContain(needle.toLowerCase());
  });
  it("does not relabel manual or sim as live", () => {
    expect(src).not.toMatch(/manual.*=>.*"live"/i);
    expect(src).not.toMatch(/sim.*=>.*"live"/i);
  });
});

describe("Static safety — PlantTentEnvironmentPanel.tsx", () => {
  const src = readFileSync(
    resolve(__dirname, "../components/PlantTentEnvironmentPanel.tsx"),
    "utf8",
  );
  it("does not duplicate SOURCE_LABEL map", () => {
    // It may import SOURCE_LABEL but must not redefine it.
    const defines = src.match(/(const|let|var)\s+SOURCE_LABEL\s*[:=]/g);
    expect(defines).toBeNull();
  });
  it("imports SOURCE_LABEL from sensorSnapshot", () => {
    expect(src).toMatch(/SOURCE_LABEL/);
    expect(src).toMatch(/from\s+["']@\/lib\/sensorSnapshot["']/);
  });
});
