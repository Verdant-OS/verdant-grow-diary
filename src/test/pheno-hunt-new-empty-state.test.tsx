/**
 * /pheno-hunts/new — empty-state CTA and deterministic candidate label
 * generation via selection order.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import PhenoHuntNew from "@/pages/PhenoHuntNew";
import { defaultCandidateLabel } from "@/lib/phenoHuntService";

const loadMock = vi.fn();
vi.mock("@/lib/phenoHuntCandidateLoader", () => ({
  loadPhenoHuntCandidates: (...a: unknown[]) => loadMock(...a),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function mockLoad(
  plants: {
    id: string;
    name: string;
    strain: string | null;
    binding?: "grow_id" | "tent_grow" | "both";
  }[],
) {
  loadMock.mockResolvedValue({
    grow: { id: "g1", name: "Tent A" },
    tentIdsInGrow: ["t1"],
    candidates: plants.map((p) => ({
      id: p.id,
      name: p.name,
      strain: p.strain,
      tentId: null,
      growId: "g1",
      binding: p.binding ?? "grow_id",
      missingDirectGrowId: false,
    })),
    growScopeCandidateCount: plants.length,
    error: null,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pheno-hunts/new?growId=g1"]}>
      <Routes>
        <Route path="/pheno-hunts/new" element={<PhenoHuntNew />} />
        <Route path="/grows/:id" element={<div>grow detail</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PhenoHuntNew empty state", () => {
  beforeEach(() => {
    loadMock.mockReset();
  });

  it("shows empty state CTA when the grow has no plants", async () => {
    mockLoad([]);
    renderPage();
    const cta = (await screen.findByTestId("ph-empty-cta")) as HTMLElement;
    const anchor = cta.querySelector("a") ?? cta;
    expect(anchor.getAttribute("href")).toBe("/grows/g1");
    expect(screen.getByTestId("ph-empty").textContent).toMatch(/No plants in this grow yet/i);
  });

  it("keeps the candidate list when plants exist", async () => {
    mockLoad([
      { id: "p1", name: "Plant One", strain: "OG" },
      { id: "p2", name: "Plant Two", strain: null },
    ]);
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("ph-plant-list")).toBeTruthy();
    });
    expect(screen.getByText("Plant One")).toBeTruthy();
    expect(screen.getByText("Plant Two")).toBeTruthy();
  });

  it("labels follow selection order via service helper", () => {
    expect(defaultCandidateLabel(0)).toBe("#1");
    expect(defaultCandidateLabel(1)).toBe("#2");
  });

  it("toggles selection with stable test ids", async () => {
    mockLoad([{ id: "p1", name: "Plant One", strain: null }]);
    renderPage();
    const toggle = await screen.findByTestId("ph-toggle-p1");
    fireEvent.click(toggle);
    expect(screen.getByTestId("ph-selected-count").textContent).toMatch(/1 selected/);
  });
});
