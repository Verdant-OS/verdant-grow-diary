/**
 * Grow-scoped persistence keys (#2394 stack): reservations and dedupe keys include
 * growId so switching grows cannot suppress a legitimate breach, and list reads
 * use ACTIVE_ALERT_STATUSES (open + acknowledged).
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { ACTIVE_ALERT_STATUSES } from "@/lib/alertActiveStatusRules";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

const alertsIo = vi.hoisted(() => ({
  save: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => alertsIo.list(...args),
  saveAlert: (...args: unknown[]) => alertsIo.save(...args),
  logAlertEvent: async () => ({ id: "evt-1" }),
  updateOpenAlertContext: async () => true,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function stageOnlyInput(growId: string, ts: string): PersistEnvironmentAlertsInput {
  const snapshot: SensorSnapshot = {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts,
    temp: 32,
    rh: 68,
    vpd: 0.6,
    tent_id: "tent-1",
  };
  return {
    growId,
    tentId: "tent-1",
    enabled: true,
    stage: "seedling",
    snapshot,
    quality: evaluateSensorQuality(snapshot),
    targets: compareSnapshotToTargets(snapshot, null),
  };
}

const tempSavesForGrow = (growId: string) =>
  alertsIo.save.mock.calls.filter(
    ([payload]) => payload?.grow_id === growId && payload?.metric === "temp",
  ).length;

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset().mockResolvedValue({ id: "alert-1" });
});

describe("usePersistEnvironmentAlerts grow scope (#2394 stack)", () => {
  it("loads active alerts with ACTIVE_ALERT_STATUSES for the grow", async () => {
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput("grow-a", new Date().toISOString()),
    });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalled());
    expect(alertsIo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        growId: "grow-a",
        statuses: ACTIVE_ALERT_STATUSES,
      }),
    );
    await waitFor(() => expect(hook.result.current.status).toBe("done"));
    hook.unmount();
  });

  it("persists the same rule separately for each grow", async () => {
    const now = Date.now();
    const hook = renderHook(
      (p: { growId: string; ts: string }) =>
        usePersistEnvironmentAlerts(stageOnlyInput(p.growId, p.ts)),
      { initialProps: { growId: "grow-1", ts: new Date(now - 60_000).toISOString() } },
    );
    await waitFor(() => expect(tempSavesForGrow("grow-1")).toBe(1));

    hook.rerender({
      growId: "grow-2",
      ts: new Date(now).toISOString(),
    });
    await waitFor(() => expect(tempSavesForGrow("grow-2")).toBe(1));
    expect(tempSavesForGrow("grow-1")).toBe(1);
    expect(alertsIo.save.mock.calls.filter(([p]) => p?.metric === "temp")).toHaveLength(2);

    hook.unmount();
  });

  it("does not block a second grow while the first grow's insert is still in flight", async () => {
    const stuck = deferred<{ id: string }>();
    alertsIo.save.mockImplementation(async (payload: { grow_id?: string }) => {
      if (payload.grow_id === "grow-1") return stuck.promise;
      return { id: "alert-grow-2" };
    });
    const ts = new Date().toISOString();

    const first = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput("grow-1", ts),
    });
    await waitFor(() =>
      expect(alertsIo.save.mock.calls.some(([payload]) => payload?.grow_id === "grow-1")).toBe(
        true,
      ),
    );
    expect(alertsIo.save).toHaveBeenCalledTimes(1);

    const second = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput("grow-2", ts),
    });
    await waitFor(() => expect(tempSavesForGrow("grow-2")).toBe(1));
    expect(alertsIo.save).toHaveBeenCalledTimes(2);

    await act(async () => {
      stuck.resolve({ id: "alert-grow-1" });
      await stuck.promise;
    });
    await waitFor(() => expect(tempSavesForGrow("grow-1")).toBe(1));
    expect(alertsIo.save.mock.calls.filter(([p]) => p?.metric === "temp")).toHaveLength(2);

    first.unmount();
    second.unmount();
  });
});
