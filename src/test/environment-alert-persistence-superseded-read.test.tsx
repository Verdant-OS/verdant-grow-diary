import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";

const h = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => h.list(...args),
  saveAlert: (...args: unknown[]) => h.save(...args),
  logAlertEvent: (...args: unknown[]) => h.log(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function input(): PersistEnvironmentAlertsInput {
  return {
    growId: "grow-a",
    tentId: "tent-a",
    enabled: true,
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "live",
      ts: new Date().toISOString(),
      temp: 35,
      rh: 85,
      vpd: 1.1,
    },
    quality: { quality: "good", headline: "", reasons: [], suspiciousFields: [] },
    targets: {
      status: "out_of_range",
      headline: "",
      reasons: [],
      metrics: [
        { metric: "temp", label: "Temperature", value: 35, min: 19, max: 28, state: "high" },
        { metric: "rh", label: "Humidity", value: 85, min: 40, max: 70, state: "high" },
      ],
    },
  };
}

beforeEach(() => {
  h.list.mockReset().mockResolvedValue([]);
  h.save.mockReset().mockResolvedValue({ id: "alert-a" });
  h.log.mockReset().mockResolvedValue({ id: "audit-a" });
});

describe("superseded environment-alert evidence", () => {
  it.each(["unresolved refresh", "disabled", "unmount"] as const)(
    "does not begin writes when an old list settles after %s",
    async (reason) => {
      const read = deferred<unknown[]>();
      h.list.mockReturnValueOnce(read.promise);
      const initial = input();
      const view = renderHook((props) => usePersistEnvironmentAlerts(props), {
        initialProps: initial,
      });
      await waitFor(() => expect(h.list).toHaveBeenCalledTimes(1));
      if (reason === "unmount") view.unmount();
      else
        view.rerender(
          reason === "disabled" ? { ...initial, enabled: false } : { ...initial, snapshot: null },
        );
      await act(async () => {
        read.resolve([]);
        await read.promise;
      });
      expect(h.save).not.toHaveBeenCalled();
      expect(h.log).not.toHaveBeenCalled();
    },
  );

  it("releases unstarted reservations on cancellation while retaining the started alert's audit", async () => {
    const firstWrite = deferred<{ id: string }>();
    h.save.mockReturnValueOnce(firstWrite.promise);
    const initial = input();
    const view = renderHook((props) => usePersistEnvironmentAlerts(props), {
      initialProps: initial,
    });
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    const startedMetric = h.save.mock.calls[0][0].metric;
    const remainingMetric = startedMetric === "temp" ? "rh" : "temp";
    view.rerender({ ...initial, snapshot: null });
    // A fresh completed read may persist the not-yet-started metric even while
    // the previous request is pending. The started key remains deduplicated.
    view.rerender(initial);
    await waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2));
    expect(h.save.mock.calls[1][0].metric).toBe(remainingMetric);
    await act(async () => {
      firstWrite.resolve({ id: "started-alert" });
      await firstWrite.promise;
    });
    await waitFor(() => expect(h.log).toHaveBeenCalledTimes(2));
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ alert_id: "started-alert", event_type: "created" }),
    );
  });
});
