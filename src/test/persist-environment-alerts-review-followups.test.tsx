/**
 * Review follow-ups on usePersistEnvironmentAlerts (#2199 code, reported on
 * #2267 at 4dcba2be):
 *   1. Codex P1: the cross-instance reservation was keyed by snapshot time, so
 *      two instances seeing the same breach through snapshots with different
 *      `ts` both inserted it. Reservations are keyed by the logical alert key.
 *   2. Codex P1: a rejected `updateOpenAlertContext` was swallowed and the run
 *      reported `done`, leaving stale target wording. The error is surfaced
 *      and retried a bounded number of times.
 *   3. Copilot / CodeRabbit: cleanup released unstarted reservations without
 *      notifying a blocked instance, which then never retried.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import type * as RefreshRules from "@/lib/alertContextRefreshRules";

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

// Same retry budget as production, without waiting seconds per attempt.
vi.mock("@/lib/alertContextRefreshRules", async (importOriginal) => {
  const actual = await importOriginal<typeof RefreshRules>();
  return {
    ...actual,
    alertContextRefreshRetryDelayMs: (n: number) =>
      actual.alertContextRefreshRetryDelayMs(n) === null ? null : 5,
  };
});

const RH_READING = "bbbbbbbb-1111-4222-8333-444444444444";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });

/** Seedling breach: temperature above the stage range; RH and VPD inside it. */
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

/**
 * Two breaches against configured targets: RH above 50–70% (an open
 * stage-range RH row gets its wording refreshed) and temperature above
 * 20–28 °C (a new insert).
 */
function refreshAndInsertInput(): PersistEnvironmentAlertsInput {
  const ts = new Date().toISOString();
  const snapshot: SensorSnapshot = {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts,
    temp: 32,
    rh: 85,
    vpd: 0.6,
    tent_id: "tent-1",
    metric_refs: { rh: { id: RH_READING, captured_at: ts, source: "manual" } },
  };
  return {
    growId: "grow-1",
    tentId: "tent-1",
    enabled: true,
    stage: "seedling",
    snapshot,
    quality: evaluateSensorQuality(snapshot),
    targets: compareSnapshotToTargets(snapshot, {
      rh: { min: 50, max: 70 },
      temp: { min: 20, max: 28 },
    }),
  };
}

const OPEN_STAGE_RH = {
  id: "open-stage-rh",
  metric: "rh",
  source: "environment_alerts",
  title: "Humidity above stage range",
  reason: "Observed 85%; seedling stage range 65%–75%.",
  tent_id: "tent-1",
  status: "open",
};

const savesFor = (metric: string) =>
  alertsIo.save.mock.calls.filter(([payload]) => payload?.metric === metric).length;

beforeEach(() => {
  alertsIo.list.mockReset().mockResolvedValue([]);
  alertsIo.save.mockReset().mockResolvedValue({ id: "alert-1" });
  alertsIo.log.mockReset().mockResolvedValue({ id: "evt-1" });
  alertsIo.update.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePersistEnvironmentAlerts review follow-ups (#2267 at 4dcba2be)", () => {
  it("inserts one alert when two instances see the same breach through snapshots with different ts (Codex P1)", async () => {
    const listGate = deferred<unknown[]>();
    alertsIo.list.mockReturnValue(listGate.promise);
    const now = Date.now();
    const first = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date(now - 60_000).toISOString()),
    });
    const second = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date(now).toISOString()),
    });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalledTimes(2));

    await act(async () => {
      listGate.resolve([]);
      await listGate.promise;
    });
    await waitFor(() => expect(savesFor("temp")).toBeGreaterThan(0));
    await settle();

    expect(savesFor("temp")).toBe(1);
    expect(alertsIo.log).toHaveBeenCalledTimes(alertsIo.save.mock.calls.length);

    first.unmount();
    second.unmount();
  });

  it("surfaces a failed context refresh as an error and retries it until it succeeds (Codex P1)", async () => {
    alertsIo.list.mockResolvedValue([OPEN_STAGE_RH]);
    alertsIo.update.mockRejectedValueOnce(new Error("network down")).mockResolvedValue(true);
    const input = refreshAndInsertInput();
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });

    await waitFor(() => expect(alertsIo.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hook.result.current.status).toBe("done"));
    expect(hook.result.current.lastError).toBeNull();
    const [id, context] = alertsIo.update.mock.calls[1];
    expect(id).toBe("open-stage-rh");
    expect(context.title).toBe("Humidity above target");
    expect(savesFor("rh")).toBe(0);

    hook.unmount();
  });

  it("reports the refresh error and stops after the bounded retries when every attempt fails (Codex P1)", async () => {
    alertsIo.list.mockResolvedValue([OPEN_STAGE_RH]);
    alertsIo.update.mockRejectedValue(new Error("network down"));
    const input = refreshAndInsertInput();
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });

    // One attempt plus ALERT_CONTEXT_REFRESH_MAX_RETRIES (3) retries.
    await waitFor(() => expect(alertsIo.update).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(hook.result.current.status).toBe("error"));
    expect(hook.result.current.lastError).toContain("alert context refresh failed");
    expect(hook.result.current.lastError).toContain("network down");
    await settle();
    expect(alertsIo.update).toHaveBeenCalledTimes(4);
    // The new temperature breach still persisted exactly once.
    expect(savesFor("temp")).toBe(1);

    hook.unmount();
  });

  it("wakes a blocked instance when the reserving instance unmounts while its context refresh is pending (Copilot, CodeRabbit)", async () => {
    alertsIo.list.mockResolvedValue([OPEN_STAGE_RH]);
    const stuckRefresh = deferred<boolean>();
    alertsIo.update.mockReturnValueOnce(stuckRefresh.promise).mockResolvedValue(true);
    const input = refreshAndInsertInput();

    // A reserves the temperature insert, then waits on its RH refresh.
    const reserving = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });
    await waitFor(() => expect(alertsIo.update).toHaveBeenCalledTimes(1));

    // B sees the same breaches; temperature is held by A's reservation.
    const blocked = renderHook((p) => usePersistEnvironmentAlerts(p), { initialProps: input });
    await waitFor(() => expect(blocked.result.current.status).toBe("done"));
    expect(savesFor("temp")).toBe(0);

    // A goes away before its insert starts; B must take the insert over.
    reserving.unmount();
    await waitFor(() => expect(savesFor("temp")).toBe(1));
    await settle();
    expect(savesFor("temp")).toBe(1);
    expect(savesFor("rh")).toBe(0);

    blocked.unmount();
  });
});
