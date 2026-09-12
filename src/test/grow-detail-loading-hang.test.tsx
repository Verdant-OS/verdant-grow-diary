/**
 * useGrowDetailData loading boundaries.
 *
 * Keeps the page from waiting forever when route/auth prerequisites are
 * absent, the primary grow read hangs, or secondary reads never settle.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockUser = { id: string } | null;

const harness = vi.hoisted(() => ({
  growId: "grow-1" as string | undefined,
  user: { id: "user-1" } as MockUser,
  from: vi.fn(),
}));

vi.mock("@/lib/react-router-compat", () => ({
  useParams: () => ({ growId: harness.growId }),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: harness.user }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => harness.from(table),
  },
}));

import { useGrowDetailData } from "@/hooks/useGrowDetailData";

const GROW_ROW = {
  id: "grow-1",
  name: "Video 3 Walkthrough 2026-09-02",
  stage: "vegetative",
  grow_type: "indoor",
  is_archived: false,
  started_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  notes: null,
};

const SECOND_GROW_ROW = {
  ...GROW_ROW,
  id: "grow-2",
  name: "Second grow",
};

type QueryResult = {
  data: unknown;
  error: unknown;
};

function growQuery(result: QueryResult | Promise<QueryResult>) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    abortSignal: () => chain,
    maybeSingle: () => Promise.resolve(result),
  };
  return chain;
}

function neverSettlingQuery() {
  const pending = new Promise<never>(() => {});
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    in: () => chain,
    abortSignal: () => chain,
    maybeSingle: () => pending,
    then: pending.then.bind(pending),
  };
  return chain;
}

function relatedQuery(result: Promise<QueryResult>) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    in: () => chain,
    abortSignal: () => chain,
    maybeSingle: () => result,
    then: result.then.bind(result),
  };
  return chain;
}

beforeEach(() => {
  harness.growId = "grow-1";
  harness.user = { id: "user-1" };
  harness.from.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useGrowDetailData loading boundaries", () => {
  it("settles a signed-out load instead of leaving loading true", async () => {
    harness.user = null;

    const { result } = renderHook(() => useGrowDetailData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.notFound).toBe(false);
    expect(result.current.grow).toBeNull();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("settles a missing grow id as not found", async () => {
    harness.growId = undefined;

    const { result } = renderHook(() => useGrowDetailData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBe(false);
    expect(result.current.grow).toBeNull();
    expect(harness.from).not.toHaveBeenCalled();
  });

  it("turns a never-settling grow read into an error after the bounded wait", async () => {
    vi.useFakeTimers();
    harness.from.mockImplementation((table: string) => {
      if (table !== "grows") throw new Error(`Unexpected table: ${table}`);
      return growQuery(new Promise<QueryResult>(() => {}));
    });

    const { result } = renderHook(() => useGrowDetailData());
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_001);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(true);
    expect(result.current.notFound).toBe(false);
    expect(result.current.grow).toBeNull();
  });

  it("releases the grow header while related reads remain pending", async () => {
    harness.from.mockImplementation((table: string) => {
      if (table === "grows") return growQuery({ data: GROW_ROW, error: null });
      return neverSettlingQuery();
    });

    const { result } = renderHook(() => useGrowDetailData());

    await waitFor(() => expect(result.current.grow).toEqual(GROW_ROW));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(false);
    expect(result.current.notFound).toBe(false);
    expect(Object.values(result.current.counts)).toEqual(Array(9).fill("unavailable"));
    expect(result.current.status.level).toBe("unavailable");
    expect(result.current.recent.status).toBe("loading");
    expect(result.current.outcomes.status).toBe("loading");
    expect(harness.from).toHaveBeenCalledWith("tents");
  });

  it("ignores secondary results from a grow that was superseded", async () => {
    let growRead = 0;
    let tentRead = 0;
    let resolveFirstTent!: (result: QueryResult) => void;
    const firstTent = new Promise<QueryResult>((resolve) => {
      resolveFirstTent = resolve;
    });

    harness.from.mockImplementation((table: string) => {
      if (table === "grows") {
        const row = growRead++ === 0 ? GROW_ROW : SECOND_GROW_ROW;
        return growQuery({ data: row, error: null });
      }
      if (table === "tents") {
        tentRead += 1;
        if (tentRead === 1) return relatedQuery(firstTent);
        if (tentRead === 2) {
          return relatedQuery(Promise.resolve({ data: [{ id: "tent-2" }], error: null }));
        }
      }
      return neverSettlingQuery();
    });

    const { result, rerender } = renderHook(() => useGrowDetailData());
    await waitFor(() => expect(result.current.grow?.id).toBe("grow-1"));

    harness.growId = "grow-2";
    rerender();
    await waitFor(() => expect(result.current.grow?.id).toBe("grow-2"));
    await waitFor(() => expect(result.current.soleTentId).toBe("tent-2"));

    await act(async () => {
      resolveFirstTent({ data: [{ id: "tent-1" }], error: null });
      await Promise.resolve();
    });

    expect(result.current.grow?.id).toBe("grow-2");
    expect(result.current.soleTentId).toBe("tent-2");
  });
});
