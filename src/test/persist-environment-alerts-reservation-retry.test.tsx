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

function hookInput(): PersistEnvironmentAlertsInput {
  const snapshot: SensorSnapshot = {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: new Date().toISOString(),
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

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset();
  alertsIo.log.mockReset().mockResolvedValue({ id: "evt-1" });
  alertsIo.update.mockReset().mockResolvedValue(undefined);
});

describe("usePersistEnvironmentAlerts reserved-write retry (#2199 Codex P2)", () => {
  it("retries in a replacement instance when the reserved in-flight write fails", async () => {
    const firstWrite = deferred<{ id: string }>();
    alertsIo.save.mockReturnValueOnce(firstWrite.promise).mockResolvedValue({ id: "alert-2" });
    const input = hookInput();

    const first = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: input,
    });
    await waitFor(() => expect(alertsIo.save).toHaveBeenCalledTimes(1));
    const writesPerRun = alertsIo.save.mock.calls.length;

    first.unmount();
    const second = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: input,
    });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.status).toBe("done"));
    expect(alertsIo.save).toHaveBeenCalledTimes(writesPerRun);

    await act(async () => {
      firstWrite.reject(new Error("network down"));
      await firstWrite.promise.catch(() => undefined);
    });

    await waitFor(() => expect(alertsIo.save).toHaveBeenCalledTimes(writesPerRun + 1));
    await waitFor(() => expect(alertsIo.log).toHaveBeenCalledTimes(1));
    // One wake per failure: the retry holds its own reservation, nothing loops.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(alertsIo.save).toHaveBeenCalledTimes(writesPerRun + 1);

    second.unmount();
  });

  it("does not write again in the replacement instance when the reserved write succeeds", async () => {
    const firstWrite = deferred<{ id: string }>();
    alertsIo.save.mockReturnValueOnce(firstWrite.promise).mockResolvedValue({ id: "alert-2" });
    const input = hookInput();

    const first = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: input,
    });
    await waitFor(() => expect(alertsIo.save).toHaveBeenCalledTimes(1));

    first.unmount();
    const second = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: input,
    });
    await waitFor(() => expect(second.result.current.status).toBe("done"));

    await act(async () => {
      firstWrite.resolve({ id: "alert-1" });
      await firstWrite.promise;
    });
    await waitFor(() => expect(alertsIo.log).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(alertsIo.save).toHaveBeenCalledTimes(1);

    second.unmount();
  });
});
