/**
 * Regression: acknowledged alerts must actually reach the Plant Detail
 * assigned-tent alerts surfaces.
 *
 * `buildAssignedTentAlerts` has always accepted open OR acknowledged, and the
 * pure-layer test in plant-detail-assigned-tent-alerts.test.ts already covered
 * that branch. But `usePlantAssignedTentAlerts` asked `useAlertsList` for open
 * rows only, which `listAlerts` turns into an `.eq(...)` on the status column.
 * The acknowledged branch was therefore unreachable in the running app: the row
 * was filtered out at the query layer before the rules function ever saw it.
 * A grower who acknowledged an alert watched it vanish from the panel as
 * though it had been resolved.
 *
 * These tests sit at the hook/query boundary, which is where the defect lives —
 * a pure-layer test cannot fail for this bug. The `listAlerts` mock replicates
 * the server-side status filter so a narrowed query genuinely loses rows;
 * a mock that returned its fixtures unconditionally would pass both before and
 * after the fix and prove nothing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import type { AlertRow, AlertsQuery } from "@/lib/alerts";
import {
  ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT,
  ASSIGNED_TENT_ALERT_STATUSES,
  countOpenAlerts,
} from "@/lib/plantAssignedTentAlertRules";

const listAlertsMock = vi.fn();

vi.mock("@/lib/alerts", () => ({
  listAlerts: (q: AlertsQuery) => listAlertsMock(q),
}));

import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";

const TENT = "t1";
const GROW = "g1";

function alert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: "a1",
    user_id: "u1",
    grow_id: GROW,
    tent_id: TENT,
    plant_id: null,
    source: "environment_alerts",
    severity: "warning",
    metric: "temperature",
    title: "Temp high",
    reason: "Above target",
    status: "open",
    first_seen_at: "2026-05-23T10:00:00Z",
    last_seen_at: "2026-05-23T10:00:00Z",
    acknowledged_at: null,
    resolved_at: null,
    created_at: "2026-05-23T10:00:00Z",
    updated_at: "2026-05-23T10:00:00Z",
    ...overrides,
  } as AlertRow;
}

/**
 * Stand in for `listAlerts`, reproducing the filters it applies server-side:
 * `.eq("grow_id", …)` and `.eq("status", …)` unless the caller asked for "all".
 * This is what makes a narrowed query observably lose rows in this test.
 */
function respondWith(rows: AlertRow[]) {
  listAlertsMock.mockImplementation(async (q: AlertsQuery = {}) =>
    rows.filter((r) => {
      if (q.growId && r.grow_id !== q.growId) return false;
      if (q.statuses && q.statuses.length > 0) {
        if (!q.statuses.includes(r.status)) return false;
      } else if (q.status && q.status !== "all" && r.status !== q.status) return false;
      if (q.severity && q.severity !== "all" && r.severity !== q.severity) return false;
      return true;
    }),
  );
}

beforeEach(() => {
  listAlertsMock.mockReset();
});

describe("usePlantAssignedTentAlerts — acknowledged alerts stay reachable", () => {
  it("surfaces an acknowledged alert alongside an open one", async () => {
    respondWith([
      alert({ id: "open-1", status: "open" }),
      alert({ id: "ack-1", status: "acknowledged" }),
    ]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect([...result.current.rows.map((r) => r.id)].sort()).toEqual(["ack-1", "open-1"]);
  });

  it("filters status server-side to exactly the active set", async () => {
    respondWith([alert({ id: "ack-1", status: "acknowledged" })]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    // The read stays grow-scoped (RLS already scopes by user)...
    expect(listAlertsMock).toHaveBeenCalledWith(expect.objectContaining({ growId: GROW }));

    const query = listAlertsMock.mock.calls[0]?.[0] as AlertsQuery;
    // ...must not pin a single status and starve the rules layer...
    expect(ASSIGNED_TENT_ALERT_STATUSES).not.toContain(query.status);
    // ...and must narrow server-side rather than hauling back every closed row
    // and discarding it, which would let a long tail of resolved/dismissed
    // alerts crowd an older active one out of a capped result set.
    expect([...(query.statuses ?? [])].sort()).toEqual([...ASSIGNED_TENT_ALERT_STATUSES].sort());
    expect(query.statuses).toContain("acknowledged");
  });

  // Drift guard: adding a status to ASSIGNED_TENT_ALERT_STATUSES automatically
  // demands that the query keep it reachable, rather than silently regressing.
  for (const status of ASSIGNED_TENT_ALERT_STATUSES) {
    it(`reaches "${status}" alerts through the query layer`, async () => {
      respondWith([alert({ id: `only-${status}`, status })]);

      const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

      await waitFor(() => expect(result.current.status).toBe("ok"));
      expect(result.current.rows.map((r) => r.id)).toEqual([`only-${status}`]);
      expect(result.current.rows[0]?.status).toBe(status);
    });
  }
});

describe("usePlantAssignedTentAlerts — widening did not leak closed alerts", () => {
  it("still excludes resolved and dismissed alerts", async () => {
    respondWith([
      alert({ id: "open-1", status: "open" }),
      alert({ id: "ack-1", status: "acknowledged" }),
      alert({ id: "resolved-1", status: "resolved" }),
      alert({ id: "dismissed-1", status: "dismissed" }),
    ]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    const ids = result.current.rows.map((r) => r.id);
    expect(ids).not.toContain("resolved-1");
    expect(ids).not.toContain("dismissed-1");
    expect([...ids].sort()).toEqual(["ack-1", "open-1"]);
  });

  it("still excludes other tents even though more rows now arrive", async () => {
    respondWith([
      alert({ id: "mine", status: "acknowledged", tent_id: TENT }),
      alert({ id: "other-tent", status: "acknowledged", tent_id: "t2" }),
    ]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["mine"]);
  });

  it("returns nothing — and reads nothing — when the plant has no assigned tent", async () => {
    respondWith([alert({ id: "ack-1", status: "acknowledged" })]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(null, GROW));

    // Give any stray effect a tick to fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.rows).toEqual([]);
    // The rules layer would return [] anyway, so the read is pure waste.
    expect(listAlertsMock).not.toHaveBeenCalled();
  });
});

describe("countOpenAlerts — 'open alerts' copy stays truthful", () => {
  // The hook returns the ACTIVE set. Surfaces whose label says "open" must not
  // count acknowledged rows, or an acknowledged-only tent reports open alerts
  // that do not exist.
  it("counts only strictly-open rows, not the acknowledged ones", async () => {
    respondWith([
      alert({ id: "open-1", status: "open" }),
      alert({ id: "ack-1", status: "acknowledged" }),
      alert({ id: "ack-2", status: "acknowledged" }),
    ]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.rows).toHaveLength(3);
    expect(countOpenAlerts(result.current.rows)).toBe(1);
  });

  it("reports zero open alerts for an acknowledged-only tent", async () => {
    respondWith([alert({ id: "ack-1", status: "acknowledged" })]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.rows).toHaveLength(1);
    expect(countOpenAlerts(result.current.rows)).toBe(0);
  });

  it("is null-safe", () => {
    expect(countOpenAlerts(null)).toBe(0);
    expect(countOpenAlerts(undefined)).toBe(0);
    expect(countOpenAlerts([])).toBe(0);
  });

  it("counts open alerts pushed past the display cap by higher-severity acknowledged ones", async () => {
    // Five critical acknowledged alerts fill every one of the 5 display slots,
    // leaving a genuinely open (but lower-severity) alert off `rows`. Counting
    // the capped list would report "No open alerts" on a tent that has one —
    // a false zero, which is worse than the false positive it replaced.
    respondWith([
      ...Array.from({ length: ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT }, (_, i) =>
        alert({ id: `ack-${i}`, status: "acknowledged", severity: "critical" }),
      ),
      alert({ id: "open-late", status: "open", severity: "info" }),
    ]);

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    // The open alert really is off the capped display list...
    expect(result.current.rows).toHaveLength(ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT);
    expect(result.current.rows.map((r) => r.id)).not.toContain("open-late");
    // ...but the count must still see it.
    expect(result.current.openCount).toBe(1);
    expect(result.current.activeCount).toBe(ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT + 1);
  });

  it("counts every open alert beyond the cap, not just the displayed ones", async () => {
    respondWith(Array.from({ length: 8 }, (_, i) => alert({ id: `open-${i}`, status: "open" })));

    const { result } = renderHook(() => usePlantAssignedTentAlerts(TENT, GROW));

    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.rows).toHaveLength(ASSIGNED_TENT_ALERTS_DEFAULT_LIMIT);
    expect(result.current.openCount).toBe(8);
  });
});
