import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "@/lib/react-router-compat";
import { buildOreozGelonadeDiaryView } from "@/lib/oreozGelonadeDiaryRules";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  refresh: vi.fn(),
}));

const view = buildOreozGelonadeDiaryView(
  [
    {
      id: "oreoz-1",
      name: "Oreoz One",
      strain: "Oreoz",
      candidate_label: "O-1",
      pheno_hunt_id: "hunt-1",
      grow_id: "grow-1",
      tent_id: "tent-1",
      stage: "flower",
    },
    {
      id: "gelonade-1",
      name: "Gelonade One",
      strain: "Gelonade",
      candidate_label: "G-1",
      pheno_hunt_id: null,
      grow_id: "grow-1",
      tent_id: "tent-1",
      stage: "vegetative",
    },
  ],
  {
    "oreoz-1": {
      plantId: "oreoz-1",
      huntId: "hunt-1",
      traits: { vigor: 4, structure: 3 },
      note: "Compact branching",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
  },
);

vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({
    loading: false,
    entitlement: {
      effectivePlanId: "pro_monthly",
      isActive: true,
      source: "subscription",
      hadProAccess: true,
    },
    refetch: () => {},
  }),
}));

vi.mock("@/hooks/useOreozGelonadeDiary", () => ({
  useOreozGelonadeDiary: () => ({
    status: "ready",
    view,
    scoresByPlant: {},
    scoresReady: true,
    error: null,
    refreshScores: mocks.refresh,
  }),
}));
vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: vi.fn() }));
vi.mock("@/lib/phenoCandidateScoresService", () => ({
  upsertCandidateScore: mocks.upsert,
}));

import OreozGelonadeDiaryComparison from "@/pages/OreozGelonadeDiaryComparison";
import CultivarDiaryProfile from "@/pages/CultivarDiaryProfile";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

afterEach(cleanup);
beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue({ ok: true });
  mocks.refresh.mockReset();
  mocks.refresh.mockResolvedValue({});
});

describe("Oreoz/Gelonade authenticated diary pages", () => {
  it("groups individual observations by trait without declaring a winner", () => {
    const { container } = render(
      <MemoryRouter>
        <OreozGelonadeDiaryComparison />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Oreoz vs Gelonade expression in your diary" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("trait-comparison-vigor")).toHaveTextContent("O-1");
    expect(screen.getByTestId("trait-comparison-vigor")).toHaveTextContent("G-1");
    expect(screen.getByText("Compact branching")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/winner|best plant|selected keeper/i);
  });

  it("dispatches a plant-scoped manual Quick Log prefill", () => {
    const listener = vi.fn();
    window.addEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
    render(
      <MemoryRouter>
        <OreozGelonadeDiaryComparison />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /O-1/i }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      plantId: "oreoz-1",
      growId: "grow-1",
      tentId: "tent-1",
      eventType: "observation",
      source: "oreoz-gelonade-diary",
    });
    window.removeEventListener(PLANT_QUICKLOG_PREFILL_EVENT, listener);
  });

  it("edits existing owner-scoped phenotype scores and growth habit notes explicitly", async () => {
    render(
      <MemoryRouter initialEntries={["/diary/strains/oreoz"]}>
        <Routes>
          <Route path="/diary/strains/:slug" element={<CultivarDiaryProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("cultivar-diary-profile-oreoz")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Vigor score for O-1"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Growth habit notes"), {
      target: { value: "Short nodes; even branching." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save phenotype" }));

    await waitFor(() =>
      expect(mocks.upsert).toHaveBeenCalledWith({
        huntId: "hunt-1",
        plantId: "oreoz-1",
        traits: { vigor: 5, structure: 3 },
        note: "Short nodes; even branching.",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Phenotype observations saved.");
  });

  it("recovers the editor when the post-save refresh cannot confirm the record", async () => {
    mocks.refresh.mockRejectedValueOnce(new Error("read unavailable"));
    render(
      <MemoryRouter initialEntries={["/diary/strains/oreoz"]}>
        <Routes>
          <Route path="/diary/strains/:slug" element={<CultivarDiaryProfile />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save phenotype" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not confirm the phenotype save. Reload before trying again.",
    );
    expect(screen.getByRole("button", { name: "Save phenotype" })).toBeEnabled();
  });

  it("keeps non-hunt plants read-only while retaining their Quick Log button", () => {
    render(
      <MemoryRouter initialEntries={["/diary/strains/gelonade"]}>
        <Routes>
          <Route path="/diary/strains/:slug" element={<CultivarDiaryProfile />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByText(/add this plant to a Pheno Hunt to edit phenotypes/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a Pheno Hunt" })).toHaveAttribute(
      "href",
      "/pheno-hunts/new",
    );
    expect(screen.getByRole("button", { name: "Quick Log" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save phenotype" })).toBeNull();
  });
});
