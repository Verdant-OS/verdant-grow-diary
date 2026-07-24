/**
 * CultivarBlueprintCrossSell — Craft conversion vs Blueprint activation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";

let entitlement: { isActive: boolean; capabilities: { blueprint: boolean } };
let lookupFailed = false;
vi.mock("@/hooks/useMyEntitlements", () => ({
  useMyEntitlements: () => ({ loading: false, lookupFailed, entitlement }),
}));

import CultivarBlueprintCrossSell from "@/components/CultivarBlueprintCrossSell";

const cultivar = VERDANT_CULTIVARS.find((c) => c.slug === "og-kush")!;

function renderCrossSell() {
  return render(
    <MemoryRouter>
      <CultivarBlueprintCrossSell cultivar={cultivar} />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("CultivarBlueprintCrossSell", () => {
  it("shows a Craft upsell for growers without the blueprint capability", () => {
    entitlement = { isActive: false, capabilities: { blueprint: false } };
    lookupFailed = false;
    renderCrossSell();
    const cta = screen.getByTestId("cultivar-blueprint-upgrade");
    expect(cta).toHaveAttribute("href", "/pricing?plan=craft_annual");
    expect(screen.queryByTestId("cultivar-blueprint-open")).toBeNull();
  });

  it("shows an activation link into the grower's plants when blueprint is unlocked", () => {
    entitlement = { isActive: true, capabilities: { blueprint: true } };
    lookupFailed = false;
    renderCrossSell();
    expect(screen.getByTestId("cultivar-blueprint-open")).toHaveAttribute("href", "/plants");
    expect(screen.queryByTestId("cultivar-blueprint-upgrade")).toBeNull();
  });

  it("treats a Pro-without-blueprint grower as an upsell target", () => {
    entitlement = { isActive: true, capabilities: { blueprint: false } };
    lookupFailed = false;
    renderCrossSell();
    expect(screen.getByTestId("cultivar-blueprint-upgrade")).toBeInTheDocument();
  });

  it("degrades to the upsell when entitlement lookup failed", () => {
    entitlement = { isActive: true, capabilities: { blueprint: true } };
    lookupFailed = true;
    renderCrossSell();
    expect(screen.getByTestId("cultivar-blueprint-upgrade")).toBeInTheDocument();
  });
});
