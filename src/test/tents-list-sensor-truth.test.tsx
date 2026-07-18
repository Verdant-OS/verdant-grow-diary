/**
 * Tents list — SENSOR TRUTH regression suite (2026-07-16 walkthrough defect).
 *
 * Defect: /tents cards selected the OLDEST reading (`.at(-1)` over the
 * newest-first array from growRepo) and fabricated 0 for missing metrics,
 * which the C→F display conversion rendered as a fake "32.0°F" (and a fake
 * "0 kPa" VPD) presented as current, with no timestamp/source/staleness
 * context on the card.
 *
 * Pins:
 *  1. newest-reading selection — the card presenter reads the latest ts
 *     group, never the oldest;
 *  2. missing metric → "—" / unknown status, never 0 (and never 32.0°F via
 *     unit conversion of a fabricated 0);
 *  3. stale labeling parity with the Tent Detail presenter (both derive
 *     staleness from the shared isStale contract on the same rows);
 *  4. static wiring — Tents.tsx uses the shared Dashboard-strip presenter +
 *     per-tent readings hook, renders source + last-updated context, and the
 *     legacy `.at(-1)` / `?? 0` fabrication shapes are gone.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { buildTentSensorHeaderView } from "@/lib/tentSensorChartRules";

// ---- Page render fixtures (hoisted: vi.mock factories run before imports) --
const H = vi.hoisted(() => {
  const TENT_ID = "5a1c6e0f-2b3d-4c5e-8f90-1a2b3c4d5e6f";
  // Relative timestamps so the page's real Date.now() staleness check is
  // deterministic: newest is 2h old (stale), oldest is 4h old.
  const newestTs = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const oldestTs = new Date(Date.now() - 4 * 3_600_000).toISOString();
  const raw = (ts: string, metric: string, value: number) => ({
    id: `${metric}-${ts}`,
    tent_id: TENT_ID,
    ts,
    metric,
    value,
    source: "manual",
    captured_at: ts,
  });
  // Walkthrough shape: newest group has temp+RH but NO VPD row; the
  // oldest group has RH 58 (and no temperature). The legacy card showed
  // the oldest group and fabricated temp 0 → "32.0°F".
  const ROWS = [
    raw(newestTs, "temperature_c", 21.78),
    raw(newestTs, "humidity_pct", 56),
    raw(oldestTs, "humidity_pct", 58),
    raw(oldestTs, "vpd_kpa", 0.9),
  ];
  const makeTent = (id: string, name: string) => ({
    id,
    name,
    brand: "Gorilla",
    size: "4x4",
    stage: "veg",
    light: { on: true, schedule: "18/6", wattage: 240 },
    alertCount: 0,
    growId: null,
  });
  // Mutable per-test hook state so render tests can drive pending/error/
  // success outcomes (and the tent set) through the same mocks.
  const hookState = {
    tents: [makeTent(TENT_ID, "Walkthrough Tent")] as ReturnType<typeof makeTent>[],
    byTent: { [TENT_ID]: ROWS } as Record<string, unknown[]>,
    statusByTent: { [TENT_ID]: "success" } as Record<string, string>,
    isLoading: false,
    isError: false,
    growIsLoading: false,
    growIsError: false,
    /** Tent ids the sensor hook was last called with (for UUID-guard pins). */
    lastRequestedIds: [] as string[],
  };
  const resetHookState = () => {
    hookState.tents = [makeTent(TENT_ID, "Walkthrough Tent")];
    hookState.byTent = { [TENT_ID]: ROWS };
    hookState.statusByTent = { [TENT_ID]: "success" };
    hookState.isLoading = false;
    hookState.isError = false;
    hookState.growIsLoading = false;
    hookState.growIsError = false;
    hookState.lastRequestedIds = [];
  };
  return { TENT_ID, newestTs, oldestTs, ROWS, raw, makeTent, hookState, resetHookState };
});

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTents: () => ({
      data: H.hookState.tents,
      isLoading: H.hookState.growIsLoading,
      isError: H.hookState.growIsError,
      refetch: vi.fn(),
    }),
    useGrowPlants: () => ({
      data: [],
      isLoading: H.hookState.growIsLoading,
      isError: H.hookState.growIsError,
      refetch: vi.fn(),
    }),
    getGrowDataMeta: () => ({
      isDemoData: false,
      dataSource: "supabase",
      sourceReason: "live",
    }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (tentIds: string[]) => {
    H.hookState.lastRequestedIds = tentIds;
    return {
      byTent: H.hookState.byTent,
      statusByTent: H.hookState.statusByTent,
      isLoading: H.hookState.isLoading,
      isError: H.hookState.isError,
    };
  },
}));

vi.mock("@/hooks/useScopedGrow", () => ({
  useScopedGrow: () => ({
    urlGrowId: null,
    scopedGrowName: null,
    isValidScopedGrow: false,
    backHref: null,
  }),
}));

// Dialog/menu pull in supabase + auth + entitlements, and breadcrumbs read
// the grows store; all irrelevant to the sensor-truth pins under test.
vi.mock("@/components/CreateTentDialog", () => ({ default: () => null }));
vi.mock("@/components/TentCardActionsMenu", () => ({ default: () => null }));
vi.mock("@/components/GrowBreadcrumbs", () => ({ default: () => null }));

import Tents from "@/pages/Tents";

const TENTS_SRC = readFileSync(resolve(__dirname, "../pages/Tents.tsx"), "utf8");

const NOW = new Date("2026-07-16T12:00:00Z").getTime();
const FRESH_TS = "2026-07-16T11:55:00Z";
const NEWEST_TS = "2026-07-16T08:00:00Z"; // > 30 min old → stale
const OLDEST_TS = "2026-07-16T06:00:00Z";

function row(over: Partial<BuildTentSnapshotInput>): BuildTentSnapshotInput {
  return {
    ts: NEWEST_TS,
    metric: "temperature_c",
    value: 21.78,
    source: "manual",
    captured_at: null,
    ...over,
  };
}

/**
 * Walkthrough-shaped fixture, newest-first (matching the hook's `ts` desc
 * ordering): the newest reading has temp 21.78°C (71.2°F) + RH 56 and NO
 * VPD row; an older reading carries RH 58 + VPD. The legacy card rendered
 * the OLDEST group and fabricated temp 0 → "32.0°F".
 */
const WALKTHROUGH_ROWS: BuildTentSnapshotInput[] = [
  row({ ts: NEWEST_TS, metric: "temperature_c", value: 21.78 }),
  row({ ts: NEWEST_TS, metric: "humidity_pct", value: 56 }),
  row({ ts: OLDEST_TS, metric: "humidity_pct", value: 58 }),
  row({ ts: OLDEST_TS, metric: "vpd_kpa", value: 0.9 }),
];

function metric(view: ReturnType<typeof buildTentSnapshotView>, key: "temp" | "rh" | "vpd") {
  const m = view.metrics.find((x) => x.key === key);
  expect(m).toBeTruthy();
  return m!;
}

describe("Tents list sensor truth — newest-reading selection", () => {
  it("renders the newest reading's values, not the oldest group's", () => {
    const v = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    expect(metric(v, "temp").display).toBe("71.2");
    expect(metric(v, "rh").display).toBe("56.0");
    // Values from the OLDEST group must not leak into the card.
    expect(metric(v, "rh").display).not.toBe("58.0");
    expect(v.lastUpdatedIso).toBe(NEWEST_TS);
  });
});

describe("Tents list sensor truth — missing metrics are never fabricated", () => {
  it("VPD missing at the newest ts renders as unavailable, not 0", () => {
    const v = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    const vpd = metric(v, "vpd");
    expect(vpd.display).toBe("—");
    expect(vpd.status).toBe("unknown");
    expect(vpd.statusLabel).toBe("Unknown");
    // The older group's VPD (0.9) must not backfill the newest snapshot.
    expect(vpd.display).not.toBe("0.90");
  });

  it("missing temperature renders as unavailable — never 32.0°F from a fabricated 0", () => {
    const v = buildTentSnapshotView(
      [row({ ts: NEWEST_TS, metric: "humidity_pct", value: 58 })],
      "veg",
      NOW,
    );
    const temp = metric(v, "temp");
    expect(temp.display).toBe("—");
    expect(temp.status).toBe("unknown");
    expect(temp.display).not.toBe("32.0");
    expect(temp.display).not.toBe("0.0");
  });

  it("no metric ever displays a zero the rows do not contain", () => {
    const v = buildTentSnapshotView(
      [row({ ts: NEWEST_TS, metric: "humidity_pct", value: 58 })],
      "veg",
      NOW,
    );
    for (const m of v.metrics) {
      expect(["0.0", "0.00", "32.0"]).not.toContain(m.display);
    }
  });
});

describe("Tents list sensor truth — stale labeling parity with Tent Detail", () => {
  it("old readings are stale on BOTH the list presenter and the detail presenter", () => {
    const listView = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    const detailHeader = buildTentSensorHeaderView(WALKTHROUGH_ROWS, NOW);
    expect(detailHeader.stale).toBe(true);
    expect(listView.stale).toBe(true);
    expect(listView.stale).toBe(detailHeader.stale);
    // The card's source chip must say Stale, not impersonate a live source.
    expect(listView.sourceLabel).toBe("Stale");
    // Present metrics carry a per-metric Stale label.
    expect(metric(listView, "temp").statusLabel).toBe("Stale");
    expect(metric(listView, "rh").statusLabel).toBe("Stale");
  });

  it("a missing metric never relabels the snapshot Invalid — Stale context survives", () => {
    // evaluateSensorQuality flags an absent VPD as a review hint; the card
    // label must still say Stale (missing ≠ implausible).
    const v = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    expect(v.invalid).toBe(false);
    expect(v.sourceLabel).toBe("Stale");
  });

  it("a present-but-implausible value still labels the snapshot Invalid", () => {
    const v = buildTentSnapshotView(
      [
        row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78 }),
        row({ ts: FRESH_TS, metric: "humidity_pct", value: 0 }), // sensor fault
        row({ ts: FRESH_TS, metric: "vpd_kpa", value: 1.1 }),
      ],
      "veg",
      NOW,
    );
    expect(v.invalid).toBe(true);
    expect(v.sourceLabel).toBe("Invalid");
  });

  it("fresh readings are not stale on either presenter", () => {
    const rows = [
      row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78 }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56 }),
    ];
    const listView = buildTentSnapshotView(rows, "veg", NOW);
    const detailHeader = buildTentSensorHeaderView(rows, NOW);
    expect(detailHeader.stale).toBe(false);
    expect(listView.stale).toBe(false);
    expect(listView.stale).toBe(detailHeader.stale);
    expect(metric(listView, "temp").statusLabel).toBeNull();
  });
});

describe("Tents list sensor truth — intake quality flags are authoritative", () => {
  it("a plausible value flagged quality:'invalid' is never OK and never Live", () => {
    const rows = [
      row({
        ts: FRESH_TS,
        metric: "temperature_c",
        value: 21.78,
        source: "live",
        quality: "invalid",
      }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "live" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    const temp = metric(v, "temp");
    expect(temp.status).toBe("invalid");
    expect(temp.statusLabel).toBe("Invalid");
    expect(v.invalid).toBe(true);
    expect(v.sourceLabel).toBe("Invalid");
    expect(v.sourceLabel).not.toMatch(/live/i);
  });

  it("a fresh row flagged quality:'stale' never renders fresh", () => {
    const rows = [
      row({
        ts: FRESH_TS,
        metric: "temperature_c",
        value: 21.78,
        quality: "stale",
      }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56 }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    expect(v.stale).toBe(true);
    expect(v.sourceLabel).toBe("Stale");
    expect(metric(v, "temp").statusLabel).toBe("Stale");
  });

  it("quality:'degraded' on a fresh live row is never healthy and never plain-ok", () => {
    const rows = [
      row({
        ts: FRESH_TS,
        metric: "temperature_c",
        value: 21.78,
        source: "live",
        quality: "degraded",
      }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "live" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    const temp = metric(v, "temp");
    expect(temp.status).toBe("degraded");
    expect(temp.statusLabel).toBe("Degraded");
    expect(temp.chipStatus).not.toBe("ok");
    // Provenance is a separate axis: source stays truthful, but the
    // flagged metric itself never presents as healthy.
    const rh = metric(v, "rh");
    expect(rh.status).toBe("ok");
  });

  it("chip color is capped by status — flagged metrics never render a green chip", () => {
    // Plausible in-target values that would classify "ok" against stage
    // targets, but explicitly flagged by intake.
    const invalidView = buildTentSnapshotView(
      [
        row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78, quality: "invalid" }),
        row({ ts: FRESH_TS, metric: "humidity_pct", value: 56 }),
      ],
      "veg",
      NOW,
    );
    expect(metric(invalidView, "temp").chipStatus).toBe("bad");

    const staleView = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    for (const m of staleView.metrics) {
      if (m.status === "stale") expect(m.chipStatus).not.toBe("ok");
    }
  });

  it("an 'ok' quality flag grants nothing extra", () => {
    const rows = [
      row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78, quality: "ok" }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, quality: "ok" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    expect(v.invalid).toBe(false);
    expect(v.stale).toBe(false);
    // Default row() source is "manual" — an ok quality flag must not
    // promote provenance.
    expect(v.sourceLabel).toBe("Manual");
  });
});

describe("Tents list sensor truth — canonical source vocabulary", () => {
  it("all-demo readings label Demo, never Live", () => {
    const rows = [
      row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78, source: "demo" }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "demo" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    expect(v.sourceLabel).toBe("Demo");
    expect(v.sourceLabel).not.toMatch(/live/i);
  });

  it("canonical source 'invalid' labels Invalid even when values look plausible and fresh", () => {
    const rows = [
      row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78, source: "invalid" }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "invalid" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    expect(v.invalid).toBe(true);
    expect(v.sourceLabel).toBe("Invalid");
  });

  it("canonical source 'stale' labels Stale even when the timestamp is fresh", () => {
    const rows = [
      row({ ts: FRESH_TS, metric: "temperature_c", value: 21.78, source: "stale" }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "stale" }),
    ];
    const v = buildTentSnapshotView(rows, "veg", NOW);
    expect(v.stale).toBe(true);
    expect(v.sourceLabel).toBe("Stale");
  });
});

describe("Tents list sensor truth — pi_bridge provenance parity with Tent Detail", () => {
  const bridgeRow = (over: Partial<BuildTentSnapshotInput>): BuildTentSnapshotInput =>
    row({ source: "pi_bridge", ...over });

  it("fresh bridge readings classify as live on BOTH presenters — never Unknown", () => {
    const rows = [
      bridgeRow({ ts: FRESH_TS, metric: "temperature_c", value: 21.78 }),
      bridgeRow({ ts: FRESH_TS, metric: "humidity_pct", value: 56 }),
    ];
    const listView = buildTentSnapshotView(rows, "veg", NOW);
    const detailHeader = buildTentSensorHeaderView(rows, NOW);
    // Detail path: strict reservation in snapshotFromReadings → "Live sensor".
    expect(detailHeader.sourceLabel).toBe("Live sensor");
    // List path must agree on the provenance class, not drop to Unknown.
    expect(listView.sourceLabel).toBe("Live");
    expect(listView.provenanceEligible).toBe(true);
    expect(listView.canAssessStage).toBe(true);
    expect(listView.sourceLabel).not.toBe("Unknown");
  });

  it("stale bridge readings label Stale on the list, matching detail's stale flag", () => {
    const rows = [
      bridgeRow({ metric: "temperature_c", value: 21.78 }), // NEWEST_TS → stale
      bridgeRow({ metric: "humidity_pct", value: 56 }),
    ];
    const listView = buildTentSnapshotView(rows, "veg", NOW);
    const detailHeader = buildTentSensorHeaderView(rows, NOW);
    expect(detailHeader.stale).toBe(true);
    expect(listView.stale).toBe(true);
    expect(listView.sourceLabel).toBe("Stale");
  });

  it("a mixed latest group (bridge + unrecognized junk) is never promoted to live", () => {
    const rows = [
      bridgeRow({ ts: FRESH_TS, metric: "temperature_c", value: 21.78 }),
      row({ ts: FRESH_TS, metric: "humidity_pct", value: 56, source: "junk-vendor" }),
    ];
    const listView = buildTentSnapshotView(rows, "veg", NOW);
    const detailHeader = buildTentSensorHeaderView(rows, NOW);
    expect(listView.sourceLabel).not.toMatch(/live/i);
    expect(listView.provenanceEligible).toBe(false);
    expect(listView.canAssessStage).toBe(false);
    for (const item of listView.metrics) {
      expect(item.status).not.toBe("ok");
      expect(item.chipStatus).not.toBe("ok");
    }
    expect(detailHeader.sourceLabel).not.toMatch(/^Live/);
  });
});

describe("Tents list sensor truth — temperature unit preference", () => {
  it("defaults to °F (Dashboard-strip behavior unchanged)", () => {
    const v = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW);
    const temp = metric(v, "temp");
    expect(temp.display).toBe("71.2");
    expect(temp.unit).toBe("°F");
  });

  it("honors an explicit celsius preference without double-converting", () => {
    const v = buildTentSnapshotView(WALKTHROUGH_ROWS, "veg", NOW, {
      temperatureUnit: "celsius",
    });
    const temp = metric(v, "temp");
    expect(temp.display).toBe("21.8");
    expect(temp.unit).toBe("°C");
  });

  it("celsius preference still never fabricates a missing temperature", () => {
    const v = buildTentSnapshotView(
      [row({ ts: NEWEST_TS, metric: "humidity_pct", value: 58 })],
      "veg",
      NOW,
      { temperatureUnit: "celsius" },
    );
    expect(metric(v, "temp").display).toBe("—");
  });
});

describe("Tents list sensor truth — rendered page (walkthrough regression)", () => {
  afterEach(() => {
    H.resetHookState();
    vi.useRealTimers();
  });

  it("a failed tent/plant read owns the page and suppresses setup, disclosure, and counts", () => {
    H.hookState.growIsError = true;
    H.hookState.tents = [];
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("tents-grow-data-error")).toHaveTextContent(
      /This is not an empty grow/,
    );
    expect(screen.queryByTestId("tents-data-source-disclosure")).toBeNull();
    expect(screen.queryByText("No tents yet")).toBeNull();
    expect(screen.queryByText(/0 plants/)).toBeNull();
  });

  it("an unresolved tent/plant read renders only a loading boundary, never empty-grow UI", () => {
    H.hookState.growIsLoading = true;
    H.hookState.tents = [];
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("tents-grow-data-loading")).toHaveTextContent(/Loading tent data/);
    expect(screen.queryByTestId("tents-data-source-disclosure")).toBeNull();
    expect(screen.queryByText("No tents yet")).toBeNull();
  });

  it("pending reads render a loading state, never 'No sensor data yet'", () => {
    H.hookState.byTent = { [H.TENT_ID]: [] };
    H.hookState.statusByTent = { [H.TENT_ID]: "loading" };
    H.hookState.isLoading = true;
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    expect(screen.getByTestId(`tents-list-sensor-loading-${H.TENT_ID}`)).toHaveTextContent(
      /Loading sensor data/,
    );
    expect(screen.queryByText(/No sensor data yet/)).toBeNull();
  });

  it("failed reads render an unavailable state, never 'No sensor data yet'", () => {
    H.hookState.byTent = { [H.TENT_ID]: [] };
    H.hookState.statusByTent = { [H.TENT_ID]: "error" };
    H.hookState.isError = true;
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    expect(screen.getByTestId(`tents-list-sensor-unavailable-${H.TENT_ID}`)).toHaveTextContent(
      /Sensor data unavailable/,
    );
    expect(screen.queryByText(/No sensor data yet/)).toBeNull();
  });

  it("mock-fallback tents (non-UUID ids) are never queried and render honest no-data", () => {
    // Mock tent ids ("t1") cannot exist in the uuid tent_id column: querying
    // them 400s, which would mislabel every demo card "unavailable".
    H.hookState.tents = [H.makeTent("t1", "Demo Tent")];
    H.hookState.byTent = {};
    H.hookState.statusByTent = {};
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    // The sensor hook must not receive the non-UUID id at all.
    expect(H.hookState.lastRequestedIds).toEqual([]);
    // Absence is established by construction — no loading, no error state.
    expect(screen.getByTestId("tents-list-sensor-empty-t1")).toHaveTextContent(
      /No sensor data yet/,
    );
    expect(screen.queryByTestId("tents-list-sensor-loading-t1")).toBeNull();
    expect(screen.queryByTestId("tents-list-sensor-unavailable-t1")).toBeNull();
  });

  it("an established empty result still renders 'No sensor data yet'", () => {
    H.hookState.byTent = { [H.TENT_ID]: [] };
    H.hookState.statusByTent = { [H.TENT_ID]: "success" };
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    expect(screen.getByTestId(`tents-list-sensor-empty-${H.TENT_ID}`)).toHaveTextContent(
      /No sensor data yet/,
    );
  });

  it("an open tab flips fresh labels to Stale once the boundary passes", () => {
    vi.useFakeTimers();
    // 29 minutes old at first paint — inside the 30-minute fresh window.
    const nearBoundaryTs = new Date(Date.now() - 29 * 60_000).toISOString();
    H.hookState.byTent = {
      [H.TENT_ID]: [
        H.raw(nearBoundaryTs, "temperature_c", 21.78),
        H.raw(nearBoundaryTs, "humidity_pct", 56),
      ],
    };
    H.hookState.statusByTent = { [H.TENT_ID]: "success" };
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );
    const source = screen.getByTestId(`tents-list-sensor-source-${H.TENT_ID}`);
    expect(source).toHaveTextContent("Manual");
    expect(source).not.toHaveTextContent("Stale");

    // Cross the 30-minute boundary with NO new data — the minute tick must
    // re-evaluate freshness without a re-fetch.
    act(() => {
      vi.advanceTimersByTime(2 * 60_000);
    });
    expect(screen.getByTestId(`tents-list-sensor-source-${H.TENT_ID}`)).toHaveTextContent("Stale");
    expect(screen.getByTestId(`tents-list-metric-${H.TENT_ID}-temp`)).toHaveTextContent("Stale");
  });

  it("card shows the newest reading with honest stale/source/no-data labels — never 32.0°F", () => {
    render(
      <MemoryRouter>
        <Tents />
      </MemoryRouter>,
    );

    // Newest reading's temperature (21.78°C → 71.2°F), not a fabricated 0°C.
    const temp = screen.getByTestId(`tents-list-metric-${H.TENT_ID}-temp`);
    expect(temp).toHaveTextContent("71.2");
    expect(temp).not.toHaveTextContent("32.0");
    expect(temp).toHaveTextContent("Stale");

    // Newest RH (56), not the older group's 58.
    const rh = screen.getByTestId(`tents-list-metric-${H.TENT_ID}-rh`);
    expect(rh).toHaveTextContent("56.0");
    expect(rh).not.toHaveTextContent("58");

    // VPD missing at the newest ts → unavailable, never 0 kPa.
    const vpd = screen.getByTestId(`tents-list-metric-${H.TENT_ID}-vpd`);
    expect(vpd).toHaveTextContent("—");
    expect(vpd).toHaveTextContent("Unknown");
    expect(vpd).not.toHaveTextContent("0.9");

    // Honest freshness/source context, consistent with the detail page.
    expect(screen.getByTestId(`tents-list-sensor-source-${H.TENT_ID}`)).toHaveTextContent("Stale");
    expect(screen.getByTestId(`tents-list-sensor-last-updated-${H.TENT_ID}`)).toHaveTextContent(
      /Last updated/,
    );

    // The fabricated freezing-point reading must not appear anywhere.
    expect(screen.queryByText(/32\.0/)).toBeNull();
  });
});

describe("Tents list sensor truth — static wiring", () => {
  it("legacy oldest-reading selection and zero-fabrication shapes are gone", () => {
    expect(TENTS_SRC).not.toMatch(/\.at\(-1\)/);
    expect(TENTS_SRC).not.toMatch(/\?\?\s*0\)\.toFixed/);
    expect(TENTS_SRC).not.toMatch(/useGrowSensorReadings/);
  });

  it("uses the shared per-tent hook + Dashboard-strip presenter", () => {
    expect(TENTS_SRC).toMatch(/useSensorReadingsByTents/);
    expect(TENTS_SRC).toMatch(/buildTentSnapshotView/);
    expect(TENTS_SRC).toMatch(
      /buildTentSnapshotView\(\s*\(readingsByTent\[t\.id\]\s*\?\?\s*\[\]\)[\s\S]*?t\.stage/,
    );
  });

  it("renders honest freshness/source context on the card", () => {
    expect(TENTS_SRC).toMatch(/tents-list-sensor-source-/);
    expect(TENTS_SRC).toMatch(/tents-list-sensor-last-updated-/);
    expect(TENTS_SRC).toMatch(/Last updated \{snapView\.lastUpdatedDisplay\}/);
    expect(TENTS_SRC).toMatch(/tents-list-metric-status-/);
  });

  it("renders an honest no-data state instead of silence or zeros", () => {
    expect(TENTS_SRC).toMatch(/tents-list-sensor-empty-/);
    expect(TENTS_SRC).toMatch(/No sensor data yet/);
  });

  it("distinguishes pending/failed reads from established absence", () => {
    expect(TENTS_SRC).toMatch(/statusByTent/);
    expect(TENTS_SRC).toMatch(/tents-list-sensor-loading-/);
    expect(TENTS_SRC).toMatch(/tents-list-sensor-unavailable-/);
  });

  it("only queries real UUID tent ids (mock-fallback ids short-circuit)", () => {
    expect(TENTS_SRC).toMatch(/from\s+["']@\/lib\/isUuid["']/);
    expect(TENTS_SRC).toMatch(/\.filter\(\(id\) => isUuid\(id\)\)/);
    expect(TENTS_SRC).toMatch(/isUuid\(t\.id\)/);
  });

  it("drives freshness from a ticking clock, not a render-time Date.now()", () => {
    // The interval lives in the shared useNowTick hook (used by the
    // Dashboard strip too); the page must consume it and feed the presenter.
    expect(TENTS_SRC).toMatch(/useNowTick/);
    expect(TENTS_SRC).toMatch(/buildTentSnapshotView\(\s*\(readingsByTent\[t\.id\][\s\S]*?nowTick/);
  });

  it("introduces no alert/queue/automation/device-control surfaces", () => {
    expect(TENTS_SRC).not.toMatch(/service_role|action_queue/);
    expect(TENTS_SRC).not.toMatch(/saveAlert\(|logAlertEvent\(/);
  });
});
