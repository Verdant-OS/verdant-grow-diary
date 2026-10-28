/**
 * Follow-up to #2270, runtime check: Action Queue writes a diary trace note that
 * copies "Reading at <ISO>." from the alert reason. Run useGrowDetailData and
 * useDashboardScopedData and read the Recent Activity diary item each builds:
 * its detail must show `Reading at` in local time, with no raw ISO timestamp.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ISO = "2026-10-15T15:54:26.221+00:00";

// The diary trace note Action Queue writes when an alert-derived action is approved.
const TRACE_NOTE = `Action approved: Lower humidity. Humidity is above the flower target range. Reading at ${ISO}.`;

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

beforeEach(() => {
  harness.tables = {
    grows: [
      {
        id: "grow-1",
        name: "Trace note timestamps",
        stage: "flower",
        grow_type: "indoor",
        is_archived: false,
        started_at: "2026-09-01T00:00:00.000Z",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-10-15T00:00:00.000Z",
        notes: null,
      },
    ],
    diary_entries: [
      {
        id: "diary-trace-1",
        grow_id: "grow-1",
        tent_id: null,
        plant_id: null,
        entry_at: "2026-10-15T16:00:05.000Z",
        stage: "flower",
        note: TRACE_NOTE,
      },
    ],
  };
});

function expectLocalizedTraceNote(detail: string | null | undefined) {
  expect(detail).toContain("Action approved: Lower humidity.");
  expect(detail).toContain("Reading at");
  expect(detail).not.toContain(ISO);
  expect(detail).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
}

describe("Recent Activity diary trace note (follow-up to #2270)", () => {
  it("useGrowDetailData localizes Reading at in a diary trace note", async () => {
    const { result } = renderHook(() => useGrowDetailData());

    await waitFor(() => expect(result.current.recent.status).toBe("ok"));
    if (result.current.recent.status !== "ok") return;
    const item = result.current.recent.items.find((entry) => entry.id === "diary-diary-trace-1");
    expectLocalizedTraceNote(item?.detail);
  });

  it("useDashboardScopedData localizes Reading at in a diary trace note", async () => {
    const { result } = renderHook(() => useDashboardScopedData("grow-1"));

    await waitFor(() => expect(result.current.recent.status).toBe("ok"));
    if (result.current.recent.status !== "ok") return;
    const item = result.current.recent.items.find((entry) => entry.id === "diary-diary-trace-1");
    expectLocalizedTraceNote(item?.detail);
  });
});
