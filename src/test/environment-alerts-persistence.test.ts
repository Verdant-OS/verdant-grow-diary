/**
 * Tests for persisting derived Environment Alerts into public.alerts.
 *
 * Covers:
 *   1. Does not write when snapshot is missing.
 *   2. Does not write when snapshot is stale.
 *   3. Does not write when snapshot.source is unavailable / quality unavailable.
 *   4. Does not write from demo/fallback/mock readings (isDemoData=true).
 *   5. Writes exactly one open alert from a real out-of-range reading.
 *   6. Idempotent: does not re-insert when an equivalent open alert exists.
 *   7. Appends a 'created' alert_events row after a successful save.
 *   8. saveAlert payload never sends user_id (RLS / DB default = auth.uid()).
 *   9. UI / Dashboard does not directly call supabase.from("alerts").insert.
 *  10. New persistence module is free of automation / device-control / service_role.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  isSnapshotPersistable,
  selectPersistableAlerts,
  derivedAlertKey,
  persistedAlertKey,
  dedupeAgainstOpen,
} from "@/lib/environmentAlertPersistence";
import { buildEnvironmentAlerts, type EnvironmentAlert } from "@/lib/environmentAlerts";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { TargetComparisonResult } from "@/lib/environmentTargetComparison";
import type { SensorQualityResult } from "@/lib/sensorQuality";

const NOW = Date.parse("2026-05-22T12:00:00Z");
const FRESH_TS = new Date(NOW - 60 * 1000).toISOString(); // 1 min ago
const STALE_TS = new Date(NOW - 60 * 60 * 1000).toISOString(); // 60 min ago

function liveSnapshot(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FRESH_TS,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 40,
    soil_ec: 1.4,
    soil_temp: 22,
    ppfd: 600,
    ...overrides,
  };
}

const okQuality: SensorQualityResult = {
  quality: "good",
  headline: "Sensor data looks usable",
  reasons: [],
  suspiciousFields: [],
};

const outOfRangeTargets: TargetComparisonResult = {
  status: "out_of_range",
  headline: "",
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
} as unknown as TargetComparisonResult;

const inRangeTargets: TargetComparisonResult = {
  status: "in_range",
  headline: "",
  reasons: [],
  metrics: [],
} as unknown as TargetComparisonResult;

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------
describe("environmentAlertPersistence — pure rules", () => {
  it("rejects when snapshot is missing", () => {
    expect(
      isSnapshotPersistable({ snapshot: null, quality: "good", now: NOW }),
    ).toBe(false);
  });

  it("rejects when snapshot.source is 'unavailable'", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot({ source: "unavailable", ts: null }),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects diary-derived snapshots (not a real live reading)", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot({ source: "diary" }),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects stale snapshots", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot({ ts: STALE_TS }),
        quality: "good",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects when sensor quality is unavailable", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot(),
        quality: "unavailable",
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects demo/fallback/mock readings", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot(),
        quality: "good",
        isDemoData: true,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("accepts a fresh real reading with usable quality", () => {
    expect(
      isSnapshotPersistable({
        snapshot: liveSnapshot(),
        quality: "good",
        now: NOW,
      }),
    ).toBe(true);
  });

  it("selectPersistableAlerts filters out 'snapshot:unavailable' / 'snapshot:stale' / 'targets:missing'", () => {
    const alerts: EnvironmentAlert[] = [
      {
        id: "snapshot:unavailable",
        severity: "info",
        metric: "snapshot",
        title: "x",
        reason: "y",
        source: "sensor_snapshot",
        createdAt: "",
      },
      {
        id: "snapshot:stale",
        severity: "watch",
        metric: "snapshot",
        title: "x",
        reason: "y",
        source: "sensor_snapshot",
        createdAt: "",
      },
      {
        id: "targets:missing",
        severity: "info",
        metric: "targets",
        title: "x",
        reason: "y",
        source: "target_comparison",
        createdAt: "",
      },
      {
        id: "target:temp:high",
        severity: "warning",
        metric: "temp",
        title: "Temperature above target",
        reason: "Temperature is above the configured maximum.",
        source: "target_comparison",
        createdAt: "",
      },
    ];
    const kept = selectPersistableAlerts(alerts, {
      snapshot: liveSnapshot(),
      quality: "good",
      now: NOW,
    });
    expect(kept.map((a) => a.id)).toEqual(["target:temp:high"]);
  });

  it("derivedAlertKey === persistedAlertKey for matching rows", () => {
    const a: EnvironmentAlert = {
      id: "target:temp:high",
      severity: "warning",
      metric: "temp",
      title: "Temperature above target",
      reason: "Temperature is above the configured maximum.",
      source: "target_comparison",
      createdAt: "",
    };
    const derived = derivedAlertKey(a);
    const stored = persistedAlertKey({
      metric: "temp",
      source: "environment_alerts",
      title: "Temperature above target",
    });
    expect(derived).toBe(stored);
  });

  it("dedupeAgainstOpen drops alerts already represented by an open row", () => {
    const a: EnvironmentAlert = {
      id: "target:temp:high",
      severity: "warning",
      metric: "temp",
      title: "Temperature above target",
      reason: "Temperature is above the configured maximum.",
      source: "target_comparison",
      createdAt: "",
    };
    const out = dedupeAgainstOpen([a], [
      { metric: "temp", source: "environment_alerts", title: a.title },
    ]);
    expect(out).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Hook behaviour — mocked alerts lib
// ---------------------------------------------------------------------------
const saveAlertMock = vi.fn();
const logAlertEventMock = vi.fn();
const listAlertsMock = vi.fn();

vi.mock("@/lib/alerts", () => ({
  saveAlert: (...a: unknown[]) => saveAlertMock(...a),
  logAlertEvent: (...a: unknown[]) => logAlertEventMock(...a),
  listAlerts: (...a: unknown[]) => listAlertsMock(...a),
}));

import { renderHook, waitFor } from "@testing-library/react";
import { usePersistEnvironmentAlerts } from "@/hooks/usePersistEnvironmentAlerts";

function setupOk() {
  saveAlertMock.mockReset();
  logAlertEventMock.mockReset();
  listAlertsMock.mockReset();
  listAlertsMock.mockResolvedValue([]);
  saveAlertMock.mockResolvedValue({ id: "alert-1" });
  logAlertEventMock.mockResolvedValue({ id: "evt-1" });
}

describe("usePersistEnvironmentAlerts — hook behaviour", () => {
  beforeEach(() => {
    // Lock wall-clock to NOW so FRESH_TS stays fresh regardless of when CI runs.
    // Use shouldAdvanceTime so testing-library's waitFor (which uses real
    // setTimeout under the hood) still progresses.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    setupOk();
  });

  afterEach(() => {
    vi.useRealTimers();
  });


  it("does not write when snapshot is missing", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: null,
        quality: { quality: "unavailable", headline: "", reasons: [], suspiciousFields: [] },
        targets: outOfRangeTargets,
        enabled: true,
      }),
    );
    await waitFor(() => {
      expect(listAlertsMock).not.toHaveBeenCalled();
      expect(saveAlertMock).not.toHaveBeenCalled();
    });
  });

  it("does not write when snapshot is stale", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: liveSnapshot({ ts: STALE_TS }),
        quality: okQuality,
        targets: outOfRangeTargets,
        enabled: true,
      }),
    );
    await waitFor(() => {
      expect(saveAlertMock).not.toHaveBeenCalled();
    });
  });

  it("does not write from demo/fallback readings", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: liveSnapshot(),
        quality: okQuality,
        targets: outOfRangeTargets,
        isDemoData: true,
        enabled: true,
      }),
    );
    await waitFor(() => {
      expect(saveAlertMock).not.toHaveBeenCalled();
    });
  });

  it("writes exactly one open alert + 'created' event from a real out-of-range reading", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: liveSnapshot(),
        quality: okQuality,
        targets: outOfRangeTargets,
        enabled: true,
      }),
    );
    await waitFor(() => {
      expect(saveAlertMock).toHaveBeenCalledTimes(1);
    });
    const payload = saveAlertMock.mock.calls[0][0];
    expect(payload.grow_id).toBe("g1");
    expect(payload.metric).toBe("temp");
    expect(payload.source).toBe("environment_alerts");
    // user_id must not be present (DB default = auth.uid()).
    expect(payload).not.toHaveProperty("user_id");

    await waitFor(() => {
      expect(logAlertEventMock).toHaveBeenCalledTimes(1);
    });
    const evt = logAlertEventMock.mock.calls[0][0];
    expect(evt).toMatchObject({
      alert_id: "alert-1",
      grow_id: "g1",
      event_type: "created",
      new_status: "open",
    });
    expect(evt).not.toHaveProperty("user_id");
  });

  it("is idempotent: skips when an equivalent open alert already exists", async () => {
    // First derive what the rules layer would produce, then pre-seed it
    // into listAlerts as already-open.
    const derived = buildEnvironmentAlerts({
      snapshot: liveSnapshot(),
      quality: okQuality,
      targets: outOfRangeTargets,
    });
    const real = derived.find((a) => a.id === "target:temp:high")!;

    listAlertsMock.mockResolvedValue([
      {
        id: "existing",
        metric: "temp",
        source: "environment_alerts",
        reason: real.reason,
        status: "open",
      },
    ]);

    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: liveSnapshot(),
        quality: okQuality,
        targets: outOfRangeTargets,
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(listAlertsMock).toHaveBeenCalled();
    });
    // Give the effect a tick to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(saveAlertMock).not.toHaveBeenCalled();
    expect(logAlertEventMock).not.toHaveBeenCalled();
  });

  it("skips when there are no out-of-range conditions", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: "g1",
        snapshot: liveSnapshot(),
        quality: okQuality,
        targets: inRangeTargets,
        enabled: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(saveAlertMock).not.toHaveBeenCalled();
  });

  it("is disabled when growId is null", async () => {
    renderHook(() =>
      usePersistEnvironmentAlerts({
        growId: null,
        snapshot: liveSnapshot(),
        quality: okQuality,
        targets: outOfRangeTargets,
        enabled: true,
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(saveAlertMock).not.toHaveBeenCalled();
    expect(listAlertsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Static contracts
// ---------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const PERSIST_LIB = readFileSync(
  resolve(ROOT, "src/lib/environmentAlertPersistence.ts"),
  "utf8",
);
const PERSIST_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/usePersistEnvironmentAlerts.ts"),
  "utf8",
);
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

describe("environment alert persistence — static safety", () => {
  it("persistence rules lib does not import supabase, ai-coach, action_queue, or service_role", () => {
    expect(PERSIST_LIB).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(PERSIST_LIB).not.toMatch(/ai-coach/i);
    expect(PERSIST_LIB).not.toMatch(/action_queue/);
    expect(PERSIST_LIB).not.toMatch(/service_role/i);
    expect(PERSIST_LIB).not.toMatch(/device[-_ ]command/i);
    expect(PERSIST_LIB).not.toMatch(/typedWateringWriteEnabled/);
  });

  it("persistence hook never references service_role, ai-coach, action_queue, leads, or typed watering writes", () => {
    expect(PERSIST_HOOK).not.toMatch(/service_role/i);
    expect(PERSIST_HOOK).not.toMatch(/ai-coach/i);
    expect(PERSIST_HOOK).not.toMatch(/action_queue/);
    expect(PERSIST_HOOK).not.toMatch(/from\s*\(\s*["']leads["']/);
    expect(PERSIST_HOOK).not.toMatch(/typedWateringWriteEnabled/);
    expect(PERSIST_HOOK).not.toMatch(/create_watering_event/);
  });

  it("persistence hook payloads never send user_id from the client", () => {
    // The hook should rely on the lib + DB default; no literal user_id key.
    expect(PERSIST_HOOK).not.toMatch(/user_id\s*:/);
  });

  it("Dashboard wires the hook but does not directly insert into alerts", () => {
    expect(DASHBOARD).toContain("usePersistEnvironmentAlerts");
    // The only writes are routed through the alerts lib (saveAlert/logAlertEvent
    // inside the existing onClick handler). No raw `.from("alerts").insert(`.
    expect(DASHBOARD).not.toMatch(/\.from\(\s*["']alerts["']\s*\)\s*\.insert\(/);
    expect(DASHBOARD).not.toMatch(/\.from\(\s*["']alert_events["']\s*\)\s*\.insert\(/);
  });
});
