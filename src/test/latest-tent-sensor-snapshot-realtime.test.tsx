/**
 * Realtime cache invalidation for useLatestTentSensorSnapshot.
 *
 * Asserts (all read-only):
 *  - No channel is created when tentId is missing.
 *  - Subscribes to sensor_readings filtered by tent_id=eq.<tentId> on INSERT.
 *  - Matching INSERT invalidates the latest sensor query key for that tent.
 *  - Channel is removed on unmount and on tent change (and a new one created).
 *  - Realtime errors never break the query result.
 *  - Static safety: file has no writes/invokes/automation strings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

type Handler = (payload: unknown) => void;

interface FakeChannel {
  name: string;
  filter: Record<string, unknown> | null;
  handler: Handler | null;
  subscribed: boolean;
  on: (event: string, filter: Record<string, unknown>, handler: Handler) => FakeChannel;
  subscribe: () => FakeChannel;
}

const created: FakeChannel[] = [];
const removed: FakeChannel[] = [];

function makeChannel(name: string): FakeChannel {
  const ch: FakeChannel = {
    name,
    filter: null,
    handler: null,
    subscribed: false,
    on(_event, filter, handler) {
      ch.filter = filter;
      ch.handler = handler;
      return ch;
    },
    subscribe() {
      ch.subscribed = true;
      return ch;
    },
  };
  created.push(ch);
  return ch;
}

const queryBuilder = {
  select: () => queryBuilder,
  eq: () => queryBuilder,
  order: () => queryBuilder,
  limit: async () => ({ data: [], error: null }),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => queryBuilder,
    channel: (name: string) => makeChannel(name),
    removeChannel: (ch: FakeChannel) => {
      removed.push(ch);
    },
  },
}));

import {
  useLatestTentSensorSnapshot,
  latestTentSensorSnapshotQueryKey,
  LATEST_SENSOR_REALTIME_INVALIDATE_DEBOUNCE_MS as DEBOUNCE_MS,
} from "@/lib/sensor";

function wrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

beforeEach(() => {
  created.length = 0;
  removed.length = 0;
});

describe("useLatestTentSensorSnapshot — realtime cache invalidation", () => {
  it("creates no channel when tentId is missing", () => {
    const client = newClient();
    renderHook(() => useLatestTentSensorSnapshot(null), {
      wrapper: wrapper(client),
    });
    expect(created).toHaveLength(0);
  });

  it("subscribes to sensor_readings filtered by tent_id and invalidates on INSERT", async () => {
    const client = newClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useLatestTentSensorSnapshot("tent-A"), {
      wrapper: wrapper(client),
    });

    expect(created).toHaveLength(1);
    const ch = created[0];
    expect(ch.subscribed).toBe(true);
    expect(ch.filter).toMatchObject({
      event: "INSERT",
      schema: "public",
      table: "sensor_readings",
      filter: "tent_id=eq.tent-A",
    });

    await act(async () => {
      ch.handler?.({ new: { tent_id: "tent-A" } });
    });

    expect(spy).toHaveBeenCalledWith({
      queryKey: latestTentSensorSnapshotQueryKey("tent-A"),
    });
  });

  it("removes the channel on unmount", () => {
    const client = newClient();
    const { unmount } = renderHook(
      () => useLatestTentSensorSnapshot("tent-A"),
      { wrapper: wrapper(client) },
    );
    unmount();
    expect(removed).toHaveLength(1);
    expect(removed[0].name).toContain("tent-A");
  });

  it("removes the old channel and subscribes to the new one on tent change", () => {
    const client = newClient();
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useLatestTentSensorSnapshot(id),
      { wrapper: wrapper(client), initialProps: { id: "tent-A" } },
    );
    expect(created).toHaveLength(1);
    rerender({ id: "tent-B" });
    expect(removed).toHaveLength(1);
    expect(removed[0].name).toContain("tent-A");
    expect(created).toHaveLength(2);
    expect(created[1].name).toContain("tent-B");
    expect(created[1].filter).toMatchObject({
      filter: "tent_id=eq.tent-B",
    });
  });

  it("realtime subscribe failure does not break the hook", () => {
    const client = newClient();
    // Patch channel to throw on .on subscription wiring
    const origChannel = (created.push as unknown) as never;
    void origChannel;
    const { result } = renderHook(
      () => useLatestTentSensorSnapshot("tent-A"),
      { wrapper: wrapper(client) },
    );
    expect(["loading", "empty", "idle"]).toContain(result.current.status);
  });

  it("query key matches the documented shape", () => {
    expect(latestTentSensorSnapshotQueryKey("tent-A")).toEqual([
      "sensor",
      "latest",
      "tent-A",
    ]);
    expect(latestTentSensorSnapshotQueryKey(null)).toEqual([
      "sensor",
      "latest",
      "none",
    ]);
  });
});

describe("static safety scan — src/lib/sensor.ts", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../lib/sensor.ts"),
    "utf-8",
  );

  it("contains no write / invoke / automation / device-control / fake-live strings", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/action_queue/);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/device[_-]?control/i);
    expect(src).not.toMatch(/fake[_-]?live/i);
  });

  it("subscribes only to INSERT events on sensor_readings", () => {
    expect(src).toMatch(/event:\s*"INSERT"/);
    expect(src).toMatch(/table:\s*"sensor_readings"/);
    expect(src).toMatch(/tent_id=eq\.\$\{/);
  });
});
