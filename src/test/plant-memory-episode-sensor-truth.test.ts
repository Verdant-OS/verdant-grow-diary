/**
 * Sensor-truth tests for the episode adapter: provenance is preserved and
 * honestly classified; invalid/stale/demo/unknown evidence is never usable;
 * future timestamps are invalid; raw payloads never enter the feature.
 */
import { describe, expect, it } from "vitest";
import {
  classifyEpisodeSensorRow,
  buildPlantMemoryEpisodes,
  type EpisodeSensorRowInput,
} from "../lib/plantMemoryEpisodeAdapter";

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const HOUR = 60 * 60 * 1000;

function row(overrides: Partial<EpisodeSensorRowInput>): EpisodeSensorRowInput {
  return {
    id: "s1",
    tent_id: "tent-1",
    metric: "temp",
    source: "live",
    quality: "ok",
    captured_at: iso(-HOUR), // in the before-window
    ...overrides,
  };
}

const args = { completedAtMs: T0, nowMs: T0 + 2 * HOUR };

describe("classifyEpisodeSensorRow — provenance labeling", () => {
  it("live evidence is labeled live and usable", () => {
    const r = classifyEpisodeSensorRow(row({ source: "live" }), args);
    expect(r).toMatchObject({ source: "live", status: "usable", usable: true });
  });

  it("manual evidence is labeled manual and usable", () => {
    const r = classifyEpisodeSensorRow(row({ source: "manual" }), args);
    expect(r).toMatchObject({ source: "manual", status: "usable", usable: true });
  });

  it("csv evidence is labeled csv and usable", () => {
    const r = classifyEpisodeSensorRow(row({ source: "csv" }), args);
    expect(r).toMatchObject({ source: "csv", status: "usable", usable: true });
  });

  it("demo evidence is labeled demo and NEVER usable", () => {
    const r = classifyEpisodeSensorRow(row({ source: "demo" }), args);
    expect(r?.source).toBe("demo");
    expect(r?.usable).toBe(false);
    expect(r?.status).toBe("needs_review");
  });

  it("invalid source is never usable", () => {
    const r = classifyEpisodeSensorRow(row({ source: "invalid" }), args);
    expect(r?.usable).toBe(false);
  });

  it("unknown provenance becomes needs_review, never usable/live", () => {
    const r = classifyEpisodeSensorRow(row({ source: "mystery_vendor" }), args);
    expect(r?.status).toBe("needs_review");
    expect(r?.usable).toBe(false);
    expect(r?.source).not.toBe("live");
  });

  it("empty/blank provenance is invalid, not live", () => {
    const r = classifyEpisodeSensorRow(row({ source: "" }), args);
    expect(r?.usable).toBe(false);
    expect(r?.source).toBe("invalid");
  });

  it("a future captured_at is invalid regardless of source", () => {
    // 130 min after completion: past now (120 min) + skew (5 min) → future,
    // and still inside the 6h after-window so it isn't excluded outright.
    const r = classifyEpisodeSensorRow(
      row({ source: "live", captured_at: iso(130 * 60 * 1000) }),
      args,
    );
    expect(r).not.toBeNull();
    expect(r?.status).toBe("invalid");
    expect(r?.usable).toBe(false);
  });

  it("rows outside every evidence window are excluded (null), not guessed", () => {
    expect(
      classifyEpisodeSensorRow(row({ captured_at: iso(-48 * HOUR) }), args),
    ).toBeNull();
    expect(classifyEpisodeSensorRow(row({ captured_at: "not-a-date" }), args)).toBeNull();
  });

  it("preserves the full sensor-truth envelope (source/captured_at/tent/status/confidence)", () => {
    const r = classifyEpisodeSensorRow(row({ quality: "high", tent_id: "tent-9" }), args);
    expect(r).toMatchObject({
      snapshotId: "s1",
      capturedAt: iso(-HOUR),
      tentId: "tent-9",
      confidence: "high",
    });
    expect(typeof r?.status).toBe("string");
  });
});

describe("adapter never ingests or exposes raw payloads", () => {
  it("EpisodeSensorRowInput has no raw_payload field surfaced in evidence", () => {
    const rowWithPayload = {
      ...row({ source: "live" }),
      // Even if a caller leaks raw_payload, the classifier ignores it.
      raw_payload: { secret: "should never appear" },
    } as unknown as EpisodeSensorRowInput;
    const r = classifyEpisodeSensorRow(rowWithPayload, args);
    expect(JSON.stringify(r)).not.toContain("should never appear");
    expect(JSON.stringify(r)).not.toContain("raw_payload");
  });

  it("cross-tent snapshots are dropped by buildPlantMemoryEpisodes and surfaced", () => {
    const episodes = buildPlantMemoryEpisodes({
      actions: [
        {
          id: "act-1",
          grow_id: "grow-1",
          tent_id: "tent-1",
          plant_id: "plant-1",
          source: "ai",
          action_type: "environment",
          target_metric: "temp",
          suggested_change: "lower",
          reason: "high",
          status: "completed",
          completed_at: iso(0),
        },
      ],
      diaryRows: [],
      sensorRows: [row({ tent_id: "tent-OTHER" })],
      now: T0 + 2 * HOUR,
    });
    expect(episodes[0].evidence.sensorSnapshots).toHaveLength(0);
    expect(episodes[0].warnings.some((w) => w.code === "snapshot_tent_mismatch")).toBe(true);
  });
});
