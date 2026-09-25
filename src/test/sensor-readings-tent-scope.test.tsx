/**
 * BUG-003 (QA 2026-09-24): the Plants page and Dashboard read
 * `sensor_readings_effective` with no tent predicate
 * (`order=captured_at.desc&limit=500`), which hit the Postgres statement
 * timeout (`57014`) on every load. Aggregate surfaces now read one bounded
 * window per tent in scope.
 */
import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import {
  combineTentScopedSensorWindows,
  mergeTentScopedSensorReadings,
  normalizeSensorReadingTentScope,
} from "@/lib/tentScopedSensorReadingsRules";

const io = vi.hoisted(() => ({
  owner: "11111111-1111-4111-8111-111111111111",
  responses: new Map<string, unknown>(),
  failTents: new Set<string>(),
  requests: [] as Array<{ tentId: string | null; limit: number }>,
}));

vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: io.owner } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let tentId: string | null = null;
      const query = {
        select: () => query,
        eq: (_column: string, value: string) => {
          tentId = value;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: (limit: number) => {
          const settle = async () => {
            io.requests.push({ tentId, limit });
            if (tentId && io.failTents.has(tentId)) {
              return { data: null, error: { code: "57014", message: "statement timeout" } };
            }
            return { data: tentId ? (io.responses.get(tentId) ?? []) : [], error: null };
          };
          // The legacy unscoped read awaits `.limit()` then may chain `.eq()`.
          const pending = settle();
          return Object.assign(pending, {
            eq: (_column: string, value: string) => {
              tentId = value;
              return pending;
            },
          });
        },
      };
      return query;
    },
  },
}));

const TENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001";
const B1 = "b1b1b1b1-0000-4000-8000-000000000001";

function row(id: string, tentId: string, capturedAt: string | null, ts = "2026-09-20T00:00:00Z") {
  return {
    id,
    user_id: io.owner,
    quality: "ok",
    device_id: null,
    raw_payload: null,
    correction_valid: true,
    tent_id: tentId,
    metric: "humidity_pct",
    value: 60,
    source: "manual",
    captured_at: capturedAt,
    ts,
    created_at: ts,
  };
}

const clients: QueryClient[] = [];
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  io.responses.clear();
  io.failTents.clear();
  io.requests.length = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe("tentScopedSensorReadingsRules", () => {
  it("keeps an unresolved scope null and normalizes a resolved one", () => {
    expect(normalizeSensorReadingTentScope(null)).toBeNull();
    expect(normalizeSensorReadingTentScope(undefined)).toBeNull();
    expect(normalizeSensorReadingTentScope([])).toEqual([]);
    expect(normalizeSensorReadingTentScope([TENT_B, "t1", null, "", TENT_A, TENT_B])).toEqual([
      TENT_A,
      TENT_B,
    ]);
  });

  it("merges newest-first with nulls last and deterministic tie-breakers", () => {
    const merged = mergeTentScopedSensorReadings([
      [row("r2", TENT_A, "2026-09-20T10:00:00Z"), row("r4", TENT_A, null)],
      [
        row("r1", TENT_B, "2026-09-21T10:00:00Z"),
        row("r3b", TENT_B, "2026-09-20T10:00:00Z"),
        row("r3a", TENT_B, "2026-09-20T10:00:00Z"),
      ],
    ]);
    expect(merged.map((r) => r.id)).toEqual(["r1", "r2", "r3a", "r3b", "r4"]);
    expect(mergeTentScopedSensorReadings([[...merged].reverse()]).map((r) => r.id)).toEqual(
      merged.map((r) => r.id),
    );
  });

  it("never reports an empty success while a window is pending, failed, or unresolved", () => {
    const ok = {
      data: [row("a", TENT_A, "2026-09-20T00:00:00Z")],
      isPending: false,
      isError: false,
    };
    const pending = { data: undefined, isPending: true, isError: false };
    const failed = { data: undefined, isPending: false, isError: true };
    expect(combineTentScopedSensorWindows(null, [])).toEqual({
      status: "pending",
      data: undefined,
    });
    expect(combineTentScopedSensorWindows([TENT_A, TENT_B], [ok, pending])).toEqual({
      status: "pending",
      data: undefined,
    });
    expect(combineTentScopedSensorWindows([TENT_A, TENT_B], [ok, failed])).toEqual({
      status: "error",
      data: undefined,
    });
    expect(combineTentScopedSensorWindows([], [])).toEqual({ status: "success", data: [] });
    const refreshFailed = { ...ok, isError: true };
    expect(combineTentScopedSensorWindows([TENT_A], [refreshFailed]).status).toBe("error");
    expect(combineTentScopedSensorWindows([TENT_A], [refreshFailed]).data).toHaveLength(1);
  });
});

describe("useSensorReadings({ tentIds })", () => {
  it("reads one bounded window per tent and never issues the unscoped read", async () => {
    io.responses.set(TENT_A, [row(A1, TENT_A, "2026-09-20T10:00:00Z")]);
    io.responses.set(TENT_B, [row(B1, TENT_B, "2026-09-21T10:00:00Z")]);
    const { result } = renderHook(
      () => useSensorReadings({ tentIds: [TENT_B, TENT_A, "not-a-uuid"] }, 500),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([B1, A1]);
    expect(io.requests).toHaveLength(2);
    expect(io.requests.every((r) => r.tentId !== null && r.limit === 500)).toBe(true);
    expect(io.requests.map((r) => r.tentId).sort()).toEqual([TENT_A, TENT_B]);
  });

  it("stays loading without any request while the scope is unresolved", async () => {
    const { result } = renderHook(() => useSensorReadings({ tentIds: null }, 500), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(io.requests).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("reports an error, not endless loading, when the scope read failed", async () => {
    const retryScope = vi.fn();
    const { result } = renderHook(
      () => useSensorReadings({ tentIds: null, scopeError: true, retryScope }, 500),
      { wrapper },
    );
    expect(result.current.isError).toBe(true);
    expect(result.current.isLoading).toBe(false);
    await result.current.refetch();
    expect(retryScope).toHaveBeenCalledTimes(1);
    expect(io.requests).toEqual([]);
  });

  it("a failed scope refetch is an error even while cached tent ids remain", async () => {
    // React Query keeps `data` when a tents refetch fails and sets `isError`,
    // so callers pass cached ids together with `scopeError: true`. The old
    // tent set may be stale or incomplete; its windows must not read as a
    // current, successful scope (Codex review on #1683).
    io.responses.set(TENT_A, [row(A1, TENT_A, "2026-09-20T10:00:00Z")]);
    const retryScope = vi.fn();
    const { result, rerender } = renderHook(
      ({ scopeError }: { scopeError: boolean }) =>
        useSensorReadings({ tentIds: [TENT_A], scopeError, retryScope }, 500),
      { wrapper, initialProps: { scopeError: false } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ scopeError: true });
    expect(result.current.isError).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.data).toBeUndefined();
    await result.current.refetch();
    expect(retryScope).toHaveBeenCalledTimes(1);

    // Once the scope read recovers, the same windows report success again.
    rerender({ scopeError: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual([A1]);
  });

  it("surfaces a failed tent window as an error instead of an empty result", async () => {
    io.failTents.add(TENT_B);
    io.responses.set(TENT_A, [row(A1, TENT_A, "2026-09-20T10:00:00Z")]);
    const { result } = renderHook(() => useSensorReadings({ tentIds: [TENT_A, TENT_B] }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("a resolved empty scope is an established empty result with no request", async () => {
    const { result } = renderHook(() => useSensorReadings({ tentIds: [] }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(io.requests).toEqual([]);
  });
});

describe("aggregate surfaces never issue the unscoped all-tents sensor read", () => {
  // @source-scan-justified: proves a forbidden call form is absent from each
  // consumer; the forbidden form is a call expression, not a resolvable value.
  const CONSUMERS = [
    "src/pages/Plants.tsx",
    "src/pages/Dashboard.tsx",
    "src/components/DashboardDailyGrowCheckPanel.tsx",
    "src/components/DailyGrowCheckOnboardingCard.tsx",
  ];
  it.each(CONSUMERS)("%s scopes useSensorReadings to tents", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).not.toMatch(/useSensorReadings\(\s*\)/);
    expect(source).not.toMatch(/useSensorReadings\(\s*undefined\b/);
    expect(source).toMatch(/useSensorReadings\(\s*\{\s*tentIds:/);
  });
});
