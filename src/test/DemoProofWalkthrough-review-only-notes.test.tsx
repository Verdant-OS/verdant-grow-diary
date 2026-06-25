import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DemoProofWalkthrough from "@/pages/DemoProofWalkthrough";
import { buildDemoProofWalkthroughViewModel } from "@/lib/demoProofWalkthroughViewModel";

const WRITE_CAPABLE: Record<string, RegExp> = {
  "quick-log": /do not submit/i,
  "ai-doctor-readiness": /do not run AI/i,
  alerts: /do not create or change alerts/i,
  "action-queue": /do not approve actions/i,
};

describe("DemoProofWalkthrough — review-only per-link notes", () => {
  const vm = buildDemoProofWalkthroughViewModel();

  it("view model attaches reviewOnlyNote to every write-capable step", () => {
    for (const [id, re] of Object.entries(WRITE_CAPABLE)) {
      const step = vm.steps.find((s) => s.id === id);
      expect(step, `missing step ${id}`).toBeTruthy();
      expect(step!.reviewOnlyNote ?? "").toMatch(re);
      expect(step!.reviewOnlyNote ?? "").toMatch(/review only/i);
    }
  });

  it("read-only steps do not carry a reviewOnlyNote", () => {
    const readOnlyIds = vm.steps
      .map((s) => s.id)
      .filter((id) => !(id in WRITE_CAPABLE));
    for (const id of readOnlyIds) {
      const step = vm.steps.find((s) => s.id === id)!;
      expect(step.reviewOnlyNote ?? undefined).toBeFalsy();
    }
  });

  it("page renders review-only note next to each write-capable link", () => {
    render(
      <MemoryRouter>
        <DemoProofWalkthrough />
      </MemoryRouter>,
    );
    for (const [id, re] of Object.entries(WRITE_CAPABLE)) {
      const node = screen.getByTestId(
        `demo-proof-walkthrough-step-${id}-review-only-note`,
      );
      expect(node.textContent ?? "").toMatch(re);
    }
  });

  it("page still renders zero buttons (navigation links only)", () => {
    render(
      <MemoryRouter>
        <DemoProofWalkthrough />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole("button").length).toBe(0);
  });
});
