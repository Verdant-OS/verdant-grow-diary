/**
 * Supplemental coverage for #2394 / #2385 review fixes on
 * usePersistEnvironmentAlerts write-sequence fencing. Keeps scorer-locked
 * follow-up pins intact; exercises the failure path paired with a stale list.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

const alertsIo = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => alertsIo.list(...args),
  saveAlert: (...args: unknown[]) => alertsIo.save(...args),
  logAlertEvent: (...args: unknown[]) => alertsIo.log(...args),
  updateOpenAlertContext: (...args: unknown[]) => alertsIo.update(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });

function stageOnlyInput(ts: string): PersistEnvironmentAlertsInput {
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
    growId: "grow-1",
    tentId: "tent-1",
    enabled: true,
    stage: "seedling",
    snapshot,
    quality: evaluateSensorQuality(snapshot),
    targets: compareSnapshotToTargets(snapshot, null),
  };
}

const savesFor = (metric: string) =>
  alertsIo.save.mock.calls.filter(([payload]) => payload?.metric === metric).length;

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset().mockResolvedValue({ id: "alert-1" });
  alertsIo.log.mockReset().mockResolvedValue({ id: "evt-1" });
  alertsIo.update.mockReset().mockResolvedValue(true);
});

describe("write-sequence fencing after failed inserts (#2394 supplemental)", () => {
  it("does not skip a stale open-alert list when the peer insert failed before commit", async () => {
    const failedSave = deferred<{ id: string }>();
    const lateList = deferred<unknown[]>();
    alertsIo.save.mockReturnValueOnce(failedSave.promise).mockResolvedValue({ id: "alert-late" });
    alertsIo.list.mockResolvedValueOnce([]).mockReturnValueOnce(lateList.promise);

    const input = stageOnlyInput(new Date().toISOString());
    const writer = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });
    await waitFor(() => expect(savesFor("temp")).toBe(1));

    const late = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalledTimes(2));

    await act(async () => {
      failedSave.reject(new Error("insert failed"));
      await failedSave.promise.catch(() => undefined);
    });
    await waitFor(() => expect(writer.result.current.status).toBe("error"));

    await act(async () => {
      lateList.resolve([]);
      await lateList.promise;
    });
    await waitFor(() => expect(late.result.current.status).toBe("done"));
    await settle();
    expect(savesFor("temp")).toBe(2);

    writer.unmount();
    late.unmount();
  });
});
