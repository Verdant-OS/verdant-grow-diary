/**
 * Per-Metric Sensor Evidence Refs v1 — `usePersistEnvironmentAlerts`
 * forwards the exact contributing `sensor_readings.id` from
 * `snapshot.metric_refs[<metric>]` to `saveAlert.originating_timeline_events`.
 *
 * No nearest matching, no metric-only DB lookup, no prose inference.
 * When a metric ref is absent, refs persist as `[]`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";

const saveAlertMock = vi.fn();
const listAlertsMock = vi.fn();
const logAlertEventMock = vi.fn();

vi.mock("@/lib/alerts", () => ({
  saveAlert: (...args: unknown[]) => saveAlertMock(...args),
  listAlerts: (...args: unknown[]) => listAlertsMock(...args),
  logAlertEvent: (...args: unknown[]) => logAlertEventMock(...args),
}));

import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";

const NOW_ISO = new Date().toISOString();

function snapshotWithRh(
  metricRefs?: SensorSnapshot["metric_refs"],
): SensorSnapshot {
  return {
    source: "live",
    ts: NOW_ISO,
    temp: 24,
    rh: 80,
    vpd: 1.2,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
    ...(metricRefs ? { metric_refs: metricRefs } : {}),
  };
}

const quality: SensorQualityResult = {
  quality: "good",
  headline: "ok",
  reasons: [],
  suspiciousFields: [],
};

const targets: TargetComparisonResult = {
  status: "out_of_range",
  headline: "rh high",
  reasons: [],
  metrics: [
    {
      metric: "rh",
      label: "Humidity",
      value: 80,
      min: 40,
      max: 65,
      state: "high",
    },
  ],
};

beforeEach(() => {
  saveAlertMock.mockReset();
  saveAlertMock.mockResolvedValue({ id: "alert-1" });
  listAlertsMock.mockReset();
  listAlertsMock.mockResolvedValue([]);
  logAlertEventMock.mockReset();
  logAlertEventMock.mockResolvedValue(undefined);
});

describe("usePersistEnvironmentAlerts — per-metric ref forwarding", () => {
  it("forwards the matching metric_refs row to saveAlert", async () => {
    const snapshot = snapshotWithRh({
      rh: { id: "row-rh-42", captured_at: NOW_ISO, source: "live" },
    });
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-1",
        snapshot,
        quality,
        targets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    const arg = saveAlertMock.mock.calls[0][0];
    expect(arg.metric).toBe("rh");
    expect(arg.originating_timeline_events).toEqual([
      {
        id: "row-rh-42",
        type: "sensor_snapshot",
        occurred_at: NOW_ISO,
        source: "live",
      },
    ]);
  });

  it("persists [] when no metric ref is present for the alert metric", async () => {
    const snapshot = snapshotWithRh(/* no metric_refs */);
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-2",
        snapshot,
        quality,
        targets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    const arg = saveAlertMock.mock.calls[0][0];
    expect(arg.originating_timeline_events).toEqual([]);
  });

  it("persists [] when metric_refs has only an unrelated metric", async () => {
    const snapshot = snapshotWithRh({
      temp: { id: "row-temp-1", captured_at: NOW_ISO, source: "live" },
    });
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-3",
        snapshot,
        quality,
        targets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    const arg = saveAlertMock.mock.calls[0][0];
    expect(arg.originating_timeline_events).toEqual([]);
  });

  it("never includes raw_payload / api_key in the persisted ref", async () => {
    const snapshot = snapshotWithRh({
      rh: { id: "row-rh-1", captured_at: NOW_ISO, source: "live" },
    });
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-4",
        snapshot,
        quality,
        targets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    const json = JSON.stringify(saveAlertMock.mock.calls[0][0]);
    expect(json).not.toContain("raw_payload");
    expect(json).not.toContain("api_key");
    expect(json).not.toContain("service_role");
  });
});
