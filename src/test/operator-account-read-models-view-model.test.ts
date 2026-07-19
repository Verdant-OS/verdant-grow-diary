import { describe, expect, it } from "vitest";
import {
  buildOperatorDiaryEntryRows,
  buildOperatorSensorReadingRows,
  type OperatorSensorReadingInput,
} from "@/lib/operatorAccountReadModelsViewModel";

function reading(overrides: Partial<OperatorSensorReadingInput> = {}): OperatorSensorReadingInput {
  return {
    id: "reading-1",
    metric: "temperature_c",
    value: 24,
    quality: "ok",
    source: "live",
    ts: "2026-07-19T12:00:00Z",
    captured_at: "2026-07-19T12:00:00Z",
    freshness: "fresh",
    current_live: true,
    ...overrides,
  };
}

describe("Operator account read-model presenters", () => {
  describe("buildOperatorDiaryEntryRows", () => {
    it("sorts by entry, created, then id descending without mutating input", () => {
      const entries = [
        {
          id: "a",
          stage: "vegetative",
          note: "Older",
          entry_at: "2026-07-19T10:00:00Z",
          created_at: "2026-07-19T10:00:00Z",
        },
        {
          id: "b",
          stage: "early_flower",
          note: "Tie, older creation",
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:00:00Z",
        },
        {
          id: "z",
          stage: "late-flower",
          note: "Tie winner",
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:01:00Z",
        },
      ];
      const original = structuredClone(entries);

      expect(buildOperatorDiaryEntryRows(entries).map((entry) => entry.id)).toEqual([
        "z",
        "b",
        "a",
      ]);
      expect(entries).toEqual(original);
      expect(buildOperatorDiaryEntryRows([...entries].reverse())).toEqual(
        buildOperatorDiaryEntryRows(entries),
      );
    });

    it("normalizes stage labels, empty notes, long notes, and invalid timestamps", () => {
      const rows = buildOperatorDiaryEntryRows([
        {
          id: "entry",
          stage: "early_flower",
          note: "   ",
          entry_at: "not-a-time",
          created_at: "also-bad",
        },
        {
          id: "long",
          stage: null,
          note: "x".repeat(401),
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:00:00Z",
        },
      ]);
      expect(rows.find((row) => row.id === "entry")).toEqual({
        id: "entry",
        stageLabel: "Early Flower",
        note: "No note recorded.",
        entryAt: null,
      });
      const long = rows.find((row) => row.id === "long");
      expect(long?.stageLabel).toBe("Stage Not Recorded");
      expect(long?.note).toHaveLength(400);
      expect(long?.note.endsWith("…")).toBe(true);
    });

    it("filters invalid ids, stays null-safe, and sanitizes sensitive stage labels", () => {
      expect(buildOperatorDiaryEntryRows(null)).toEqual([]);
      expect(buildOperatorDiaryEntryRows(undefined)).toEqual([]);
      const rows = buildOperatorDiaryEntryRows([
        {
          id: "",
          stage: "flower",
          note: "drop",
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:00:00Z",
        },
        {
          id: "safe",
          stage: "Bearer secret-token",
          note: null,
          entry_at: "2026-07-19T12:00:00Z",
          created_at: "2026-07-19T12:00:00Z",
        },
      ]);
      expect(rows).toHaveLength(1);
      expect(rows[0].stageLabel).toBe("Stage Not Recorded");
    });
  });

  describe("buildOperatorSensorReadingRows", () => {
    it("uses canonical metric order with deterministic fallbacks", () => {
      const input = {
        z: reading({ id: "z", metric: "unknown_z", value: 1 }),
        humidity: reading({ id: "humidity", metric: "humidity_pct", value: 55 }),
        temperature: reading({ id: "temperature", metric: "temperature_c", value: 24 }),
        a: reading({ id: "a", metric: "unknown_a", value: 2 }),
      };
      expect(buildOperatorSensorReadingRows(input).map((row) => row.id)).toEqual([
        "temperature",
        "humidity",
        "a",
        "z",
      ]);
      expect(buildOperatorSensorReadingRows({ ...input })).toEqual(
        buildOperatorSensorReadingRows(input),
      );
    });

    it("formats values and canonical labels", () => {
      const rows = buildOperatorSensorReadingRows({
        temperature: reading({ id: "temperature", metric: "temperature_c", value: 24 }),
        humidity: reading({ id: "humidity", metric: "humidity_pct", value: 55 }),
        ec: reading({ id: "ec", metric: "ec", value: 1.8 }),
      });
      expect(rows.find((row) => row.id === "temperature")).toMatchObject({
        metricLabel: "Temperature",
        valueLabel: expect.stringMatching(/75\.2 °F|24\.0 °C/),
      });
      expect(rows.find((row) => row.id === "humidity")).toMatchObject({
        metricLabel: "Humidity",
        valueLabel: "55.0 %",
      });
      expect(rows.find((row) => row.id === "ec")).toMatchObject({
        metricLabel: "EC",
        valueLabel: "1.80 mS/cm",
      });
    });

    it.each([
      {
        name: "strict fresh live ok",
        overrides: {},
        current: true,
        tone: "current",
      },
      {
        name: "manual context",
        overrides: { source: "manual" },
        current: false,
        tone: "context",
      },
      {
        name: "csv context",
        overrides: { source: "csv" },
        current: false,
        tone: "context",
      },
      {
        name: "degraded caution",
        overrides: { quality: "degraded" },
        current: false,
        tone: "caution",
      },
      {
        name: "stale caution",
        overrides: { freshness: "stale" as const },
        current: false,
        tone: "caution",
      },
      {
        name: "invalid source",
        overrides: { source: "invalid", freshness: "invalid" as const },
        current: false,
        tone: "invalid",
      },
      {
        name: "invalid timestamp",
        overrides: { captured_at: "not-a-date", ts: "not-a-date" },
        current: false,
        tone: "context",
      },
      {
        name: "upstream false",
        overrides: { current_live: false },
        current: false,
        tone: "context",
      },
    ])("fails closed for $name", ({ overrides, current, tone }) => {
      const [row] = buildOperatorSensorReadingRows({ value: reading(overrides) });
      expect(row).toMatchObject({ currentLive: current, trustTone: tone });
    });

    it("sanitizes sensitive, control-character, and overlong labels", () => {
      const [row] = buildOperatorSensorReadingRows({
        secret: reading({
          metric: "custom\u0000metric",
          source: "Bearer eyJ.private-token",
          quality: "api_key=private",
        }),
      });
      expect(row.metricLabel).toBe("custom metric");
      expect(row.sourceLabel).toBe("Unknown");
      expect(row.qualityLabel).toBe("Unknown");
      expect(JSON.stringify(row)).not.toMatch(/eyJ|private-token|api_key/);

      const [long] = buildOperatorSensorReadingRows({
        long: reading({ metric: "x".repeat(100), source: "sensor-bridge", quality: "ok" }),
      });
      expect(long.metricLabel).toHaveLength(64);
      expect(long.sourceLabel).toBe("Sensor Bridge");
    });

    it("filters malformed readings and stays null-safe", () => {
      expect(buildOperatorSensorReadingRows(null)).toEqual([]);
      expect(buildOperatorSensorReadingRows(undefined)).toEqual([]);
      expect(
        buildOperatorSensorReadingRows({
          noId: reading({ id: "" }),
          noMetric: reading({ id: "no-metric", metric: "" }),
          infinite: reading({ id: "infinite", value: Number.POSITIVE_INFINITY }),
          valid: reading({ id: "valid" }),
        }).map((row) => row.id),
      ).toEqual(["valid"]);
    });
  });
});
