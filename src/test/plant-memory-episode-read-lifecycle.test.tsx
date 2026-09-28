import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  usePlantMemoryEpisodes,
  type PlantMemoryEpisodesState,
} from "@/hooks/usePlantMemoryEpisodes";
import type { PlantMemoryEpisodeLoad } from "@/lib/plantMemoryEpisodeService";
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
vi.mock("@/lib/plantMemoryEpisodeService", () => ({ loadPlantMemoryEpisodes: io.load }));
const loaded = (id: string): PlantMemoryEpisodeLoad => ({
  status: "ok",
  episodes: [{ episodeKey: id } as never],
});
function deferred() {
  let resolve!: (value: PlantMemoryEpisodeLoad) => void;
  const promise = new Promise<PlantMemoryEpisodeLoad>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const clients: QueryClient[] = [];
const frames: PlantMemoryEpisodesState[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return renderHook(
    ({ grow, plant, action, sensors }) => {
      const result = usePlantMemoryEpisodes({
        growId: grow,
        plantId: plant,
        actionQueueId: action,
        includeSensorEvidence: sensors,
      });
      frames.push(result.state);
      return result;
    },
    {
      initialProps: {
        grow: "grow-a",
        plant: "plant-a",
        action: null as string | null,
        sensors: true,
      },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
beforeEach(() => {
  frames.length = 0;
  io.owner = "owner-a";
  io.load.mockReset();
  io.load.mockResolvedValue(loaded("current"));
  onlineManager.setOnline(true);
});

it.each(["owner", "grow", "plant", "action", "sensors", "logout"] as const)(
  "withholds old episodes on every render immediately after %s changes",
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
      action: field === "action" ? "action-b" : null,
      sensors: field !== "sensors",
    });
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.status !== "ok")).toBe(true);
  },
);
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
      actionQueueId: null,
      includeSensorEvidence: true,
      nowIso: expect.any(String),
    }),
  );
  await act(async () => first.resolve(loaded("current")));
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
});

it.each(["grow", "plant", "action"] as const)(
  "ignores a late response after the %s scope changes",
  async (field) => {
    const first = deferred();
    io.load.mockReturnValueOnce(first.promise);
    const { result, rerender } = mount();
    rerender({
      grow: "grow-a",
      plant: "plant-a",
      action: null,
      sensors: true,
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
  rerender({ grow: "grow-a", plant: "plant-a", action: null, sensors: true });
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  await act(async () => first.resolve(loaded("obsolete")));
  expect(result.current.state).toEqual(loaded("current"));
});

it("stays idle after logout even when the old read resolves", async () => {
  const first = deferred();
  io.load.mockReturnValueOnce(first.promise);
  const { result, rerender } = mount();
  io.owner = null;
  rerender({ grow: "grow-a", plant: "plant-a", action: null, sensors: true });
  expect(result.current.state).toEqual({ status: "idle" });
  await act(async () => first.resolve(loaded("obsolete")));
  expect(result.current.state).toEqual({ status: "idle" });
  act(() => result.current.reload());
  expect(io.load).toHaveBeenCalledTimes(1);
});

it("shows unavailable after a failed read and recovers by explicit reload", async () => {
  io.load.mockResolvedValueOnce({ status: "error", message: "PRIVATE provider detail" });
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  expect(io.load).toHaveBeenCalledTimes(2);
});

it("withholds cached episodes while a reload is paused and recovers on reconnect", async () => {
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

it("sanitizes a thrown read without an unhandled rejection", async () => {
  io.load.mockRejectedValueOnce(new Error("PRIVATE transport detail"));
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
  expect(io.load).toHaveBeenCalledTimes(1);
});

it("withholds old episodes after a reload fails", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  io.load.mockResolvedValue({ status: "error", message: "PRIVATE provider detail" });
  act(() => result.current.reload());
  await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
});

it("does not query or reload without a grow", () => {
  const { result, rerender } = mount();
  rerender({ grow: "", plant: "plant-a", action: null, sensors: true });
  expect(result.current.state).toEqual({ status: "idle" });
  const before = io.load.mock.calls.length;
  act(() => result.current.reload());
  expect(io.load).toHaveBeenCalledTimes(before);
});

it("does not refresh the lightweight lane for sensor corrections", async () => {
  const { result, rerender } = mount();
  rerender({ grow: "grow-a", plant: "plant-a", action: null, sensors: false });
  await waitFor(() => expect(result.current.state).toEqual(loaded("current")));
  const before = io.load.mock.calls.length;
  act(() => notifyManualSensorCorrectionConfirmed("owner-a", "tent-a"));
  expect(io.load).toHaveBeenCalledTimes(before);
});
