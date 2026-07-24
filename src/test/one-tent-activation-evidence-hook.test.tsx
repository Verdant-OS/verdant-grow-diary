import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const TENT_ID = "22222222-2222-4222-8222-222222222222";
const PLANT_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  results: {
    diary_entries: { data: [] as unknown[], error: null as unknown },
    grow_events: { data: [] as unknown[], error: null as unknown },
  },
  limits: {
    diary_entries: vi.fn(),
    grow_events: vi.fn(),
  },
  authUserId: "44444444-4444-4444-8444-444444444444" as string | null,
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({
    user: mocks.authUserId ? { id: mocks.authUserId } : null,
  }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function chain(table: "diary_entries" | "grow_events") {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: mocks.limits[table],
    };
    return builder;
  }
  mocks.from.mockImplementation((table: "diary_entries" | "grow_events") => chain(table));
  return { supabase: { from: mocks.from } };
});

import { useOneTentActivationEvidence } from "@/hooks/useOneTentActivationEvidence";

const scope = { growId: GROW_ID, tentId: TENT_ID, plantId: PLANT_ID };

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authUserId = USER_ID;
  mocks.results.diary_entries = { data: [], error: null };
  mocks.results.grow_events = { data: [], error: null };
  mocks.limits.diary_entries.mockImplementation(async () => mocks.results.diary_entries);
  mocks.limits.grow_events.mockImplementation(async () => mocks.results.grow_events);
});

describe("useOneTentActivationEvidence", () => {
  it("counts a grow_events-only watering as connected plant memory", async () => {
    mocks.results.grow_events.data = [
      {
        id: "event-1",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        plant_id: PLANT_ID,
        occurred_at: "2026-07-19T12:00:00.000Z",
        event_type: "watering",
        source: "manual",
        is_deleted: false,
      },
    ];

    const { result } = renderHook(() => useOneTentActivationEvidence(scope), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.summary).toMatchObject({
      count: 1,
      hasEvidence: true,
      latestSource: "grow_events",
    });
    expect(mocks.from).toHaveBeenCalledWith("diary_entries");
    expect(mocks.from).toHaveBeenCalledWith("grow_events");
  });

  it("refetches after a confirmed Quick Log entry-created event", async () => {
    const { result } = renderHook(() => useOneTentActivationEvidence(scope), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.status).toBe("ok"));
    expect(result.current.summary.hasEvidence).toBe(false);

    mocks.results.grow_events.data = [
      {
        id: "event-after-save",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        plant_id: PLANT_ID,
        occurred_at: "2026-07-19T12:01:00.000Z",
        event_type: "feeding",
        source: "manual",
        is_deleted: false,
      },
    ];
    act(() => {
      window.dispatchEvent(new CustomEvent(QUICK_LOG_V2_ENTRY_CREATED_EVENT));
    });
    await waitFor(() => expect(result.current.summary.hasEvidence).toBe(true));
    expect(mocks.limits.grow_events).toHaveBeenCalledTimes(2);
  });

  it("fails closed as unavailable when either RLS read fails", async () => {
    mocks.results.diary_entries.error = new Error("RLS read failed");
    const { result } = renderHook(() => useOneTentActivationEvidence(scope), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.summary.hasEvidence).toBe(false);
  });

  it("idles without querying for incomplete or non-UUID scope", () => {
    const { result } = renderHook(
      () =>
        useOneTentActivationEvidence({
          growId: "demo-grow",
          tentId: null,
          plantId: null,
        }),
      { wrapper: makeWrapper() },
    );
    expect(result.current.status).toBe("idle");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not reuse activation evidence after an authenticated owner swap", async () => {
    mocks.results.grow_events.data = [
      {
        id: "owner-a-event",
        grow_id: GROW_ID,
        tent_id: TENT_ID,
        plant_id: PLANT_ID,
        occurred_at: "2026-07-19T12:00:00.000Z",
        event_type: "watering",
        source: "manual",
        is_deleted: false,
      },
    ];
    const { result, rerender } = renderHook(() => useOneTentActivationEvidence(scope), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.summary.hasEvidence).toBe(true));

    mocks.authUserId = "55555555-5555-4555-8555-555555555555";
    mocks.results.grow_events.data = [];
    rerender();
    await waitFor(() => {
      expect(result.current.status).toBe("ok");
      expect(result.current.summary.hasEvidence).toBe(false);
    });
    expect(mocks.limits.grow_events).toHaveBeenCalledTimes(2);
  });
});

describe("activation evidence read boundary", () => {
  const source = readFileSync(
    resolve(__dirname, "../hooks/useOneTentActivationEvidence.ts"),
    "utf8",
  );

  it("is owner-keyed, RLS-read-only, and has no control or AI side effects", () => {
    expect(source).toMatch(/buildPrivateGrowQueryKey/);
    expect(source).toMatch(/useAuth/);
    expect(source).toMatch(/\.from\("diary_entries"\)/);
    expect(source).toMatch(/\.from\("grow_events"\)/);
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
    expect(source).not.toMatch(/\.rpc\s*\(/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/service_role/i);
    expect(source).not.toMatch(/device[-_ ]command/i);
  });
});
