/**
 * Copilot on #2394 at 40958e6b: acknowledging an alert records that the grower
 * saw it, not that the condition is fixed. The open-only dedupe list let the
 * next breaching snapshot insert a second active alert beside the
 * acknowledged one. Acknowledged rows now dedupe; closed rows still do not.
 */
import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  usePersistEnvironmentAlerts,
  type PersistEnvironmentAlertsInput,
} from "@/hooks/usePersistEnvironmentAlerts";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { evaluateSensorQuality } from "@/lib/sensorQuality";

const alertsIo = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  save: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/alerts", () => ({
  listAlerts: (...args: unknown[]) => alertsIo.list(...args),
  saveAlert: (...args: unknown[]) => alertsIo.save(...args),
  logAlertEvent: async () => ({ id: "evt-1" }),
  updateOpenAlertContext: async () => true,
}));

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

const tempSaves = () =>
  alertsIo.save.mock.calls.filter(([payload]) => payload?.metric === "temp").length;

beforeEach(() => {
  alertsIo.rows = [];
  // The list honours the status filter it is given, as the database does.
  alertsIo.list
    .mockReset()
    .mockImplementation(async (query: { statuses?: string[]; status?: string }) => {
      const wanted = query.statuses ?? (query.status ? [query.status] : null);
      return alertsIo.rows.filter((r) => !wanted || wanted.includes(r.status as string));
    });
  alertsIo.save.mockReset().mockImplementation(async (payload: Record<string, unknown>) => {
    const id = `alert-${alertsIo.rows.length + 1}`;
    alertsIo.rows.push({ ...payload, id, tent_id: payload.tent_id ?? "tent-1", status: "open" });
    return { id };
  });
});

describe("environment alert dedupe across statuses (Copilot on #2394)", () => {
  it("does not insert a second alert while the first is acknowledged", async () => {
    const now = Date.now();
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date(now - 60_000).toISOString()),
    });
    await waitFor(() => expect(tempSaves()).toBe(1));
    await waitFor(() => expect(hook.result.current.status).toBe("done"));

    for (const r of alertsIo.rows) r.status = "acknowledged";
    hook.rerender(stageOnlyInput(new Date(now).toISOString()));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(tempSaves()).toBe(1);
    hook.unmount();
  });

  it("still inserts again once the alert is resolved", async () => {
    const now = Date.now();
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date(now - 60_000).toISOString()),
    });
    await waitFor(() => expect(tempSaves()).toBe(1));
    await waitFor(() => expect(hook.result.current.status).toBe("done"));

    for (const r of alertsIo.rows) r.status = "resolved";
    hook.rerender(stageOnlyInput(new Date(now).toISOString()));
    await waitFor(() => expect(tempSaves()).toBe(2));
    hook.unmount();
  });
});
