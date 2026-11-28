/**
 * Field notebook card reading tiles come from the tent snapshot view the
 * Dashboard tent panel already renders (Cheek, 2026-11-24: the card showed
 * "—" because no readings were wired in).
 *
 * The mapper is pure: the view is built by the caller, and the clock is
 * injected. Zero is a real value. Stale, degraded and unverified readings keep
 * their label. Invalid or unknown readings are never shown as a value.
 */
import { describe, expect, it } from "vitest";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
  type MetricView,
  type TentSnapshotView,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import {
  buildFieldNotebookReadingsByTent,
  fieldNotebookReadingSlotsFromSnapshot,
} from "@/lib/fieldNotebookReadingSlotsRules";

const NOW_MS = Date.parse("2026-11-24T12:00:00.000Z");
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function metric(over: Partial<MetricView> & Pick<MetricView, "key">): MetricView {
  return {
    label: over.key,
    display: "—",
    unit: "",
    chipStatus: "ok",
    status: "ok",
    statusLabel: null,
    ...over,
  };
}

function view(over: Partial<TentSnapshotView> = {}): TentSnapshotView {
  const at = new Date(NOW_MS - 3 * MINUTE_MS).toISOString();
  return {
    hasReading: true,
    sourceLabel: "Live",
    lastUpdatedIso: at,
    lastUpdatedDisplay: "Nov 24, 2026, 5:57 AM",
    stale: false,
    invalid: false,
    provenanceEligible: true,
    canAssessStage: true,
    metrics: [
      metric({ key: "temp", display: "75.2", unit: "°F" }),
      metric({ key: "rh", display: "55", unit: "%" }),
      metric({ key: "vpd", display: "1.31", unit: " kPa" }),
    ],
    ...over,
  };
}

describe("fieldNotebookReadingSlotsFromSnapshot", () => {
  it("maps a fresh live reading to TEMP, RH and VPD with source, age and one capture time", () => {
    const v = view();
    const slots = fieldNotebookReadingSlotsFromSnapshot(v, NOW_MS);
    const capturedAtMs = Date.parse(v.lastUpdatedIso ?? "");
    expect(slots).toEqual([
      { label: "TEMP", value: "75.2°F", source: "Live", ageLabel: "3m ago", capturedAtMs },
      { label: "RH", value: "55%", source: "Live", ageLabel: "3m ago", capturedAtMs },
      { label: "VPD", value: "1.31 kPa", source: "Live", ageLabel: "3m ago", capturedAtMs },
    ]);
  });

  it("keeps a stale reading but labels it Stale, never as the live source", () => {
    const at = new Date(NOW_MS - 14 * DAY_MS).toISOString();
    const slots = fieldNotebookReadingSlotsFromSnapshot(
      view({
        stale: true,
        sourceLabel: "Stale",
        lastUpdatedIso: at,
        metrics: [
          metric({
            key: "temp",
            display: "75.0",
            unit: "°F",
            status: "stale",
            statusLabel: "Stale",
          }),
        ],
      }),
      NOW_MS,
    );
    expect(slots).toEqual([
      {
        label: "TEMP",
        value: "75.0°F",
        source: "Stale",
        ageLabel: "14d ago",
        capturedAtMs: Date.parse(at),
      },
    ]);
  });

  it("names a degraded or unverified metric by its own status, not the cohort source", () => {
    const slots = fieldNotebookReadingSlotsFromSnapshot(
      view({
        metrics: [
          metric({ key: "temp", display: "75.2", unit: "°F" }),
          metric({
            key: "vpd",
            display: "1.10",
            unit: " kPa",
            status: "degraded",
            statusLabel: "Historical",
          }),
        ],
      }),
      NOW_MS,
    );
    expect(slots.map((s) => [s.label, s.source])).toEqual([
      ["TEMP", "Live"],
      ["VPD", "Historical"],
    ]);
  });

  it("leaves off a VPD that comes from another capture, with its own source and age", () => {
    for (const vpd of [
      metric({ key: "vpd", display: "0.90", unit: " kPa", statusLabel: "Manual · 2m ago" }),
      metric({
        key: "vpd",
        display: "0.90",
        unit: " kPa",
        status: "stale",
        statusLabel: "Stale · Manual · 3h ago",
      }),
    ]) {
      const slots = fieldNotebookReadingSlotsFromSnapshot(
        view({ metrics: [metric({ key: "temp", display: "75.2", unit: "°F" }), vpd] }),
        NOW_MS,
      );
      expect(slots.map((s) => s.label)).toEqual(["TEMP"]);
    }
  });

  it("keeps zero as a real reading", () => {
    const slots = fieldNotebookReadingSlotsFromSnapshot(
      view({ metrics: [metric({ key: "temp", display: "0", unit: "°C" })] }),
      NOW_MS,
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.value).toBe("0°C");
  });

  it("never shows an invalid or unknown metric as a value", () => {
    const slots = fieldNotebookReadingSlotsFromSnapshot(
      view({
        metrics: [
          metric({
            key: "temp",
            display: "212.0",
            unit: "°F",
            status: "invalid",
            statusLabel: "Invalid",
          }),
          metric({ key: "rh", display: "—", unit: "%", status: "unknown", statusLabel: "Unknown" }),
          metric({ key: "vpd", display: "  ", unit: " kPa" }),
        ],
      }),
      NOW_MS,
    );
    expect(slots).toEqual([]);
  });

  it("returns no readings for a missing view, no reading, or no verified capture time", () => {
    expect(fieldNotebookReadingSlotsFromSnapshot(null, NOW_MS)).toEqual([]);
    expect(fieldNotebookReadingSlotsFromSnapshot(undefined, NOW_MS)).toEqual([]);
    expect(fieldNotebookReadingSlotsFromSnapshot(view({ hasReading: false }), NOW_MS)).toEqual([]);
    expect(fieldNotebookReadingSlotsFromSnapshot(view({ lastUpdatedIso: null }), NOW_MS)).toEqual(
      [],
    );
    expect(
      fieldNotebookReadingSlotsFromSnapshot(view({ lastUpdatedIso: "not a time" }), NOW_MS),
    ).toEqual([]);
  });

  it("labels a stale cohort from the real snapshot view model", () => {
    const at = new Date(NOW_MS - 20 * DAY_MS).toISOString();
    const rows: BuildTentSnapshotInput[] = [
      {
        ts: at,
        captured_at: at,
        metric: "temperature_c",
        value: 24,
        source: "live",
        quality: "ok",
      },
      { ts: at, captured_at: at, metric: "humidity_pct", value: 55, source: "live", quality: "ok" },
    ] as BuildTentSnapshotInput[];
    const slots = fieldNotebookReadingSlotsFromSnapshot(
      buildTentSnapshotView(rows, "flower", NOW_MS),
      NOW_MS,
    );
    const temp = slots.find((s) => s.label === "TEMP");
    expect(temp?.value).toMatch(/°F$/);
    expect(temp?.source).toBe("Stale");
    expect(temp?.ageLabel).toBe("20d ago");
  });
});

describe("buildFieldNotebookReadingsByTent", () => {
  it("keys readings by tent, with an empty list for a tent with no sensor", () => {
    const stale = view({
      stale: true,
      sourceLabel: "Stale",
      lastUpdatedIso: new Date(NOW_MS - 3 * DAY_MS).toISOString(),
      metrics: [
        metric({ key: "rh", display: "60", unit: "%", status: "stale", statusLabel: "Stale" }),
      ],
    });
    const byTent = buildFieldNotebookReadingsByTent(
      [
        { tentId: "tent-a", view: view() },
        { tentId: "tent-b", view: stale },
        { tentId: "tent-c", view: null },
      ],
      NOW_MS,
    );
    expect(Object.keys(byTent)).toEqual(["tent-a", "tent-b", "tent-c"]);
    expect(byTent["tent-a"]?.map((s) => s.label)).toEqual(["TEMP", "RH", "VPD"]);
    expect(byTent["tent-b"]).toEqual([
      expect.objectContaining({ label: "RH", value: "60%", source: "Stale", ageLabel: "3d ago" }),
    ]);
    expect(byTent["tent-c"]).toEqual([]);
  });

  it("keeps the first entry for a repeated tent id and skips a blank id", () => {
    const byTent = buildFieldNotebookReadingsByTent(
      [
        { tentId: "tent-a", view: view() },
        { tentId: "tent-a", view: null },
        { tentId: "", view: view() },
      ],
      NOW_MS,
    );
    expect(Object.keys(byTent)).toEqual(["tent-a"]);
    expect(byTent["tent-a"]).toHaveLength(3);
  });

  it("is deterministic for the same input", () => {
    const input = [{ tentId: "tent-a", view: view() }];
    expect(buildFieldNotebookReadingsByTent(input, NOW_MS)).toEqual(
      buildFieldNotebookReadingsByTent(input, NOW_MS),
    );
  });
});
