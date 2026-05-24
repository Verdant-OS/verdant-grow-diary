/**
 * Recent manual snapshots — compact tent history list.
 *
 * Audit + render coverage for `TentManualSnapshotHistoryList` mounted in
 * `TentDetail`. Read-only derived UI. No new schema, persistence, RPC,
 * sensor ingestion, alerts, action_queue, automation, device control, or
 * service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import TentManualSnapshotHistoryList from "@/components/TentManualSnapshotHistoryList";
import {
  buildManualSnapshotHistoryList,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
} from "@/lib/manualSensorSnapshotHistoryListRules";
import type { SensorReadingRow } from "@/lib/db";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const COMPONENT = read("src/components/TentManualSnapshotHistoryList.tsx");
const RULES = read("src/lib/manualSensorSnapshotHistoryListRules.ts");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");

const TENT_A = "tent-a";
const TENT_B = "tent-b";

function row(
  ts: string,
  metric: string,
  value: number | null,
  source: string,
  tent_id: string,
): SensorReadingRow {
  return {
    id: `${tent_id}-${ts}-${metric}-${source}`,
    ts,
    metric,
    value,
    source,
    tent_id,
    plant_id: null,
    user_id: "u",
    created_at: ts,
    confidence: null,
    raw_payload: null,
    captured_at: null,
  } as unknown as SensorReadingRow;
}

function manualSnapshot(ts: string, tentId: string, m: Record<string, number | null>) {
  return Object.entries(m).map(([metric, value]) =>
    row(ts, metric, value, "manual", tentId),
  );
}

const T = [
  "2026-05-19T09:00:00Z",
  "2026-05-20T09:00:00Z",
  "2026-05-21T09:00:00Z",
  "2026-05-22T09:00:00Z",
  "2026-05-23T09:00:00Z",
  "2026-05-24T09:00:00Z",
  "2026-05-25T09:00:00Z",
];

describe("Tent manual snapshot history — audit", () => {
  it("TentDetail mounts the compact history list", () => {
    expect(TENT_DETAIL).toContain("TentManualSnapshotHistoryList");
    expect(TENT_DETAIL).toMatch(
      /from\s+["']@\/components\/TentManualSnapshotHistoryList["']/,
    );
  });

  it("filtering/grouping/delta logic lives outside JSX (uses pure helpers)", () => {
    expect(COMPONENT).toContain("buildManualSnapshotHistoryList");
    // No raw metric arithmetic inside the component body.
    expect(COMPONENT).not.toMatch(/value\s*[-+*/]\s*value/);
  });

  it("does not introduce schema, persistence, RPC, alerts, action_queue, automation, device control, or service_role", () => {
    const FORBIDDEN = [
      "service_role",
      ".insert(",
      ".update(",
      ".delete(",
      ".rpc(",
      "action_queue",
      "alerts",
      "mqtt",
      "home_assistant",
      "pi_bridge",
      "actuator",
      "device_command",
      "autopilot",
    ];
    for (const needle of FORBIDDEN) {
      expect(COMPONENT).not.toContain(needle);
      expect(RULES).not.toContain(needle);
    }
  });

  it("does not use forbidden wording", () => {
    for (const word of ["perfect", "completed", "guaranteed healthy"]) {
      expect(COMPONENT.toLowerCase()).not.toContain(word);
      expect(RULES.toLowerCase()).not.toContain(word);
    }
  });
});

describe("buildManualSnapshotHistoryList — pure rules", () => {
  it("limits results to the configured count (clamped to MAX)", () => {
    const rows: SensorReadingRow[] = [];
    for (let i = 0; i < 7; i++) {
      rows.push(...manualSnapshot(T[i], TENT_A, { temperature_c: 20 + i }));
    }
    const list = buildManualSnapshotHistoryList(rows, {
      tentId: TENT_A,
      limit: 99,
    });
    expect(list.length).toBe(MAX_HISTORY_LIMIT);
    // newest-first
    expect(new Date(list[0].ts).toISOString()).toBe(new Date(T[6]).toISOString());
  });

  it("excludes demo / live / imported / non-manual readings", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24 }),
      row(T[1], "temperature_c", 25, "demo", TENT_A),
      row(T[2], "temperature_c", 26, "live", TENT_A),
      row(T[3], "temperature_c", 27, "csv", TENT_A),
      row(T[4], "temperature_c", 28, "home_assistant", TENT_A),
    ];
    const list = buildManualSnapshotHistoryList(rows, { tentId: TENT_A });
    expect(list.length).toBe(1);
    expect(new Date(list[0].ts).toISOString()).toBe(new Date(T[0]).toISOString());
  });

  it("restricts to the requested tent", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24 }),
      ...manualSnapshot(T[1], TENT_B, { temperature_c: 30 }),
    ];
    const list = buildManualSnapshotHistoryList(rows, { tentId: TENT_A });
    expect(list.every((e) => e.metrics.length > 0)).toBe(true);
    expect(list.length).toBe(1);
  });

  it("metric chip order is deterministic regardless of input ordering", () => {
    const rows = manualSnapshot(T[0], TENT_A, {
      reservoir_ph: 6.1,
      co2_ppm: 800,
      temperature_c: 24,
      humidity_pct: 55,
      vpd_kpa: 1.1,
    });
    const [entry] = buildManualSnapshotHistoryList(rows, { tentId: TENT_A });
    expect(entry.metrics.map((m) => m.key)).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
      "reservoir_ph",
    ]);
  });

  it("omits missing/invalid metrics instead of guessing", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24 }),
      row(T[0], "humidity_pct", Number.NaN, "manual", TENT_A),
      row(T[0], "co2_ppm", null, "manual", TENT_A),
    ];
    const [entry] = buildManualSnapshotHistoryList(rows, { tentId: TENT_A });
    expect(entry.metrics.map((m) => m.key)).toEqual(["temperature_c"]);
  });

  it("marks earliest displayed snapshot as firstSnapshot and computes deltas for later ones", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24, humidity_pct: 55 }),
      ...manualSnapshot(T[1], TENT_A, { temperature_c: 25, humidity_pct: 51 }),
    ];
    const list = buildManualSnapshotHistoryList(rows, { tentId: TENT_A });
    expect(list[0].firstSnapshot).toBe(false);
    expect(list[0].deltas.map((d) => d.key)).toEqual([
      "temperature_c",
      "humidity_pct",
    ]);
    expect(list[1].firstSnapshot).toBe(true);
    expect(list[1].deltas.length).toBe(0);
  });
});

describe("TentManualSnapshotHistoryList — render", () => {
  it("renders empty state when no manual snapshots exist for this tent", () => {
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={[]} />);
    expect(
      screen.getByTestId("tent-manual-snapshot-history-empty"),
    ).toBeInTheDocument();
  });

  it("renders timestamp, Manual source label, and metric chips per snapshot", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, {
        temperature_c: 24,
        humidity_pct: 55,
        vpd_kpa: 1.1,
        co2_ppm: 800,
      }),
    ];
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={rows} />);
    const items = screen.getAllByTestId("tent-manual-snapshot-history-item");
    expect(items.length).toBe(1);
    expect(
      within(items[0]).getByTestId("tent-manual-snapshot-history-source"),
    ).toHaveTextContent(/Manual/i);
    expect(
      within(items[0]).getByTestId("tent-manual-snapshot-history-ts"),
    ).toBeInTheDocument();
    const metrics = within(items[0]).getAllByTestId(
      "tent-manual-snapshot-history-metric",
    );
    expect(metrics.map((m) => m.getAttribute("data-metric"))).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
      "co2_ppm",
    ]);
  });

  it("shows first-snapshot copy on the earliest displayed entry and changed-since-previous on later ones", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24, humidity_pct: 55 }),
      ...manualSnapshot(T[1], TENT_A, { temperature_c: 25, humidity_pct: 51 }),
    ];
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={rows} />);
    const items = screen.getAllByTestId("tent-manual-snapshot-history-item");
    expect(items.length).toBe(2);
    const latestChange = within(items[0]).getByTestId(
      "tent-manual-snapshot-history-change",
    );
    expect(latestChange).toHaveAttribute("data-state", "changed");
    expect(latestChange).toHaveTextContent(/Changed since previous snapshot/i);
    const earliestChange = within(items[1]).getByTestId(
      "tent-manual-snapshot-history-change",
    );
    expect(earliestChange).toHaveAttribute("data-state", "first-snapshot");
    expect(earliestChange).toHaveTextContent(/First snapshot for this tent/i);
  });

  it("excludes demo/live/imported readings from the rendered list", () => {
    const rows = [
      row(T[1], "temperature_c", 25, "demo", TENT_A),
      row(T[2], "temperature_c", 26, "live", TENT_A),
    ];
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={rows} />);
    expect(
      screen.getByTestId("tent-manual-snapshot-history-empty"),
    ).toBeInTheDocument();
    expect(
      screen.queryAllByTestId("tent-manual-snapshot-history-item").length,
    ).toBe(0);
  });

  it("only includes manual snapshots from the active tent", () => {
    const rows = [
      ...manualSnapshot(T[0], TENT_A, { temperature_c: 24 }),
      ...manualSnapshot(T[1], TENT_B, { temperature_c: 99 }),
    ];
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={rows} />);
    const items = screen.getAllByTestId("tent-manual-snapshot-history-item");
    expect(items.length).toBe(1);
    const metrics = within(items[0]).getAllByTestId(
      "tent-manual-snapshot-history-metric",
    );
    // Other tent's 99°C must not appear.
    expect(metrics[0]).not.toHaveTextContent(/210.2/);
  });

  it("renders nothing when tentId is null", () => {
    const rows = manualSnapshot(T[0], TENT_A, { temperature_c: 24 });
    const { container } = render(
      <TentManualSnapshotHistoryList tentId={null} readings={rows} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("caps the rendered list at the default limit", () => {
    const rows: SensorReadingRow[] = [];
    for (let i = 0; i < 6; i++) {
      rows.push(...manualSnapshot(T[i], TENT_A, { temperature_c: 20 + i }));
    }
    render(<TentManualSnapshotHistoryList tentId={TENT_A} readings={rows} />);
    const items = screen.getAllByTestId("tent-manual-snapshot-history-item");
    expect(items.length).toBe(DEFAULT_HISTORY_LIMIT);
  });
});
