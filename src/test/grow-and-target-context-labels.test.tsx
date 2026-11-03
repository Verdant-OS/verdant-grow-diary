/**
 * Grower bug report 2026-11-03:
 *  - item 17: Timeline "Recent Quick Logs" rows did not say which tent or plant they belong to.
 *  - item 18: Plant and Tent detail pages did not show their grow, so same-name
 *    plants in two grows could not be told apart.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { describe, expect, it, vi } from "vitest";
import { resolveDetailGrowContext } from "@/lib/detailPageGrowContextRules";
import { resolveQuickLogRowTargetLabel } from "@/lib/quickLogHistoryTargetLabelRules";

const growsState = vi.hoisted(() => ({
  value: {} as {
    grows?: Array<{ id: string; name: string }>;
    archivedGrows?: Array<{ id: string; name: string }>;
    loading?: boolean;
  },
}));
vi.mock("@/store/grows", () => ({ useGrows: () => growsState.value }));

import { DetailGrowContextLine } from "@/components/DetailGrowContextLine";

const plants = new Map([
  ["p1", "Dolce di Pledge #1"],
  ["p2", "Ducle De Pledge"],
]);
const tents = new Map([["t1", "Vegetation Bravo"]]);
const plantTents = new Map([["p1", "t1"]]);
const dir = { plantNamesById: plants, tentNamesById: tents, plantTentIdsById: plantTents };

describe("resolveQuickLogRowTargetLabel (item 17)", () => {
  it("names the plant and its tent", () => {
    expect(resolveQuickLogRowTargetLabel({ plantId: "p1", tentId: "t1" }, dir)).toBe(
      "Plant: Dolce di Pledge #1 · Tent: Vegetation Bravo",
    );
  });
  it("falls back to the plant's tent assignment when the row has no tent id", () => {
    expect(resolveQuickLogRowTargetLabel({ plantId: "p1", tentId: null }, dir)).toBe(
      "Plant: Dolce di Pledge #1 · Tent: Vegetation Bravo",
    );
  });
  it("names a whole-tent entry by its tent only", () => {
    expect(resolveQuickLogRowTargetLabel({ plantId: null, tentId: "t1" }, dir)).toBe(
      "Tent: Vegetation Bravo",
    );
  });
  it("never guesses a name for an unknown id", () => {
    expect(resolveQuickLogRowTargetLabel({ plantId: "gone", tentId: null }, dir)).toBe(
      "Plant: name unavailable",
    );
  });
  it("shows nothing for grow-level rows or before names load", () => {
    expect(resolveQuickLogRowTargetLabel({ plantId: null, tentId: null }, dir)).toBeNull();
    expect(resolveQuickLogRowTargetLabel({ plantId: "p1", tentId: "t1" }, null)).toBeNull();
    expect(
      resolveQuickLogRowTargetLabel(
        { plantId: "p1", tentId: null },
        { plantNamesById: null, tentNamesById: null },
      ),
    ).toBeNull();
  });
});

describe("resolveDetailGrowContext (item 18)", () => {
  const grows = [
    { id: "g1", name: "Skunk Gas Run" },
    { id: "g2", name: "Winter Run" },
  ];
  it("names the active grow", () => {
    expect(resolveDetailGrowContext({ growId: "g2", grows })).toEqual({
      kind: "named",
      growId: "g2",
      name: "Winter Run",
      archived: false,
    });
  });
  it("names an archived grow and marks it archived", () => {
    expect(
      resolveDetailGrowContext({
        growId: "g9",
        grows,
        archivedGrows: [{ id: "g9", name: "Summer Run" }],
      }),
    ).toMatchObject({ kind: "named", name: "Summer Run", archived: true });
  });
  it("is honest about missing or unknown grows and waits while loading", () => {
    expect(resolveDetailGrowContext({ growId: null, grows })).toEqual({ kind: "none" });
    expect(resolveDetailGrowContext({ growId: "zz", grows })).toEqual({ kind: "unavailable" });
    expect(resolveDetailGrowContext({ growId: "zz", grows: undefined })).toEqual({
      kind: "loading",
    });
    expect(resolveDetailGrowContext({ growId: "zz", grows, loading: true })).toEqual({
      kind: "loading",
    });
  });
});

describe("DetailGrowContextLine (item 18)", () => {
  function renderLine(growId: string | null) {
    return render(
      <MemoryRouter>
        <DetailGrowContextLine growId={growId} testId="ctx" />
      </MemoryRouter>,
    );
  }
  it("tells two same-name plants apart by grow, with a link to the grow", () => {
    growsState.value = {
      grows: [
        { id: "g1", name: "Skunk Gas Run" },
        { id: "g2", name: "Winter Run" },
      ],
      archivedGrows: [],
      loading: false,
    };
    const first = renderLine("g1");
    expect(screen.getByTestId("ctx")).toHaveTextContent("Grow: Skunk Gas Run");
    expect(screen.getByRole("link", { name: "Skunk Gas Run" })).toHaveAttribute(
      "href",
      "/grows/g1",
    );
    first.unmount();
    renderLine("g2");
    expect(screen.getByTestId("ctx")).toHaveTextContent("Grow: Winter Run");
  });
  it("renders nothing while grows load and says so when none is assigned", () => {
    growsState.value = {};
    const loading = renderLine("g1");
    expect(screen.queryByTestId("ctx")).toBeNull();
    loading.unmount();
    growsState.value = { grows: [], archivedGrows: [], loading: false };
    renderLine(null);
    expect(screen.getByTestId("ctx")).toHaveTextContent("Grow: No grow assigned");
  });
});
