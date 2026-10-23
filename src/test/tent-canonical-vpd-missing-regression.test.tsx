/**
 * Regression coverage for PR #2451 / #2442 gaps: the list and strip must treat
 * Tonight's missing VPD as explicit absence, attach device identity on snapshots
 * without quality rejections, and never show a kPa value the Dashboard withholds.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import TentEnvironmentSnapshotStrip from "@/components/TentEnvironmentSnapshotStrip";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import {
  withRejectedQualityRows,
  type DashboardSensorEvidenceRow,
} from "@/lib/dashboardSensorEvidenceRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { sensorCaptureRef, snapshotCaptureRef } from "@/lib/sensorCaptureRefRules";
import { tentsListCanonicalVpd } from "@/lib/tentsListVpdRules";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";

const NOW_MS = Date.parse("2026-10-23T17:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW_MS - minutesAgo * 60_000).toISOString();
const T = at(3);
const TENT = "tent-1";

const hook = { state: { status: "idle", snapshot: EMPTY_SNAPSHOT } as SnapshotState };

const sensorRow = (
  metric: string,
  value: number,
  iso: string,
  source = "manual",
  extra: Record<string, unknown> = {},
): BuildTentSnapshotInput => ({
  metric,
  value,
  ts: iso,
  captured_at: iso,
  tent_id: TENT,
  source,
  ...extra,
});

beforeEach(() => {
  hook.state = { status: "idle", snapshot: EMPTY_SNAPSHOT };
});
afterEach(() => cleanup);

describe("tentsListCanonicalVpd missing flag (#2442)", () => {
  it("returns missing when Tonight cannot derive a VPD from sensor rows", () => {
    const ts = at(2);
    expect(tentsListCanonicalVpd([sensorRow("temperature_c", 25, ts)], TENT, NOW_MS)).toMatchObject(
      {
        missing: true,
        kpa: null,
        capturedAt: null,
        source: null,
      },
    );
  });

  it("returns missing with no rows and an idle snapshot", () => {
    expect(
      tentsListCanonicalVpd([], TENT, NOW_MS, { status: "idle", snapshot: null }),
    ).toMatchObject({ missing: true, kpa: null });
  });
});

describe("withRejectedQualityRows device identity without rejections (#2442)", () => {
  it("attaches metric_device_ids when every row passed intake quality", () => {
    const snapshot: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: T,
      vpd: 1.1,
      metric_refs: { vpd: { id: "v1", captured_at: T, source: "live" } },
    };
    const rows: DashboardSensorEvidenceRow[] = [
      {
        ...sensorRow("vpd_kpa", 1.1, T, "live", { id: "v1", device_id: "gw-a" }),
        tent_id: TENT,
      },
    ];
    const withEvidence = withRejectedQualityRows(snapshot, rows)!;
    expect(withEvidence.rejected_quality_rows).toBeUndefined();
    expect(withEvidence.metric_device_ids).toEqual({ vpd: "gw-a" });
    expect(snapshotCaptureRef(withEvidence, "vpd")).toBe(sensorCaptureRef(T, "live", "gw-a"));
  });
});

describe("buildTentSnapshotView withholds cohort VPD when canonical is missing (#2442)", () => {
  it("shows — even when the displayed cohort carries its own stored vpd_kpa row", () => {
    const view = buildTentSnapshotView(
      [
        sensorRow("temperature_c", 25, T),
        sensorRow("humidity_pct", 60, T),
        sensorRow("vpd_kpa", 1.2, T),
      ],
      "veg",
      NOW_MS,
      {
        canonicalVpd: {
          kpa: null,
          capturedAt: null,
          source: null,
          sourceLabel: null,
          ageText: null,
          missing: true,
        },
      },
    );
    const vpd = view.metrics.find((m) => m.key === "vpd")!;
    expect(vpd.status).toBe("unknown");
    expect(vpd.display).toBe("—");
  });
});

describe("TentEnvironmentSnapshotStrip missing VPD on the list (#2442)", () => {
  it("shows — for VPD when only temperature is on the card", () => {
    render(
      <TentEnvironmentSnapshotStrip
        tentId={TENT}
        tonightSnapshot={hook.state}
        stage="flower"
        sensorRows={[sensorRow("temperature_c", (80 - 32) / 1.8, at(2))]}
        sensorStatus="success"
        now={NOW_MS}
        temperatureUnit="fahrenheit"
        manualCards={[]}
        manualStatus="success"
      />,
    );
    const vpd = screen.getByTestId(`tents-list-metric-${TENT}-vpd`);
    expect(vpd).toHaveAttribute("data-status", "unknown");
    expect(vpd).toHaveTextContent("—");
    expect(vpd.textContent).not.toMatch(/\d+\.\d+/);
  });
});
