import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildPhenoHuntView } from "@/lib/phenoHuntViewAdapter";
import type { UsePhenoHuntViewResult } from "@/hooks/usePhenoHuntView";

const harness = vi.hoisted(() => ({
  result: null as UsePhenoHuntViewResult | null,
}));

vi.mock("@/hooks/usePhenoHuntView", () => ({
  usePhenoHuntView: () => {
    if (!harness.result) throw new Error("showcase test result not configured");
    return harness.result;
  },
}));

import PhenoHuntShowcase from "@/pages/PhenoHuntShowcase";

afterEach(() => {
  cleanup();
  harness.result = null;
});

describe("PhenoHuntShowcase product truth", () => {
  it("labels account rows as saved and keeps Fight Night decisions in the writable workspace", () => {
    const data = buildPhenoHuntView({
      candidates: [
        {
          candidateNumber: 1,
          name: "Plant One",
          decision: "keep",
          traits: { nose: 8, resin: 8, structure: 7, yield: 6, breeding: 7 },
          aroma: [],
          tags: [],
          plantType: "photoperiod",
          stage: "flower",
        },
        {
          candidateNumber: 2,
          name: "Plant Two",
          decision: "hold",
          traits: { nose: 7, resin: 7, structure: 8, yield: 7, breeding: 6 },
          aroma: [],
          tags: [],
          plantType: "photoperiod",
          stage: "flower",
        },
      ],
      keepers: [],
      crosses: [],
      clones: [],
    });
    harness.result = {
      status: "ready",
      source: "live",
      meta: { name: "Summer Hunt", packLabel: null, packSize: 2 },
      data,
      cloneRowsByKeeperId: {},
      retry: vi.fn(),
    };

    render(
      <MemoryRouter initialEntries={["/pheno-hunts/hunt-1/showcase"]}>
        <Routes>
          <Route path="/pheno-hunts/:id/showcase" element={<PhenoHuntShowcase />} />
        </Routes>
      </MemoryRouter>,
    );

    const source = screen.getByTestId("pheno-hunt-showcase-source");
    expect(source).toHaveTextContent(/^Saved hunt — Summer Hunt · 2 candidates\.$/);
    expect(source).not.toHaveTextContent(/\blive\b/i);
    expect(screen.queryByTestId("pheno-fight-call-a")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open hunt workspace/i })).toHaveAttribute(
      "href",
      "/pheno-hunts/hunt-1/workspace",
    );
  });
});
