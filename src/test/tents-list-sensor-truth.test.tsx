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
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
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
  return {
    TENT_ID,
    newestTs,
    oldestTs,
    // Walkthrough shape: newest group has temp+RH but NO VPD row; the
    // oldest group has RH 58 (and no temperature). The legacy card showed
    // the oldest group and fabricated temp 0 → "32.0°F".
    ROWS: [
      raw(newestTs, "temperature_c", 21.78),
      raw(newestTs, "humidity_pct", 56),
      raw(oldestTs, "humidity_pct", 58),
      raw(oldestTs, "vpd_kpa", 0.9),
    ],
  };
});

vi.mock("@/hooks/useGrowData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useGrowData")>();
  return {
    ...actual,
    useGrowTents: () => ({
      data: [
        {
          id: H.TENT_ID,
          name: "Walkthrough Tent",
          brand: "Gorilla",
          size: "4x4",
          stage: "veg",
          light: { on: true, schedule: "18/6", wattage: 240 },
          alertCount: 0,
          growId: null,
        },
      ],
      isLoading: false,
    }),
    useGrowPlants: () => ({ data: [] }),
    getGrowDataMeta: () => ({
      isDemoData: false,
      dataSource: "supabase",
      sourceReason: "live",
    }),
  };
});

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: () => ({
    byTent: { [H.TENT_ID]: H.ROWS },
    isLoading: false,
    isError: false,
  }),
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

  it("introduces no alert/queue/automation/device-control surfaces", () => {
    expect(TENTS_SRC).not.toMatch(/service_role|action_queue/);
    expect(TENTS_SRC).not.toMatch(/saveAlert\(|logAlertEvent\(/);
  });
});
