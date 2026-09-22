import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useManualSensorCorrectionRefresh } from "@/hooks/useManualSensorCorrectionRefresh";
import { notifyManualSensorCorrectionConfirmed } from "@/lib/manualSensorCorrectionEvents";

const key = ["latest-sensor-snapshot", "owner-a", "grow-a", "effective-v1"];
let receiver: { onmessage: ((event: MessageEvent) => void) | null };
const clients: QueryClient[] = [];
const stops: Array<() => void> = [];
beforeEach(() => {
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor() {
        register(this);
      }
      postMessage() {}
      close() {}
    },
  );
});
function register(value: typeof receiver) {
  receiver = value;
}
afterEach(() => {
  cleanup();
  stops.splice(0).forEach((stop) => stop());
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});
function remote(ownerId = "owner-a") {
  act(() =>
    receiver.onmessage?.(
      new MessageEvent("message", {
        data: { version: 1, ownerId, tentId: "tent-a" },
      }),
    ),
  );
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const old = { value: 25, source: "manual", ts: "2026-09-16T08:00:00Z" };
  client.setQueryData(key, old);
  const read = vi.fn().mockResolvedValue({ ...old, value: 24 });
  const observer = new QueryObserver(client, { queryKey: key, queryFn: read, staleTime: Infinity });
  stops.push(observer.subscribe(() => {}));
  const hook = renderHook(
    ({ owner }: { owner: string | null }) => useManualSensorCorrectionRefresh(owner),
    {
      initialProps: { owner: "owner-a" } as { owner: string | null },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, observer, read, old, ...hook };
}

it("does not create a transport or throw when a standalone shell has no query cache", () => {
  const construct = vi.fn();
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      constructor() {
        construct();
      }
    },
  );
  expect(() => renderHook(() => useManualSensorCorrectionRefresh("owner-a"))).not.toThrow();
  expect(construct).not.toHaveBeenCalled();
});

it("reloads an active historical reading through the local query after a remote correction", async () => {
  const { observer, read, old } = mount();
  let resolve!: (data: typeof old) => void;
  read.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  remote();
  expect(read).toHaveBeenCalledOnce();
  expect(observer.getCurrentResult().isFetching).toBe(true);
  expect(observer.getCurrentResult().data).toEqual(old);
  await act(async () => resolve({ ...old, value: 24 }));
  await waitFor(() => expect(observer.getCurrentResult().data).toEqual({ ...old, value: 24 }));
  expect(observer.getCurrentResult().isFetching).toBe(false);
});

it("exposes failed refetch as error instead of treating the notification as fresh evidence", async () => {
  const { observer, read, old } = mount();
  read.mockRejectedValueOnce(new Error("read unavailable"));
  remote();
  await waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
  expect(observer.getCurrentResult().data).toEqual(old);
  expect(read).toHaveBeenCalledOnce();
});

it("ignores another owner's correction", () => {
  const { read } = mount();
  remote("owner-b");
  expect(read).not.toHaveBeenCalled();
});

it.each([null, "owner-b"])(
  "does not refresh a prior owner's cache after identity changes to %s",
  (owner) => {
    const { rerender, read } = mount();
    rerender({ owner });
    remote("owner-a");
    expect(read).not.toHaveBeenCalled();
  },
);

it("does not duplicate the same-tab save controller's invalidations", () => {
  const { read } = mount();
  act(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a"));
  expect(read).not.toHaveBeenCalled();
});

it("invalidates all nine sensor-derived query families and leaves unrelated private data alone", () => {
  const { client } = mount();
  const families = [
    ["grow", "sensors"],
    ["sensor_readings"],
    ["latest-sensor-snapshot"],
    ["plant-tent-environment"],
    ["environment-trends"],
    ["diary-range-report"],
    ["sensor", "latest"],
    ["reports-hub"],
    ["post-grow-report"],
  ];
  families.forEach((prefix) => client.setQueryData([...prefix, "inactive"], []));
  client.setQueryData(["plants", "owner-a"], []);
  remote();
  families.forEach((prefix) =>
    expect(client.getQueryState([...prefix, "inactive"])?.isInvalidated).toBe(true),
  );
  expect(client.getQueryState(["plants", "owner-a"])?.isInvalidated).toBe(false);
});
