import { act, render, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { deriveAlertWhyContext } from "@/lib/alertWhyContext";
import { buildEnvironmentAlerts } from "@/lib/environmentAlerts";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { dedupeAlertEventsForTimeline } from "@/lib/timelineChipCountRules";

const alertsIo = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  log: vi.fn(),
  targetsState: {
    status: "loading" as "idle" | "loading" | "ok" | "unavailable",
    targets: null as Record<string, { min: number | null; max: number | null }> | null,
    reload: vi.fn(),
  },
  snapshotState: {
    status: "ok" as "idle" | "loading" | "ok" | "unavailable",
    snapshot: {
      source: "manual" as const,
      ts: new Date().toISOString(),
      temp: 32,
      rh: 85,
      vpd: 1.1,
      co2: null,
      soil: null,
      soil_ec: null,
      soil_temp: null,
      ppfd: null,
      device_id: null,
      csvVendor: null,
      tent_id: "tent-1",
    } as SensorSnapshot,
  },
}));

vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => alertsIo.list(...args),
  saveAlert: (...args: unknown[]) => alertsIo.save(...args),
  logAlertEvent: (...args: unknown[]) => alertsIo.log(...args),
}));

vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({
    data: [{ id: "tent-1", name: "Tent 1", stage: "seedling" }],
    isFetched: true,
    isError: false,
    isFetching: false,
  }),
}));

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: () => alertsIo.snapshotState,
}));

vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => alertsIo.targetsState,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset().mockResolvedValue({ id: "alert-1" });
  alertsIo.log.mockReset().mockResolvedValue({ id: "evt-1" });
  alertsIo.targetsState = {
    status: "loading",
    targets: null,
    reload: vi.fn(),
  };
  alertsIo.snapshotState = {
    status: "ok",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      ts: new Date().toISOString(),
      temp: 32,
      rh: 85,
      vpd: 1.1,
      tent_id: "tent-1",
    },
  };
});

describe("One CREATED event per alert and no duplicate RH alert with mismatched ranges (#2165, #2179)", () => {
  it("persists an alert and logs its CREATED event only once across concurrent/remounted hook evaluations (#2165)", async () => {
    const listGate = deferred<unknown[]>();
    alertsIo.list.mockReturnValue(listGate.promise);

    const snapshot = {
      ...alertsIo.snapshotState.snapshot,
      temp: 32,
      rh: 68, // inside seedling RH 65-75%
      vpd: 0.6, // inside seedling VPD 0.4-0.8 kPa
    };
    const hookInput: PersistEnvironmentAlertsInput = {
      growId: "grow-1",
      tentId: "tent-1",
      enabled: true,
      stage: "seedling",
      snapshot,
      quality: evaluateSensorQuality(snapshot),
      targets: compareSnapshotToTargets(snapshot, null),
    };

    // Mount two concurrent hook instances for the same grow/tent/breach
    // (or rapid remount while listAlerts is in flight).
    const first = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: hookInput,
    });
    const second = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: hookInput,
    });

    await waitFor(() => expect(alertsIo.list).toHaveBeenCalled());

    await act(async () => {
      listGate.resolve([]);
      await listGate.promise;
    });

    await waitFor(() => {
      expect(alertsIo.save).toHaveBeenCalledTimes(1);
      expect(alertsIo.log).toHaveBeenCalledTimes(1);
    });
    expect(alertsIo.log).toHaveBeenCalledWith(
      expect.objectContaining({
        alert_id: "alert-1",
        grow_id: "grow-1",
        event_type: "created",
        new_status: "open",
      }),
    );

    first.unmount();
    second.unmount();
  });

  it("holds alert persistence while grow_targets is still loading so a seedling stage alert (65–75% RH) is never created before configured grow targets (50–70% RH) arrive (#2179)", async () => {
    alertsIo.targetsState = {
      status: "loading",
      targets: null,
      reload: vi.fn(),
    };

    const view = render(
      <AlertsAutoPersistForGrow
        growId="grow-1"
        stage="seedling"
        plants={[{ grow_id: "grow-1", tent_id: "tent-1", stage: "seedling" }]}
      />,
    );

    // While targets are loading, persistence must NOT fire with fallback null targets.
    await new Promise((r) => setTimeout(r, 20));
    expect(alertsIo.save).not.toHaveBeenCalled();
    expect(alertsIo.log).not.toHaveBeenCalled();

    // Now grow_targets resolves with RH 50-70%.
    alertsIo.targetsState = {
      status: "ok",
      targets: { rh: { min: 50, max: 70 } },
      reload: vi.fn(),
    };
    view.rerender(
      <AlertsAutoPersistForGrow
        growId="grow-1"
        stage="seedling"
        plants={[{ grow_id: "grow-1", tent_id: "tent-1", stage: "seedling" }]}
      />,
    );

    await waitFor(() => {
      expect(alertsIo.save).toHaveBeenCalledTimes(1);
      expect(alertsIo.log).toHaveBeenCalledTimes(1);
    });
    const savedPayload = alertsIo.save.mock.calls[0][0];
    expect(savedPayload.metric).toBe("rh");
    expect(savedPayload.title).toBe("Humidity above target");
    expect(savedPayload.reason).toContain("50–70%");
    expect(savedPayload.reason).not.toContain("65%–75%");
  });

  it("includes the configured target range in target-comparison alert reasons and derives Why-this-alert context instead of 'Target context unavailable' (#2179)", () => {
    const snap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 24,
      rh: 85,
      vpd: 1.1,
    };
    const cmp = compareSnapshotToTargets(snap, { rh: { min: 50, max: 70 } });
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality: evaluateSensorQuality(snap),
      targets: cmp,
      stage: "seedling",
      includeConfiguredRangeInTargetBreachReason: true,
    });

    const rhAlerts = derived.filter((a) => a.metric === "rh");
    expect(rhAlerts).toHaveLength(1);
    expect(rhAlerts[0].title).toBe("Humidity above target");
    expect(rhAlerts[0].reason).toContain("85%");
    expect(rhAlerts[0].reason).toContain("50–70%");

    const why = deriveAlertWhyContext(rhAlerts[0]);
    expect(why.kind).not.toBe("unavailable");
    expect(why.text).not.toContain("Target context unavailable");
    expect(why.text).toContain("50–70%");
  });

  it("collapses duplicate CREATED alert_events for the same alert_id on the Timeline while keeping status transitions (#2165)", () => {
    const events = [
      {
        id: "ev-created-3",
        alert_id: "alert-temp-1",
        event_type: "created",
        created_at: "2026-10-15T12:00:03.000Z",
      },
      {
        id: "ev-ack",
        alert_id: "alert-temp-1",
        event_type: "acknowledged",
        created_at: "2026-10-15T12:05:00.000Z",
      },
      {
        id: "ev-created-1",
        alert_id: "alert-temp-1",
        event_type: "created",
        created_at: "2026-10-15T12:00:01.000Z",
      },
      {
        id: "ev-created-2",
        alert_id: "alert-temp-1",
        event_type: "created",
        created_at: "2026-10-15T12:00:02.000Z",
      },
      {
        id: "ev-other-created",
        alert_id: "alert-rh-2",
        event_type: "created",
        created_at: "2026-10-15T12:01:00.000Z",
      },
    ];

    const deduped = dedupeAlertEventsForTimeline(events);
    expect(deduped.map((e) => e.id)).toEqual(["ev-ack", "ev-other-created", "ev-created-1"]);
  });
});
