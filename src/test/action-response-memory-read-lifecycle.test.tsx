import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useActionResponseMemory,
  type ActionResponseMemoryState,
} from "@/hooks/useActionResponseMemory";
import type { ActionResponseMemoryLoadResult } from "@/lib/actionResponseMemoryService";
import { notifyManualSensorCorrectionConfirmed } from "@/lib/manualSensorCorrectionEvents";

const io = vi.hoisted(() => ({ owner: "owner-a" as string | null, load: vi.fn() }));
vi.mock("@/store/auth", () => {
  const owners = new Map<string, { id: string }>();
  return {
    useAuth: () => {
      if (io.owner && !owners.has(io.owner)) owners.set(io.owner, { id: io.owner });
      return { user: io.owner ? owners.get(io.owner) : null };
    },
  };
});
vi.mock("@/lib/actionResponseMemoryService", () => ({ loadActionResponseMemories: io.load }));
const loaded = (id: string): ActionResponseMemoryLoadResult => ({
  status: "ok",
  memories: [{ key: id } as never],
});
function deferred() {
  let resolve!: (value: ActionResponseMemoryLoadResult) => void;
  const promise = new Promise<ActionResponseMemoryLoadResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
const frames: ActionResponseMemoryState[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return renderHook(
    ({ grow, plant }) => {
      const result = useActionResponseMemory({ growId: grow, plantId: plant });
      frames.push(result.state);
      return result;
    },
    {
      initialProps: {
        grow: "grow-a",
        plant: "plant-a",
      },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
beforeEach(() => {
  io.owner = "owner-a";
  frames.length = 0;
  io.load.mockReset();
  io.load.mockResolvedValue(loaded("current"));
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
});

it("waits for connection on the first paused read and loads on reconnect", async () => {
  onlineManager.setOnline(false);
  const { result } = mount();
  expect(result.current.state).toEqual({ status: "loading" });
  expect(io.load).not.toHaveBeenCalled();
  act(() => onlineManager.setOnline(true));
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
});

it("keeps a pending read loading and passes explicit targeting", async () => {
  const first = deferred();
  io.load.mockReturnValueOnce(first.promise);
  const { result } = mount();
  expect(result.current.state).toEqual({ status: "loading" });
  expect(io.load).toHaveBeenCalledWith(
    expect.objectContaining({
      growId: "grow-a",
      plantId: "plant-a",
    }),
  );
  await act(async () => first.resolve(loaded("current")));
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
});

it.each(["grow", "plant"] as const)(
  "ignores a late response after the %s scope changes",
  async (field) => {
    const first = deferred();
    io.load.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount();
    rerender({
      grow: "grow-a",
      plant: "plant-a",
      [field]: field + "-b",
    });
    await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
    await act(async () => first.resolve(loaded("obsolete")));
    expect(result.current.state).toEqual(loaded("current"));
  },
);

it("ignores a late response after changing owner", async () => {
  const first = deferred();
  io.load.mockReturnValueOnce(first.promise);
  const { result, rerender } = mount();
  io.owner = "owner-b";
  rerender({ grow: "grow-a", plant: "plant-a" });
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  await act(async () => first.resolve(loaded("obsolete")));
  expect(result.current.state).toEqual(loaded("current"));
});

it("stays idle after logout even when the old read resolves", async () => {
  const first = deferred();
  io.load.mockReturnValueOnce(first.promise);
  const { result, rerender } = mount();
  io.owner = null;
  rerender({ grow: "grow-a", plant: "plant-a" });
  expect(result.current.state).toEqual({ status: "idle" });
  await act(async () => first.resolve(loaded("obsolete")));
  expect(result.current.state).toEqual({ status: "idle" });
  act(() => result.current.reload());
  expect(io.load).toHaveBeenCalledTimes(1);
});

it("shows unavailable after a failed read and recovers by explicit reload", async () => {
  io.load.mockResolvedValueOnce({ status: "failed", reason: "query_failed" });
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  expect(io.load).toHaveBeenCalledTimes(2);
});

it("withholds cached memories while a reload is paused and recovers on reconnect", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  onlineManager.setOnline(false);
  io.load.mockResolvedValue(loaded("refreshed"));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.state).toEqual({ status: "loading" }));
  expect(io.load).toHaveBeenCalledTimes(1);
  act(() => onlineManager.setOnline(true));
  await waitFor(() => expect(result.current.state).toEqual(loaded("refreshed")));
});

it("refreshes mounted evidence only for a confirmed correction from the same owner", async () => {
  const { result, unmount } = mount();
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  act(() => notifyManualSensorCorrectionConfirmed("other-owner", "tent-a"));
  expect(io.load).toHaveBeenCalledTimes(1);
  io.load.mockResolvedValue(loaded("corrected"));
  act(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a"));
  await waitFor(() => expect(result.current.state).toEqual(loaded("corrected")));
  expect(io.load).toHaveBeenCalledTimes(2);
  unmount();
  act(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a"));
  expect(io.load).toHaveBeenCalledTimes(2);
});

it("does not load while signed out", () => {
  io.owner = null;
  const { result } = mount();
  expect(result.current.state).toEqual({ status: "idle" });
  expect(io.load).not.toHaveBeenCalled();
});
it("sanitizes a rejected load into unavailable", async () => {
  io.load.mockRejectedValueOnce(new Error("PRIVATE"));
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
});
it("distinguishes a completed empty read", async () => {
  io.load.mockResolvedValueOnce({ status: "ok", memories: [] });
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual({ status: "ok", memories: [] }));
});

it.each(["owner", "grow", "plant", "logout"] as const)(
  "withholds old memories on every render immediately after %s changes",
  async (field) => {
    const view = mount();
    await waitFor(() => expect(view.result.current.state).toEqual(loaded("current")));
    io.load.mockReturnValue(new Promise(() => {}));
    frames.length = 0;
    if (field === "owner") io.owner = "owner-b";
    if (field === "logout") io.owner = null;
    view.rerender({
      grow: field === "grow" ? "grow-b" : "grow-a",
      plant: field === "plant" ? "plant-b" : "plant-a",
    });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.status !== "ok")).toBe(true);
  },
);
