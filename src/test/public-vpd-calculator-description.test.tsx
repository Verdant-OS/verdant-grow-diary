import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION } from "@/lib/publicVpdCalculatorRules";

const seo = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: (args: unknown) => seo(args) }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: () => {} }));

import PublicVpdCalculator from "@/pages/PublicVpdCalculator";

describe("public VPD calculator description", () => {
  it("names measured leaf temperature and calibration evidence", () => {
    expect(PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION).toBe(
      "Calculate air VPD, add measured leaf temperature and calibration evidence, then unlock an honest stage-aware leaf VPD comparison. No upload, diagnosis, or device control.",
    );
    render(
      <MemoryRouter>
        <PublicVpdCalculator />
      </MemoryRouter>,
    );
    expect(seo).toHaveBeenCalledWith(
      expect.objectContaining({ description: PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION }),
    );
  });
});
