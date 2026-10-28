/**
 * Regressions for the Copilot, Codex and CodeRabbit reviews of #2451 at
 * 6d0fa53c: device-aware pairing, grading and rejection matching, invalid
 * snapshot VPD ranking, non-VPD rows never superseding a rejection, the
 * loading snapshot, and a labelled Tent Detail rejection.
 */
import { describe, expect, it } from "vitest";
import { buildTonightTentMetrics, type TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import {
  buildTentSnapshotView,
  type BuildTentSnapshotInput,
} from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { tentsListCanonicalVpd } from "@/lib/tentsListVpdRules";
import {
  resolveTentDetailVpd,
  tentDetailHeaderRejection,
  tentDetailVpdRowUntrusted,
} from "@/lib/tentDetailVpdRules";
import { withMetricDeviceIds } from "@/lib/dashboardSensorEvidenceRules";
import { captureRefsMatch, sensorCaptureRef } from "@/lib/sensorCaptureRefRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = Date.parse("2026-10-23T18:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const T = at(3);
const TENT = "tent-1";

const row = (
  metric: string,
  value: number,
  iso: string,
  device: string | null,
  quality = "ok",
  source = "live",
  id = `${metric}-${device ?? "none"}-${iso}`,
): BuildTentSnapshotInput & { tent_id: string } => ({
  id,
  metric,
  value,
  ts: iso,
  captured_at: iso,
  tent_id: TENT,
  source,
  quality,
  device_id: device,
});

function tonightVpd(
  rows: ReturnType<typeof row>[],
  snapshot: Record<string, unknown> | null = null,
): TonightMetricView {
  return buildTonightTentMetrics({
    rows: rows as Parameters<typeof buildTonightTentMetrics>[0]["rows"],
    rowsRead: { status: "success" },
    snapshot: snapshot
      ? { status: "ok", snapshot: snapshot as never }
      : { status: "idle", snapshot: null },
    now: new Date(NOW),
  }).find((m) => m.key === "vpd")!;
}

describe("devices at one instant are separate captures", () => {
  it("does not pair temperature and RH from two devices over an older stored VPD", () => {
    const vpd = tonightVpd([
      row("temperature_c", 25, T, "gw-a"),
      row("humidity_pct", 60, T, "gw-b"),
      row("vpd_kpa", 1.0, at(30), "gw-a"),
    ]);
    expect(vpd.calculated).toBe(false);
    expect(vpd.value).toBe(1.0);
  });

  it("keeps another device's degraded RH off the list's capture gate", () => {
    const result = tentsListCanonicalVpd(
      [
        row("temperature_c", 25, T, "gw-a"),
        row("vpd_kpa", 1.1, T, "gw-a"),
        row("humidity_pct", 55, T, "gw-b", "degraded"),
      ],
      TENT,
      NOW,
    );
    expect(result?.rejected).toBeUndefined();
    expect(result?.kpa).toBe(1.1);
  });

  it("grades a live VPD on its own capture beside another device's stale temperature", () => {
    const rows = [
      row("temperature_c", 25, T, "gw-b", "stale"),
      row("humidity_pct", 60, T, "gw-a"),
      row("vpd_kpa", 1.2, T, "gw-a"),
    ];
    const view = buildTentSnapshotView(rows, "veg", NOW, {
      canonicalVpd: {
        kpa: 1.2,
        capturedAt: T,
        source: "live",
        sourceLabel: "Live",
        ageText: "3m ago",
        captureRefs: [sensorCaptureRef(T, "live", "gw-a")],
      },
    });
    expect(view.metrics.find((m) => m.key === "vpd")?.status).toBe("ok");
  });

  it("matches only the selected device's flagged VPD row", () => {
    const rows = [row("vpd_kpa", 1.1, T, "gw-a"), row("vpd_kpa", 9.9, T, "gw-b", "invalid")];
    expect(tentDetailVpdRowUntrusted(rows as never, T, "live", "gw-a")).toBe(false);
    expect(tentDetailVpdRowUntrusted(rows as never, T, "live", "gw-b")).toBe(true);
  });

  it("carries each header metric's device into Tent Detail's rejection refs", () => {
    const rows = [row("humidity_pct", 100, T, "gw-b"), row("vpd_kpa", 1.1, T, "gw-a")];
    const snap: SensorSnapshot = {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: T,
      rh: 100,
      vpd: 1.1,
      metric_refs: {
        rh: { id: rows[0].id as string, captured_at: T, source: "live" },
        vpd: { id: rows[1].id as string, captured_at: T, source: "live" },
      },
    };
    const rejection = tentDetailHeaderRejection(
      { invalidFields: ["rh"], reasonCodes: [] },
      withMetricDeviceIds(snap, rows),
      { existingIsSnapshotVpd: true },
    );
    expect(captureRefsMatch(rejection.rejectedRefs?.[0], rejection.existingRef)).toBe(false);
  });
});

describe("rejection ranking and supersession", () => {
  it("lets a calculation stand beside an invalid snapshot VPD from another device", () => {
    const vpd = tonightVpd(
      [row("temperature_c", 25, T, "gw-a"), row("humidity_pct", 60, T, "gw-a")],
      {
        source: "live",
        ts: T,
        temp: null,
        rh: null,
        vpd: 1.5,
        metric_refs: { vpd: { id: "sv", captured_at: T, source: "live" } },
        metric_device_ids: { vpd: "gw-b" },
        rejected_quality_rows: [
          {
            metric: "humidity_pct",
            value: 55,
            captured_at: T,
            source: "live",
            quality: "degraded",
            device_id: "gw-b",
          },
        ],
      },
    );
    expect(vpd.state).toBe("value");
    expect(vpd.calculated).toBe(true);
  });

  it("keeps a rejected VPD invalid behind a newer CO2-only row", () => {
    const view = buildTentSnapshotView([row("co2_ppm", 800, at(1), "gw-a")], "veg", NOW, {
      canonicalVpd: {
        kpa: null,
        capturedAt: T,
        source: "live",
        sourceLabel: "Live",
        ageText: "3m ago",
        rejected: true,
      },
    });
    expect(view.metrics.find((m) => m.key === "vpd")?.status).toBe("invalid");
  });
});

describe("unsettled and withheld VPD evidence", () => {
  it("withholds the list's own VPD while Tonight's snapshot is loading", () => {
    const result = tentsListCanonicalVpd([], TENT, NOW, { status: "loading", snapshot: null });
    expect(result?.missing).toBe(true);
  });

  it("marks a VPD Tent Detail withholds as rejected, so the page labels it", () => {
    const observation = resolveTentDetailVpd({
      tonight: { key: "vpd", state: "invalid", capturedAt: T } as unknown as TonightMetricView,
      existing: { value: null, capturedAt: null, source: null, stale: false },
      rejectedMetrics: [],
      rejectedCapturedAt: null,
      contributors: null,
      captureClimate: [],
      nowMs: NOW,
    });
    expect(observation.value).toBeNull();
    expect(observation.rejected).toBe(true);
  });
});
