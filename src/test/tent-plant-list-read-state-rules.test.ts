import { describe, expect, it } from "vitest";
import { buildTentPlantListReadView } from "@/lib/tentPlantListReadStateRules";

const plant = (id: string) => ({ id, name: `Plant ${id}` });

describe("buildTentPlantListReadView", () => {
  it("treats two completed reads as authoritative even when both lists are empty", () => {
    const view = buildTentPlantListReadView(
      { data: [], isPending: false, isFetching: false, fetchStatus: "idle" },
      { data: [], isPending: false, isFetching: false, fetchStatus: "idle" },
    );
    expect(view).toMatchObject({
      plants: [],
      complete: true,
      showRows: true,
      canRetry: false,
      status: "ready",
      countNotice: null,
      availableNotice: null,
      message: null,
    });
  });

  it("prefers unavailable over paused, loading, and refreshing sibling reads", () => {
    const view = buildTentPlantListReadView(
      { data: [plant("a")], isError: true },
      { data: [plant("b")], isPaused: true, fetchStatus: "paused" },
    );
    expect(view.status).toBe("unavailable");
    expect(view.canRetry).toBe(true);
    expect(view.complete).toBe(false);
    expect(view.message).toContain("Retry to check plants");
  });

  it("prefers paused over loading when the all-plants read is still unresolved", () => {
    const view = buildTentPlantListReadView(
      { data: undefined, isPaused: true, fetchStatus: "paused" },
      { data: [plant("a")], isPending: true },
    );
    expect(view.status).toBe("paused");
    expect(view.message).toContain("Waiting for connection");
    expect(view.complete).toBe(false);
  });

  it("surfaces refreshing while cached rows remain visible but counts stay unverified", () => {
    const view = buildTentPlantListReadView(
      { data: [plant("a")], isFetching: true, fetchStatus: "fetching" },
      { data: [plant("a")], isFetching: true, fetchStatus: "fetching" },
    );
    expect(view).toMatchObject({
      status: "refreshing",
      complete: false,
      showRows: true,
      plants: [plant("a")],
      countNotice: "Plant counts not verified",
      availableNotice:
        "Available plants are shown; the complete list and counts have not been verified.",
      message: "Refreshing plants in this tent…",
    });
  });

  it("keeps survivor rows from the active query when the all-plants read has not completed", () => {
    const view = buildTentPlantListReadView(
      { data: undefined, isPending: true },
      { data: [plant("active-only")], isPending: false, fetchStatus: "idle" },
    );
    expect(view.plants).toEqual([plant("active-only")]);
    expect(view.showRows).toBe(true);
    expect(view.complete).toBe(false);
    expect(view.availableNotice).toContain("Available plants are shown");
  });

  it("does not reuse active survivors once the all-plants read completes empty", () => {
    const view = buildTentPlantListReadView(
      { data: [], isPending: false, fetchStatus: "idle" },
      { data: [plant("stale-active")], isPending: false, fetchStatus: "idle" },
    );
    expect(view.plants).toEqual([]);
    expect(view.complete).toBe(true);
    expect(view.availableNotice).toBeNull();
  });

  it("retains partial all-plants rows before the read completes when the cache is non-empty", () => {
    const view = buildTentPlantListReadView(
      { data: [plant("cached")], isPending: true },
      { data: [plant("active")], isPending: true },
    );
    expect(view.plants).toEqual([plant("cached")]);
    expect(view.showRows).toBe(true);
    expect(view.complete).toBe(false);
  });
});
