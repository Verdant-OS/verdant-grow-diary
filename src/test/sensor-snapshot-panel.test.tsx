/**
 * SensorSnapshotPanel — read-only UI test coverage.
 *
 * Verifies:
 *  - mock mode renders a clear "Mock data" label
 *  - loading mode renders a loading indicator
 *  - empty state message when no snapshots match the tentId
 *  - tent scoping: only rows for the active tent are rendered
 *  - no write / control affordances (buttons that imply device actions)
 *  - static safety: component source contains no forbidden strings
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import React from "react";

import { SensorSnapshotPanel, type SensorSnapshotItem } from "@/components/SensorSnapshotPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENT_A = "tent_1";
const TENT_B = "tent_2";

function snap(
  ts: string,
  tentId: string,
  overrides: Partial<Omit<SensorSnapshotItem, "ts" | "tentId">> = {},
): SensorSnapshotItem {
  return {
    ts,
    tentId,
    temp: 24.0,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    ...overrides,
  };
}

const T = ["2026-05-20T09:00:00Z", "2026-05-21T09:00:00Z", "2026-05-22T09:00:00Z"];

// ---------------------------------------------------------------------------
// Mock-mode labeling
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — mock mode", () => {
  it("renders a clear Mock data label when mode=mock", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="mock" />);
    // The badge / label must be visible and match /mock data/i
    expect(screen.getByText(/mock data/i)).toBeInTheDocument();
    const badge = screen.getByTestId("sensor-snapshot-panel-mock-badge");
    expect(badge).toBeInTheDocument();
  });

  it("does NOT render a Mock data label when mode=live", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={[snap(T[0], TENT_A)]} />);
    expect(screen.queryByTestId("sensor-snapshot-panel-mock-badge")).toBeNull();
    expect(screen.queryByText(/mock data/i)).toBeNull();
  });

  it("uses built-in mock data when mode=mock and no explicit snapshots are provided", () => {
    // The built-in mock pool has tent IDs like "t1"/"t2" — we simply confirm
    // the panel renders (with any count) without crashing and shows the badge.
    render(<SensorSnapshotPanel tentId="t1" mode="mock" />);
    expect(screen.getByTestId("sensor-snapshot-panel-mock-badge")).toBeInTheDocument();
    // At least the panel container must be present.
    expect(screen.getByTestId("sensor-snapshot-panel")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — loading state", () => {
  it("renders a loading indicator when mode=loading", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="loading" />);
    expect(screen.getByTestId("sensor-snapshot-panel-loading")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-snapshot-panel")).toHaveAttribute("data-mode", "loading");
  });

  it("does not render rows or empty-state while loading", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="loading" />);
    expect(screen.queryByTestId("sensor-snapshot-panel-empty")).toBeNull();
    expect(screen.queryAllByTestId("sensor-snapshot-panel-row").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — empty state", () => {
  it("shows an empty-state message when snapshots is an empty array", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={[]} />);
    expect(screen.getByTestId("sensor-snapshot-panel-empty")).toBeInTheDocument();
    expect(screen.queryAllByTestId("sensor-snapshot-panel-row").length).toBe(0);
  });

  it("shows empty state when all provided snapshots belong to a different tent", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={[snap(T[0], TENT_B)]} />);
    expect(screen.getByTestId("sensor-snapshot-panel-empty")).toBeInTheDocument();
  });

  it("shows empty state when explicit snapshots=[] and mode=mock (prop wins over mock pool)", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="mock" snapshots={[]} />);
    expect(screen.getByTestId("sensor-snapshot-panel-empty")).toBeInTheDocument();
    // Mock badge still visible even when empty
    expect(screen.getByTestId("sensor-snapshot-panel-mock-badge")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tent / grow scoping
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — tent scoping", () => {
  it("renders only rows matching the active tentId", () => {
    const mixed = [
      snap(T[0], TENT_A, { temp: 24 }),
      snap(T[1], TENT_B, { temp: 30 }),
      snap(T[2], TENT_A, { temp: 22 }),
    ];
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={mixed} />);
    const rows = screen.getAllByTestId("sensor-snapshot-panel-row");
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      expect(row.getAttribute("data-tent-id")).toBe(TENT_A);
    });
  });

  it("does not leak other-tent temperatures into the active tent rows", () => {
    const mixed = [snap(T[0], TENT_A, { temp: 24 }), snap(T[1], TENT_B, { temp: 99.9 })];
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={mixed} />);
    const rows = screen.getAllByTestId("sensor-snapshot-panel-row");
    expect(rows.length).toBe(1);
    const panel = screen.getByTestId("sensor-snapshot-panel");
    expect(panel).not.toHaveTextContent("99.9");
  });

  it("renders all rows when every snapshot belongs to the active tent", () => {
    const all = [snap(T[0], TENT_A), snap(T[1], TENT_A), snap(T[2], TENT_A)];
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={all} />);
    expect(screen.getAllByTestId("sensor-snapshot-panel-row").length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// No write / control affordances
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — no control affordances", () => {
  it("renders no button elements when displaying snapshots", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={[snap(T[0], TENT_A)]} />);
    const panel = screen.getByTestId("sensor-snapshot-panel");
    expect(within(panel).queryAllByRole("button").length).toBe(0);
  });

  it("renders no button elements in mock mode", () => {
    render(<SensorSnapshotPanel tentId="t1" mode="mock" />);
    const panel = screen.getByTestId("sensor-snapshot-panel");
    expect(within(panel).queryAllByRole("button").length).toBe(0);
  });

  it("renders no button elements in loading mode", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="loading" />);
    const panel = screen.getByTestId("sensor-snapshot-panel");
    expect(within(panel).queryAllByRole("button").length).toBe(0);
  });

  it("renders no link/anchor that implies device control", () => {
    render(<SensorSnapshotPanel tentId={TENT_A} mode="live" snapshots={[snap(T[0], TENT_A)]} />);
    const panel = screen.getByTestId("sensor-snapshot-panel");
    // Navigation links that go to device-control surfaces are forbidden.
    const links = within(panel).queryAllByRole("link");
    links.forEach((link) => {
      const href = (link as HTMLAnchorElement).href ?? "";
      expect(href).not.toMatch(/device|control|command|actuator|relay/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Static safety audit
// ---------------------------------------------------------------------------

describe("SensorSnapshotPanel — static safety", () => {
  const src = readFileSync(resolve(__dirname, "../components/SensorSnapshotPanel.tsx"), "utf8");

  it.each([
    "service_role",
    ".insert(",
    ".update(",
    ".delete(",
    ".upsert(",
    ".rpc(",
    "action_queue",
    "mqtt",
    "home_assistant",
    "pi_bridge",
    "actuator",
    "device_command",
    "autopilot",
    "automation",
    "webhook",
  ])("component source does not contain %s", (needle) => {
    expect(src).not.toContain(needle);
  });

  it("does not contain forbidden user-facing wording", () => {
    const lower = src.toLowerCase();
    expect(lower).not.toMatch(/\bperfect\b/);
    expect(lower).not.toMatch(/\bcompleted\b/);
    expect(lower).not.toMatch(/guaranteed healthy/);
  });

  it("does not import supabase", () => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
  });
});
