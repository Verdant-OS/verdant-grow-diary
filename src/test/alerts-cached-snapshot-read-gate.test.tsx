import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import AlertsAutoPersistForGrow from "@/components/AlertsAutoPersistForGrow";

const h = vi.hoisted(() => ({ state: null as SnapshotState | null, persist: vi.fn() }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [{ id: "tent-a", stage: "veg" }], isFetched: true }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({ useLatestSensorSnapshot: () => h.state }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/usePersistEnvironmentAlerts", () => ({
  usePersistEnvironmentAlerts: (args: unknown) => h.persist(args),
}));

beforeEach(() => {
  h.persist.mockClear();
  h.state = {
    status: "ok",
    snapshot: {
      ...EMPTY_SNAPSHOT,
      source: "manual",
      temp: 40,
      rh: 55,
      vpd: 1.1,
      tent_id: "tent-a",
      ts: new Date().toISOString(),
    },
  };
});
describe("alert evidence waits for a completed current read", () => {
  it.each([
    ["manual", "isPaused"],
    ["live", "isPaused"],
    ["manual", "isFetching"],
    ["live", "isFetching"],
  ] as const)("does not pass cached %s evidence to persistence during %s", (source, flag) => {
    h.state = { ...h.state!, snapshot: { ...h.state!.snapshot, source }, [flag]: true };
    const view = render(<AlertsAutoPersistForGrow growId="grow-a" stage="veg" />);
    expect(h.persist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: null,
        tentId: null,
        quality: expect.objectContaining({ quality: "unavailable" }),
      }),
    );
    h.state = { ...h.state, [flag]: false };
    view.rerender(<AlertsAutoPersistForGrow growId="grow-a" stage="veg" />);
    expect(h.persist).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshot: h.state.snapshot, tentId: "tent-a" }),
    );
  });
  it("does not pass retained evidence after a failed read", () => {
    h.state = { ...h.state!, status: "unavailable" };
    render(<AlertsAutoPersistForGrow growId="grow-a" />);
    expect(h.persist).toHaveBeenLastCalledWith(
      expect.objectContaining({ snapshot: null, tentId: null }),
    );
  });
});
