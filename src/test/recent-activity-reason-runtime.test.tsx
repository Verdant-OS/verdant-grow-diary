/**
 * Codex P2 on #2270 at b3ce1043, runtime check: run useGrowDetailData and
 * useDashboardScopedData and read the Recent Activity item each builds for an approved alert-derived action with
 * no audit note. The detail falls back to the stored action reason, which must
 * show `Reading at` in local time with no raw ISO timestamp or [alert:…] token.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ISO = "2026-10-15T15:54:26.221+00:00";
const STORED_REASON = `[alert:11111111-2222-3333-4444-555555555555] Humidity is above the flower target range. Reading at ${ISO}.`;

const harness = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  // Stable identities: the hook reloads when these change.
  user: { id: "user-1" },
  params: { growId: "grow-1" },
}));

vi.mock("@/lib/react-router-compat", () => ({
  useParams: () => harness.params,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: harness.user }),
}));

// Every query builder method returns the same chain; awaiting it (or
// maybeSingle/single) resolves the table's canned rows.
function chainFor(table: string) {
  const data = harness.tables[table] ?? [];
  const result = { data, error: null, count: Array.isArray(data) ? data.length : 0 };
  const single = { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null };
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "then") {
        const settled = Promise.resolve(result);
        return settled.then.bind(settled);
      }
      if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(single);
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => chainFor(table),
  },
}));

import { useGrowDetailData } from "@/hooks/useGrowDetailData";
import { useDashboardScopedData } from "@/hooks/useDashboardScopedData";

function expectLocalizedReason(detail: string | null | undefined) {
  expect(detail).toContain("Reading at");
  expect(detail).not.toContain(ISO);
  expect(detail).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  expect(detail).not.toContain("[alert:");
}

beforeEach(() => {
  harness.tables = {
    grows: [
      {
        id: "grow-1",
        name: "Reason timestamps",
        stage: "flower",
        grow_type: "indoor",
        is_archived: false,
        started_at: "2026-09-01T00:00:00.000Z",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-10-15T00:00:00.000Z",
        notes: null,
      },
    ],
    action_queue_events: [
      {
        id: "evt-1",
        action_queue_id: "act-1",
        event_type: "approved",
        previous_status: "pending",
        new_status: "approved",
        note: null,
        created_at: "2026-10-15T16:00:00.000Z",
      },
    ],
    action_queue: [{ id: "act-1", suggested_change: "Lower humidity", reason: STORED_REASON }],
  };
});

describe("useGrowDetailData Recent Activity action reason", () => {
  it("localizes the stored reason fallback when the event has no note", async () => {
    const { result } = renderHook(() => useGrowDetailData());

    await waitFor(() => expect(result.current.recent.status).toBe("ok"));
    if (result.current.recent.status !== "ok") return;
    const item = result.current.recent.items.find((entry) => entry.id === "event-evt-1");
    expectLocalizedReason(item?.detail);
  });
});

describe("useDashboardScopedData Recent Activity action reason", () => {
  it("localizes the stored reason fallback when the event has no note", async () => {
    const { result } = renderHook(() => useDashboardScopedData("grow-1"));

    await waitFor(() => expect(result.current.recent.status).toBe("ok"));
    if (result.current.recent.status !== "ok") return;
    const item = result.current.recent.items.find((entry) => entry.detail?.includes("Reading at"));
    expectLocalizedReason(item?.detail);
  });
});
