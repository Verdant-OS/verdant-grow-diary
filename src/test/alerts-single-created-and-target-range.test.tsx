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
  update: vi.fn(),
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
  updateOpenAlertContext: (...args: unknown[]) => alertsIo.update(...args),
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

const RH_READING_B = "bbbbbbbb-1111-4222-8333-444444444444";

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
  alertsIo.update.mockReset().mockResolvedValue(undefined);
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
      rh: 68, // inside seedling RH band
      vpd: 0.6, // inside seedling VPD band
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

  it("treats initial idle grow_targets state as pending so stage-default alerts cannot persist before targets transition to loading and ok (#2179)", async () => {
    alertsIo.targetsState = {
      status: "idle",
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

    await act(async () => {
      await Promise.resolve();
    });
    expect(alertsIo.list).not.toHaveBeenCalled();
    expect(alertsIo.save).not.toHaveBeenCalled();
    expect(alertsIo.log).not.toHaveBeenCalled();

    alertsIo.targetsState = {
      status: "loading",
      targets: null,
      reload: vi.fn(),
    };
    view.rerender(
      <AlertsAutoPersistForGrow
        growId="grow-1"
        stage="seedling"
        plants={[{ grow_id: "grow-1", tent_id: "tent-1", stage: "seedling" }]}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(alertsIo.list).not.toHaveBeenCalled();
    expect(alertsIo.save).not.toHaveBeenCalled();

    alertsIo.targetsState = {
      status: "ok",
      targets: { rh: { min: 50, max: 70 }, temp: { min: 20, max: 35 } },
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

  it("retains in-flight snapshot reservation across last-instance unmount while saveAlert is pending (#2165)", async () => {
    const saveGate = deferred<{ id: string }>();
    alertsIo.save.mockReturnValue(saveGate.promise);

    const snapshot = {
      ...alertsIo.snapshotState.snapshot,
      temp: 32,
      rh: 68,
      vpd: 0.6,
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

    const first = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: hookInput,
    });

    await waitFor(() => expect(alertsIo.save).toHaveBeenCalledTimes(1));

    // Unmount the last hook instance while saveAlert is still in flight, then
    // immediately remount (e.g. StrictMode or rapid route transition) while
    // listAlerts still returns [].
    first.unmount();

    const second = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: hookInput,
    });

    await waitFor(() => expect(alertsIo.list).toHaveBeenCalledTimes(2));

    await act(async () => {
      saveGate.resolve({ id: "alert-rapid-1" });
      await saveGate.promise;
    });

    await waitFor(() => {
      expect(alertsIo.log).toHaveBeenCalledTimes(1);
    });
    expect(alertsIo.save).toHaveBeenCalledTimes(1);

    second.unmount();
  });

  it("parses decimal VPD/temp configured ranges without truncation and converts one-sided temp targets to Fahrenheit (#2179)", () => {
    const vpdSnap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 24,
      rh: 55,
      vpd: 1.5,
    };
    const vpdCmp = compareSnapshotToTargets(vpdSnap, { vpd: { min: 0.85, max: 1.25 } });
    const vpdDerived = buildEnvironmentAlerts({
      snapshot: vpdSnap,
      quality: evaluateSensorQuality(vpdSnap),
      targets: vpdCmp,
      stage: "veg",
      includeConfiguredRangeInTargetBreachReason: true,
    });
    const vpdAlert = vpdDerived.find((a) => a.metric === "vpd")!;
    expect(vpdAlert).toBeDefined();
    const vpdWhy = deriveAlertWhyContext(vpdAlert);
    expect(vpdWhy.kind).toBe("configured");
    expect(vpdWhy.text).toBe("Configured target: 0.85–1.25 kPa");

    const tempPairSnap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 30,
      rh: 55,
      vpd: 1.0,
    };
    const tempPairCmp = compareSnapshotToTargets(tempPairSnap, {
      temp: { min: 22.5, max: 26.5 },
    });
    const tempPairAlert = buildEnvironmentAlerts({
      snapshot: tempPairSnap,
      quality: evaluateSensorQuality(tempPairSnap),
      targets: tempPairCmp,
      stage: "veg",
      includeConfiguredRangeInTargetBreachReason: true,
    }).find((a) => a.metric === "temp")!;
    expect(deriveAlertWhyContext(tempPairAlert, "celsius").text).toBe(
      "Configured target: 22.5–26.5°C",
    );
    expect(deriveAlertWhyContext(tempPairAlert, "fahrenheit").text).toBe(
      "Configured target: 72.5–79.7°F",
    );

    const minOnlySnap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 18,
      rh: 55,
      vpd: 1.0,
    };
    const minOnlyCmp = compareSnapshotToTargets(minOnlySnap, {
      temp: { min: 22, max: null },
    });
    const minOnlyAlert = buildEnvironmentAlerts({
      snapshot: minOnlySnap,
      quality: evaluateSensorQuality(minOnlySnap),
      targets: minOnlyCmp,
      stage: "veg",
      includeConfiguredRangeInTargetBreachReason: true,
    }).find((a) => a.metric === "temp")!;
    expect(deriveAlertWhyContext(minOnlyAlert, "fahrenheit").text).toBe(
      "Configured target: ≥ 71.6°F",
    );
    expect(deriveAlertWhyContext(minOnlyAlert, "celsius").text).toBe("Configured target: ≥ 22°C");

    const maxOnlySnap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 31,
      rh: 55,
      vpd: 1.0,
    };
    const maxOnlyCmp = compareSnapshotToTargets(maxOnlySnap, {
      temp: { min: null, max: 28 },
    });
    const maxOnlyAlert = buildEnvironmentAlerts({
      snapshot: maxOnlySnap,
      quality: evaluateSensorQuality(maxOnlySnap),
      targets: maxOnlyCmp,
      stage: "veg",
      includeConfiguredRangeInTargetBreachReason: true,
    }).find((a) => a.metric === "temp")!;
    expect(deriveAlertWhyContext(maxOnlyAlert, "fahrenheit").text).toBe(
      "Configured target: ≤ 82.4°F",
    );
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

  it("keeps the earliest CREATED event deterministically when created_at ties, regardless of input order (#2165)", () => {
    const tie = "2026-10-15T12:00:00.000Z";
    const a = { id: "ev-a", alert_id: "alert-1", event_type: "created", created_at: tie };
    const b = { id: "ev-b", alert_id: "alert-1", event_type: "created", created_at: tie };
    const bad = { id: "ev-0", alert_id: "alert-2", event_type: "created", created_at: "nope" };
    const forward = dedupeAlertEventsForTimeline([a, b, bad]).map((e) => e.id);
    const reverse = dedupeAlertEventsForTimeline([bad, b, a]).map((e) => e.id);
    expect(forward).toEqual(reverse);
    expect(forward.filter((id) => id.startsWith("ev-a") || id.startsWith("ev-b"))).toHaveLength(1);
    expect(forward).toContain("ev-0");
  });

  it("never renders a signed zero in a target-breach reason (#2179)", () => {
    const snap = {
      ...EMPTY_SNAPSHOT,
      source: "manual" as const,
      ts: "2026-10-15T12:00:00.000Z",
      temp: 24,
      rh: 60,
      soil_temp: -0.001,
    };
    const derived = buildEnvironmentAlerts({
      snapshot: snap,
      quality: evaluateSensorQuality(snap),
      targets: compareSnapshotToTargets(snap, { soil_temp: { min: 18, max: 24 } }),
      stage: "veg",
      includeConfiguredRangeInTargetBreachReason: true,
    });
    const reasons = derived.map((d) => d.reason).join(" | ");
    expect(reasons).toContain("Observed 0°C");
    expect(reasons).not.toContain("-0°C");
  });

  it("refreshes an open stage-range alert's wording when configured targets replace the defaults, without inserting a second alert (Codex P2 at 0139bb37)", async () => {
    alertsIo.list.mockResolvedValue([
      {
        id: "open-stage-rh",
        metric: "rh",
        source: "environment_alerts",
        title: "Humidity above stage range",
        reason: "Observed 85%; seedling stage range 65%–75%.",
        tent_id: "tent-1",
        status: "open",
      },
    ]);
    alertsIo.targetsState = {
      status: "ok",
      targets: { rh: { min: 50, max: 70 } },
      reload: vi.fn(),
    };
    const observedAt = alertsIo.snapshotState.snapshot.ts;
    if (!observedAt) throw new Error("fixture snapshot must carry a timestamp");
    alertsIo.snapshotState = {
      ...alertsIo.snapshotState,
      snapshot: {
        ...alertsIo.snapshotState.snapshot,
        metric_refs: { rh: { id: RH_READING_B, captured_at: observedAt, source: "manual" } },
      },
    };
    render(
      <AlertsAutoPersistForGrow
        growId="grow-1"
        stage="seedling"
        plants={[{ grow_id: "grow-1", tent_id: "tent-1", stage: "seedling" }]}
      />,
    );
    await waitFor(() => {
      expect(alertsIo.update).toHaveBeenCalledTimes(1);
    });
    const [id, context] = alertsIo.update.mock.calls[0];
    expect(id).toBe("open-stage-rh");
    expect(context.title).toBe("Humidity above target");
    expect(context.reason).toContain("50–70%");
    // Codex P1 at 40bd0cf0: the refreshed reason quotes this snapshot's RH, so
    // the same write carries this snapshot's evidence ref.
    expect(context.originating_timeline_events).toEqual([
      expect.objectContaining({ id: RH_READING_B, type: "sensor_snapshot" }),
    ]);
    expect(alertsIo.save.mock.calls.some(([p]) => p.metric === "rh")).toBe(false);
    expect(deriveAlertWhyContext({ metric: "rh", ...context }).text).toContain("50–70%");
  });

  it("does not refresh an open alert's reason when the new observation has no evidence ref (Codex P1 at 40bd0cf0)", async () => {
    alertsIo.list.mockResolvedValue([
      {
        id: "open-stage-rh",
        metric: "rh",
        source: "environment_alerts",
        title: "Humidity above stage range",
        reason: "Observed 85%; seedling stage range 65%–75%.",
        tent_id: "tent-1",
        status: "open",
      },
    ]);
    alertsIo.targetsState = {
      status: "ok",
      targets: { rh: { min: 50, max: 70 } },
      reload: vi.fn(),
    };
    render(
      <AlertsAutoPersistForGrow
        growId="grow-1"
        stage="seedling"
        plants={[{ grow_id: "grow-1", tent_id: "tent-1", stage: "seedling" }]}
      />,
    );
    await waitFor(() => {
      expect(alertsIo.list).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(alertsIo.update).not.toHaveBeenCalled();
    expect(alertsIo.save.mock.calls.some(([p]) => p.metric === "rh")).toBe(false);
  });

  it("re-runs persistence and refreshes the open configured-target alert when its configured bounds are edited (Codex P2 at a7a61a76)", async () => {
    const observedAt = alertsIo.snapshotState.snapshot.ts;
    if (!observedAt) throw new Error("fixture snapshot must carry a timestamp");
    const snapshot: SensorSnapshot = {
      ...alertsIo.snapshotState.snapshot,
      rh: 85,
      metric_refs: { rh: { id: RH_READING_B, captured_at: observedAt, source: "manual" } },
    };
    const before = { rh: { min: 50, max: 70 } };
    const after = { rh: { min: 50, max: 75 } };
    const openReason = buildEnvironmentAlerts({
      snapshot,
      quality: evaluateSensorQuality(snapshot),
      targets: compareSnapshotToTargets(snapshot, before),
      includeConfiguredRangeInTargetBreachReason: true,
    }).find((a) => a.metric === "rh")?.reason;
    expect(openReason).toContain("50–70%");
    alertsIo.list.mockResolvedValue([
      {
        id: "open-configured-rh",
        metric: "rh",
        source: "environment_alerts",
        title: "Humidity above target",
        reason: openReason,
        tent_id: "tent-1",
        status: "open",
      },
    ]);
    const input = (targets: typeof before): PersistEnvironmentAlertsInput => ({
      growId: "grow-1",
      tentId: "tent-1",
      enabled: true,
      snapshot,
      quality: evaluateSensorQuality(snapshot),
      targets: compareSnapshotToTargets(snapshot, targets),
    });

    const hook = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: input(before),
    });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    // Same snapshot, same range: nothing to refresh.
    expect(alertsIo.update).not.toHaveBeenCalled();

    // The grower raises the maximum; RH stays high, so only the bounds move.
    hook.rerender(input(after));
    await waitFor(() => expect(alertsIo.update).toHaveBeenCalledTimes(1));
    const [id, context] = alertsIo.update.mock.calls[0];
    expect(id).toBe("open-configured-rh");
    expect(context.title).toBe("Humidity above target");
    expect(context.reason).toContain("50–75%");
    expect(context.originating_timeline_events).toEqual([
      expect.objectContaining({ id: RH_READING_B, type: "sensor_snapshot" }),
    ]);
    expect(alertsIo.save.mock.calls.some(([p]) => p.metric === "rh")).toBe(false);
    hook.unmount();
  });
});
