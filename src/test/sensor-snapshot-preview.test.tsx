import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { SensorSnapshotPreview } from "@/components/SensorSnapshotPreview";
import {
  EMPTY_SENSOR_SNAPSHOT,
  buildSensorSnapshot,
} from "@/lib/latestSensorSnapshotRules";

const NOW = new Date("2026-06-08T12:00:00.000Z");

function freshLiveSnap() {
  return buildSensorSnapshot(
    [
      {
        id: "r1",
        tent_id: "t1",
        metric: "temp_f",
        value: 75,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
      {
        id: "r2",
        tent_id: "t1",
        metric: "humidity_pct",
        value: 55,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
      {
        id: "r3",
        tent_id: "t1",
        metric: "vpd_kpa",
        value: 1.1,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
      {
        id: "r4",
        tent_id: "t1",
        metric: "soil_moisture_pct",
        value: 33,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
    ],
    { tentId: "t1", now: NOW },
  );
}

function staleSnap() {
  return buildSensorSnapshot(
    [
      {
        id: "r1",
        tent_id: "t1",
        metric: "temp_f",
        value: 75,
        source: "live",
        captured_at: "2026-06-08T11:00:00.000Z",
        ts: "2026-06-08T11:00:00.000Z",
      } as any,
      {
        id: "r2",
        tent_id: "t1",
        metric: "humidity_pct",
        value: 55,
        source: "live",
        captured_at: "2026-06-08T11:00:00.000Z",
        ts: "2026-06-08T11:00:00.000Z",
      } as any,
    ],
    { tentId: "t1", now: NOW },
  );
}

function invalidSnap() {
  return buildSensorSnapshot(
    [
      {
        id: "r1",
        tent_id: "t1",
        metric: "temp_f",
        value: 999,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
      {
        id: "r2",
        tent_id: "t1",
        metric: "humidity_pct",
        value: 55,
        source: "live",
        captured_at: "2026-06-08T11:55:00.000Z",
        ts: "2026-06-08T11:55:00.000Z",
      } as any,
    ],
    { tentId: "t1", now: NOW },
  );
}

afterEach(cleanup);

describe("SensorSnapshotPreview", () => {
  it("renders Temp / RH / VPD / Soil moisture", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach
        canToggle
      />,
    );
    expect(screen.getByText("Temp")).toBeInTheDocument();
    expect(screen.getByText("RH")).toBeInTheDocument();
    expect(screen.getByText("VPD")).toBeInTheDocument();
    expect(screen.getByText("Soil moisture")).toBeInTheDocument();
    expect(
      screen.getByTestId("sensor-snapshot-preview-metric-temp_f").textContent,
    ).toContain("75°F");
  });

  it("renders a Live badge only for fresh_live", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach
        canToggle
      />,
    );
    const badge = screen.getByTestId("sensor-snapshot-preview-badge");
    expect(badge.textContent).toMatch(/Live/);
  });

  it("renders stale amber badge and never says Live", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={staleSnap()}
        attach
        canToggle
      />,
    );
    const badge = screen.getByTestId("sensor-snapshot-preview-badge");
    expect(badge.textContent).toMatch(/^Stale /);
    expect(badge.textContent).not.toMatch(/\bLive\b/);
    expect(badge.className).toMatch(/amber/);
  });

  it("renders invalid red badge and is not labeled healthy", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={invalidSnap()}
        attach={false}
        canToggle={false}
      />,
    );
    const badge = screen.getByTestId("sensor-snapshot-preview-badge");
    expect(badge.textContent).toMatch(/^Invalid /);
    expect(badge.className).toMatch(/destructive/);
  });

  it("idle / loading / empty / error states render without crashing", () => {
    const { rerender } = render(
      <SensorSnapshotPreview
        status="idle"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
      />,
    );
    expect(screen.getByTestId("sensor-snapshot-preview-idle")).toBeInTheDocument();

    rerender(
      <SensorSnapshotPreview
        status="loading"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
      />,
    );
    expect(screen.getByTestId("sensor-snapshot-preview-loading")).toBeInTheDocument();

    rerender(
      <SensorSnapshotPreview
        status="empty"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
      />,
    );
    expect(screen.getByTestId("sensor-snapshot-preview-empty")).toBeInTheDocument();

    rerender(
      <SensorSnapshotPreview
        status="error"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
      />,
    );
    expect(screen.getByTestId("sensor-snapshot-preview-error")).toBeInTheDocument();
  });

  it("toggle calls onToggleAttach with next value", () => {
    const onToggle = vi.fn();
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach
        canToggle
        onToggleAttach={onToggle}
      />,
    );
    fireEvent.click(
      screen.getByTestId("sensor-snapshot-preview-attach-toggle"),
    );
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("disables toggle when no tent context (canToggle=false)", () => {
    render(
      <SensorSnapshotPreview
        status="idle"
        snapshot={EMPTY_SENSOR_SNAPSHOT}
        attach={false}
        canToggle={false}
      />,
    );
    const toggle = screen.getByTestId(
      "sensor-snapshot-preview-attach-toggle",
    ) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
  });

  it("exposes an accessible region heading", () => {
    render(
      <SensorSnapshotPreview
        status="ready"
        snapshot={freshLiveSnap()}
        attach
        canToggle
      />,
    );
    expect(
      screen.getByRole("region", { name: /sensor snapshot/i }),
    ).toBeInTheDocument();
  });
});

// Required so afterEach is in-scope.
import { afterEach } from "vitest";
