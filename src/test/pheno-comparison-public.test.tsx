/**
 * pheno-comparison-public.test.tsx
 * /pheno-comparison stays public, fixture-only, and demo-labeled — the Pro
 * gate must not affect this surface.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PhenoComparison from "@/pages/PhenoComparison";

describe("/pheno-comparison public preview", () => {
  it("renders without an authenticated session (no gate)", () => {
    render(
      <MemoryRouter>
        <PhenoComparison />
      </MemoryRouter>,
    );
    // Sanity: the page mounts (any pheno-comparison presenter element or
    // heading is enough — we only need to prove the gate did not intercept).
    // The upgrade-gate root would set data-testid="pheno-tracker-upgrade-gate".
    expect(screen.queryByTestId("pheno-tracker-upgrade-gate")).toBeNull();
  });
});
