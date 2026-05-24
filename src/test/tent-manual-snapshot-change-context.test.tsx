/**
 * Manual Sensor Snapshot — change context on tent history surface.
 *
 * Audit + render coverage for `TentManualSnapshotChangeContext` mounted in
 * `TentDetail`. Read-only derived UI. No new schema, persistence, RPC,
 * sensor ingestion, alerts, action_queue, automation, device control, or
 * service_role.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import TentManualSnapshotChangeContext from "@/components/TentManualSnapshotChangeContext";
import type { SensorReadingRow } from "@/lib/db";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "";

const COMPONENT = read("src/components/TentManualSnapshotChangeContext.tsx");
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
    id: `${tent_id}-${ts}-${metric}`,
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

const T1 = "2026-05-23T09:00:00Z";
const T2 = "2026-05-24T09:00:00Z";

describe("Tent history change context — audit", () => {
  it("TentDetail is the chosen tent-level history surface and mounts the change-context badge", () => {
    expect(TENT_DETAIL).toContain("TentManualSnapshotChangeContext");
    expect(TENT_DETAIL).toMatch(
      /from\s+["']@\/components\/TentManualSnapshotChangeContext["']/,
    );
  });

  it("all delta/math logic lives outside JSX (uses the existing pure helper)", () => {
    expect(COMPONENT).toContain("deriveChangeContextFromReadings");
    // No raw arithmetic on metric values in the component body.
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
    }
  });

  it("does not use forbidden wording", () => {
    for (const word of ["perfect", "completed", "guaranteed healthy"]) {
      expect(COMPONENT.toLowerCase()).not.toContain(word);
      expect(TENT_DETAIL.toLowerCase()).not.toContain(word);
    }
  });
});

describe("TentManualSnapshotChangeContext — render", () => {
  it("renders nothing when there are no manual snapshots for the tent", () => {
    const { container } = render(
      <TentManualSnapshotChangeContext tentId={TENT_A} readings={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows first-snapshot copy when only one manual snapshot exists", () => {
    const readings = [
      row(T1, "temperature_c", 24, "manual", TENT_A),
      row(T1, "humidity_pct", 55, "manual", TENT_A),
    ];
    render(<TentManualSnapshotChangeContext tentId={TENT_A} readings={readings} />);
    const el = screen.getByTestId("tent-manual-snapshot-change-context");
    expect(el).toHaveAttribute("data-state", "first-snapshot");
    expect(el).toHaveTextContent(/First snapshot for this tent/i);
  });

  it("shows changed-since-previous deltas in deterministic order for later snapshots", () => {
    const readings = [
      // latest
      row(T2, "temperature_c", 25, "manual", TENT_A),
      row(T2, "humidity_pct", 51, "manual", TENT_A),
      row(T2, "co2_ppm", 820, "manual", TENT_A),
      // previous
      row(T1, "temperature_c", 24, "manual", TENT_A),
      row(T1, "humidity_pct", 55, "manual", TENT_A),
      row(T1, "co2_ppm", 700, "manual", TENT_A),
    ];
    render(<TentManualSnapshotChangeContext tentId={TENT_A} readings={readings} />);
    const el = screen.getByTestId("tent-manual-snapshot-change-context");
    expect(el).toHaveAttribute("data-state", "changed");
    expect(el).toHaveTextContent(/Changed since previous snapshot/i);
    const deltas = within(el).getAllByTestId(
      "tent-manual-snapshot-change-context-delta",
    );
    expect(deltas.map((d) => d.getAttribute("data-metric"))).toEqual([
      "temperature_c",
      "humidity_pct",
      "co2_ppm",
    ]);
    expect(deltas[0]).toHaveTextContent(/\+1\.8°F/);
    expect(deltas[2]).toHaveTextContent(/\+120 ppm/);
  });

  it("compares only same-tent snapshots (ignores other tents)", () => {
    const readings = [
      row(T2, "temperature_c", 25, "manual", TENT_A),
      // Different tent — must not be used as the "previous" snapshot.
      row(T1, "temperature_c", 10, "manual", TENT_B),
    ];
    render(<TentManualSnapshotChangeContext tentId={TENT_A} readings={readings} />);
    const el = screen.getByTestId("tent-manual-snapshot-change-context");
    expect(el).toHaveAttribute("data-state", "first-snapshot");
  });

  it("omits missing/invalid metric deltas instead of guessing", () => {
    const readings = [
      row(T2, "humidity_pct", 50, "manual", TENT_A),
      // temperature only on latest; missing on previous → must be omitted.
      row(T2, "temperature_c", 25, "manual", TENT_A),
      row(T1, "humidity_pct", 55, "manual", TENT_A),
    ];
    render(<TentManualSnapshotChangeContext tentId={TENT_A} readings={readings} />);
    const deltas = screen.getAllByTestId(
      "tent-manual-snapshot-change-context-delta",
    );
    expect(deltas.map((d) => d.getAttribute("data-metric"))).toEqual([
      "humidity_pct",
    ]);
  });

  it("does not render context for QuickLog note-only / non-manual readings", () => {
    const readings = [
      // demo-source readings should not be treated as manual snapshots.
      row(T1, "temperature_c", 22, "demo", TENT_A),
      row(T2, "temperature_c", 25, "demo", TENT_A),
    ];
    const { container } = render(
      <TentManualSnapshotChangeContext tentId={TENT_A} readings={readings} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when tentId is null", () => {
    const readings = [row(T1, "temperature_c", 24, "manual", TENT_A)];
    const { container } = render(
      <TentManualSnapshotChangeContext tentId={null} readings={readings} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
