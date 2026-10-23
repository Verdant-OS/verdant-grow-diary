/**
 * Regression: environment alert persistence must query and dedupe using the
 * shared ACTIVE_ALERT_STATUSES list, and terminal statuses must allow re-insert.
 */
import { renderHook, waitFor } from "@testing-library/react";
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

describe("usePersistEnvironmentAlerts — active status query and terminal re-create", () => {
  it("queries listAlerts with ACTIVE_ALERT_STATUSES", async () => {
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date().toISOString()),
    });
    await waitFor(() => expect(alertsIo.list).toHaveBeenCalled());
    const query = alertsIo.list.mock.calls[0]?.[0] as { statuses?: readonly string[] };
    expect([...(query.statuses ?? [])].sort()).toEqual([...ACTIVE_ALERT_STATUSES].sort());
    await waitFor(() => expect(hook.result.current.status).toBe("done"));
    hook.unmount();
  });

  it("inserts again after the grower dismisses the prior alert", async () => {
    const now = Date.now();
    const hook = renderHook((p) => usePersistEnvironmentAlerts(p), {
      initialProps: stageOnlyInput(new Date(now - 60_000).toISOString()),
    });
    await waitFor(() => expect(tempSaves()).toBe(1));
    await waitFor(() => expect(hook.result.current.status).toBe("done"));

    for (const r of alertsIo.rows) r.status = "dismissed";
    hook.rerender(stageOnlyInput(new Date(now).toISOString()));
    await waitFor(() => expect(tempSaves()).toBe(2));
    hook.unmount();
  });
});
