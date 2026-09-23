/**
 * pheno-hunt-demo-stage-propagation.test — the demo page must carry each
 * candidate's stage into the comparability guard, not only its plant type.
 *
 * The shipped fixture is uniform (every candidate at the cure), so dropping
 * `stage` from the page's mapping changes nothing on screen and the page test
 * cannot see it. Here the first keeper is moved to "seedling" (rank 1 against
 * the cure's 6). That gap must reach the guard and surface as stage_mismatch on
 * both the contenders board and fight night. If the page's mapping drops
 * `stage`, the guard reads a null stage rank, skips the stage check, and the
 * reason disappears.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import PhenoHuntDemo from "@/pages/PhenoHuntDemo";
import { COMPARABILITY_REASON_MESSAGES } from "@/lib/phenoContendersViewModel";

vi.mock("@/lib/demo/phenoHuntDemoFixture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/demo/phenoHuntDemoFixture")>();
  const firstKeeper = actual.DEMO_CANDIDATES.find((c) => c.verdict === "keep");
  return {
    ...actual,
    DEMO_CANDIDATES: actual.DEMO_CANDIDATES.map((c) =>
      c === firstKeeper ? { ...c, stage: "seedling" } : c,
    ) as unknown as typeof actual.DEMO_CANDIDATES,
  };
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PhenoHuntDemo />
    </MemoryRouter>,
  );
}

describe("PhenoHuntDemo stage propagation", () => {
  it("surfaces a stage gap on the contenders board", () => {
    renderPage();
    const board = screen.getByTestId("pheno-contenders");
    const banner = within(board).getByTestId("pheno-comparability-banner");
    expect(banner.textContent).toContain(COMPARABILITY_REASON_MESSAGES.stage_mismatch);
    // Plant type still reaches the guard, so the banner is about stage alone.
    expect(banner.textContent).not.toContain(COMPARABILITY_REASON_MESSAGES.type_unknown);
  });

  it("surfaces a stage gap on fight night (first keeper vs second keeper)", () => {
    renderPage();
    const fight = screen.getByTestId("pheno-fight");
    const banner = within(fight).getByTestId("pheno-comparability-banner");
    expect(banner.textContent).toContain(COMPARABILITY_REASON_MESSAGES.stage_mismatch);
    expect(banner.textContent).not.toContain(COMPARABILITY_REASON_MESSAGES.type_unknown);
    expect(within(fight).queryByTestId("pheno-fight-tally")).toBeNull();
  });
});
