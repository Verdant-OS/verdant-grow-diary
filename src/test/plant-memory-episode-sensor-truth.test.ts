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

import {
  DEFAULT_GROW_LEARNING_FILTERS,
  filterGrowLearningEpisodes,
} from "../lib/growLearningReviewViewModel";
import { buildPostGrowLearningLoopSummary } from "../lib/postGrowLearningLoopSummaryRules";

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
it.each(["live", "manual", "csv"])(
  "%s provenance cannot make explicit degraded, blank or unknown quality usable",
  (source) => {
    for (const quality of ["degraded", " DEGRADED ", "", " ", "unknown", "good", "high"]) {
      expect(classifyEpisodeSensorRow(row({ source, quality }), args)).toMatchObject({
        source,
        status: "needs_review",
        usable: false,
        confidence: quality,
      });
    }
  },
);
const PHYSICAL_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-07-01 11:00:00",
    },
  },
};

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

  it("canonical-live Windows diagnostics are demo-backed and never usable", () => {
    const r = classifyEpisodeSensorRow(
      row({
        source: "live",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test", verdant_source: "live" },
        },
      }),
      args,
    );
    expect(r).toMatchObject({ source: "demo", status: "needs_review", usable: false });
  });

  it("legacy top-level Windows source rows missing provenance fail closed", () => {
    const r = classifyEpisodeSensorRow(
      row({
        source: "ecowitt_windows_testbench",
        raw_payload: null,
      }),
      args,
    );
    expect(r).toMatchObject({ source: "demo", usable: false });
  });

  it("physical Windows gateway evidence remains usable live evidence", () => {
    const r = classifyEpisodeSensorRow(
      row({ source: "live", raw_payload: PHYSICAL_WINDOWS_PAYLOAD }),
      args,
    );
    expect(r).toMatchObject({ source: "live", status: "usable", usable: true });
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
    expect(classifyEpisodeSensorRow(row({ captured_at: iso(-48 * HOUR) }), args)).toBeNull();
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

describe("adapter uses provenance without exposing raw payloads", () => {
  it("raw_payload is classification-only and never surfaced in evidence", () => {
    const rowWithPayload = {
      ...row({ source: "live" }),
      // The classifier may inspect provenance, but never returns its contents.
      raw_payload: { secret: "should never appear" },
    } as EpisodeSensorRowInput;
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

describe("quality flags cannot become usable historical evidence", () => {
  it.each([
    ["live", "stale"],
    ["live", "invalid"],
    ["manual", "stale"],
    ["manual", "invalid"],
    ["csv", "stale"],
    ["csv", "invalid"],
  ])("keeps %s source but excludes %s quality", (source, quality) => {
    const input = row({ source, quality });
    const result = classifyEpisodeSensorRow(input, args);
    expect(result).toMatchObject({
      source,
      status: quality,
      usable: false,
      confidence: quality,
      capturedAt: input.captured_at,
      snapshotId: input.id,
      window: "before",
    });
    expect(classifyEpisodeSensorRow(input, args)).toEqual(result);
  });

  it("normalizes the flag without changing its provenance or recorded confidence", () => {
    expect(
      classifyEpisodeSensorRow(row({ source: "manual", quality: " STALE " }), args),
    ).toMatchObject({ source: "manual", status: "stale", usable: false, confidence: " STALE " });
  });

  it.each(["ok", " OK ", null, undefined])(
    "preserves canonical or missing legacy quality: %s",
    (quality) => {
      expect(classifyEpisodeSensorRow(row({ source: "manual", quality }), args)).toMatchObject({
        source: "manual",
        status: "usable",
        usable: true,
        confidence: quality ?? null,
      });
    },
  );

  it("does not relabel a diagnostic sender as physical live evidence", () => {
    expect(
      classifyEpisodeSensorRow(
        row({
          source: "live",
          quality: "stale",
          raw_payload: {
            vendor: "ecowitt_windows_testbench",
            metadata: { confidence: "test", verdant_source: "live" },
          },
        }),
        args,
      ),
    ).toMatchObject({ source: "demo", status: "needs_review", usable: false });
  });

  it.each(["stale", "invalid"])(
    "keeps %s readings out of complete-evidence filters and export claims",
    (quality) => {
      const episodes = buildPlantMemoryEpisodes({
        actions: [
          {
            id: "act-quality",
            grow_id: "grow-1",
            tent_id: "tent-1",
            plant_id: "plant-1",
            source: "manual",
            action_type: "environment",
            target_metric: "temp",
            suggested_change: null,
            reason: "Grower adjustment",
            status: "completed",
            completed_at: iso(0),
          },
        ],
        diaryRows: [
          {
            id: "out-quality",
            grow_id: "grow-1",
            tent_id: "tent-1",
            plant_id: "plant-1",
            note: null,
            entry_at: iso(25 * HOUR),
            details: {
              event_type: "action_outcome",
              action_queue_id: "act-quality",
              outcome_status: "improved",
              recorded_by: "grower",
              recorded_at: iso(25 * HOUR),
            },
          },
        ],
        sensorRows: [row({ source: "manual", quality })],
        now: T0 + 30 * HOUR,
      });
      expect(episodes).toHaveLength(1);
      expect(episodes[0].outcome.status).toBe("improved"); // Do not rewrite the grower's report.
      expect(episodes[0].evidence.sensorSnapshots).toHaveLength(1); // Keep labelled audit context.
      expect(episodes[0].warnings.some((w) => w.code === "evidence_limited")).toBe(true);
      expect(
        filterGrowLearningEpisodes(episodes, {
          ...DEFAULT_GROW_LEARNING_FILTERS,
          evidenceCompleteness: "complete",
        }),
      ).toEqual([]);
      expect(
        filterGrowLearningEpisodes(episodes, {
          ...DEFAULT_GROW_LEARNING_FILTERS,
          evidenceCompleteness: "limited",
        }),
      ).toEqual(episodes);
      expect(buildPostGrowLearningLoopSummary(episodes).evidenceQualityNotes.join(" ")).toMatch(
        /limited/i,
      );
    },
  );
});
