/**
 * #603 — Environment-check alerts persist a diary_entry evidence trail.
 *
 * Contract:
 *  1. snapshotFromEnvironmentCheck attaches diary_evidence_ref when given
 *     the exact diary_entries.id — never metric_refs.
 *  2. resolveEnvironmentAlertEvidenceRefs prefers metric_refs, then falls
 *     back to diary_evidence_ref with type "diary_entry".
 *  3. usePersistEnvironmentAlerts forwards that ref to saveAlert so
 *     originating_timeline_events is never [] when the diary id was known.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { snapshotFromEnvironmentCheck } from "@/lib/sensorSnapshot";
import { buildEnvironmentCheckDetails } from "@/lib/environmentCheckQuickLogRules";
import { resolveEnvironmentAlertEvidenceRefs } from "@/hooks/usePersistEnvironmentAlerts";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SensorQualityResult } from "@/lib/sensorQuality";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";

const NOW_ISO = new Date().toISOString();
const DIARY_ID = "11111111-2222-3333-4444-555555555555";

function envelope(): Record<string, unknown> {
  const e = buildEnvironmentCheckDetails({
    roomTempF: "95",
    humidityPct: "22",
    vpdKpa: "3.1",
  });
  if (!e) throw new Error("fixture envelope unexpectedly null");
  return { ...e } as unknown as Record<string, unknown>;
}

describe("snapshotFromEnvironmentCheck — diary_evidence_ref (#603)", () => {
  it("attaches diary_evidence_ref when diaryEntryId is provided", () => {
    const snap = snapshotFromEnvironmentCheck(NOW_ISO, envelope(), {
      diaryEntryId: DIARY_ID,
    });
    expect(snap).not.toBeNull();
    expect(snap?.diary_evidence_ref).toEqual({
      id: DIARY_ID,
      entry_at: NOW_ISO,
    });
    expect(snap?.metric_refs).toBeUndefined();
  });

  it("omits diary_evidence_ref when diaryEntryId is missing or blank", () => {
    expect(snapshotFromEnvironmentCheck(NOW_ISO, envelope())?.diary_evidence_ref).toBeUndefined();
    expect(
      snapshotFromEnvironmentCheck(NOW_ISO, envelope(), { diaryEntryId: "  " })?.diary_evidence_ref,
    ).toBeUndefined();
    expect(
      snapshotFromEnvironmentCheck(NOW_ISO, envelope(), { diaryEntryId: null })?.diary_evidence_ref,
    ).toBeUndefined();
  });

  it("never confuses diary id with metric_refs sensor_readings ids", () => {
    const snap = snapshotFromEnvironmentCheck(NOW_ISO, envelope(), {
      diaryEntryId: DIARY_ID,
    });
    expect(snap?.metric_refs).toBeUndefined();
    expect(JSON.stringify(snap)).not.toMatch(/sensor_readings/);
  });
});

describe("resolveEnvironmentAlertEvidenceRefs (#603)", () => {
  it("prefers metric_refs over diary_evidence_ref when both present", () => {
    const snap: SensorSnapshot = {
      source: "manual",
      ts: NOW_ISO,
      temp: 35,
      rh: 22,
      vpd: 3.1,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      metric_refs: {
        temp: { id: "sensor-row-1", captured_at: NOW_ISO, source: "manual" },
      },
      diary_evidence_ref: { id: DIARY_ID, entry_at: NOW_ISO },
    };
    const refs = resolveEnvironmentAlertEvidenceRefs({ metric: "temp" }, snap);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.type).toBe("sensor_snapshot");
    expect(refs[0]?.id).toBe("sensor-row-1");
  });

  it("falls back to diary_entry when metric_refs is absent", () => {
    const snap = snapshotFromEnvironmentCheck(NOW_ISO, envelope(), {
      diaryEntryId: DIARY_ID,
    });
    const refs = resolveEnvironmentAlertEvidenceRefs({ metric: "temp" }, snap);
    expect(refs).toEqual([
      {
        id: DIARY_ID,
        type: "diary_entry",
        occurred_at: NOW_ISO,
        source: "manual",
      },
    ]);
  });

  it("returns [] when neither metric nor diary ref is available", () => {
    const snap = snapshotFromEnvironmentCheck(NOW_ISO, envelope());
    expect(resolveEnvironmentAlertEvidenceRefs({ metric: "temp" }, snap)).toEqual([]);
    expect(resolveEnvironmentAlertEvidenceRefs({ metric: "temp" }, null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hook integration — saveAlert receives the diary ref
// ---------------------------------------------------------------------------

const saveAlertMock = vi.fn();
const listAlertsMock = vi.fn();
const logAlertEventMock = vi.fn();

vi.mock("@/lib/alerts", () => ({
  saveAlert: (...args: unknown[]) => saveAlertMock(...args),
  listAlerts: (...args: unknown[]) => listAlertsMock(...args),
  logAlertEvent: (...args: unknown[]) => logAlertEventMock(...args),
}));

import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";

const quality: SensorQualityResult = {
  quality: "watch",
  headline: "ok",
  reasons: [],
  suspiciousFields: [],
};

const hotTargets: TargetComparisonResult = {
  status: "out_of_range",
  headline: "temp high",
  reasons: [],
  metrics: [
    {
      metric: "temp",
      label: "Temperature",
      value: 35,
      min: 19,
      max: 28,
      state: "high",
    },
  ],
};

beforeEach(() => {
  saveAlertMock.mockReset();
  saveAlertMock.mockResolvedValue({ id: "alert-env-1" });
  listAlertsMock.mockReset();
  listAlertsMock.mockResolvedValue([]);
  logAlertEventMock.mockReset();
  logAlertEventMock.mockResolvedValue(undefined);
});

describe("usePersistEnvironmentAlerts — diary evidence trail (#603)", () => {
  it("persists originating_timeline_events with type diary_entry", async () => {
    const snapshot = snapshotFromEnvironmentCheck(NOW_ISO, envelope(), {
      diaryEntryId: DIARY_ID,
    });
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-env-1",
        snapshot,
        quality,
        targets: hotTargets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    const arg = saveAlertMock.mock.calls[0][0];
    expect(arg.originating_timeline_events).toEqual([
      {
        id: DIARY_ID,
        type: "diary_entry",
        occurred_at: NOW_ISO,
        source: "manual",
      },
    ]);
    // Must never claim sensor_snapshot for a diary id.
    expect(JSON.stringify(arg.originating_timeline_events)).not.toContain("sensor_snapshot");
  });

  it("still persists [] when env-check snapshot has no diary id (back-compat)", async () => {
    const snapshot = snapshotFromEnvironmentCheck(NOW_ISO, envelope());
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "grow-env-2",
        snapshot,
        quality,
        targets: hotTargets,
      }),
    );
    await waitFor(() => expect(saveAlertMock).toHaveBeenCalled());
    expect(saveAlertMock.mock.calls[0][0].originating_timeline_events).toEqual([]);
  });
});
