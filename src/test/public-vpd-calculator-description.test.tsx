import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { STATIC_PUBLIC_SEO_DOCUMENTS } from "@/lib/build/staticPublicSeoDocuments";
import { PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION } from "@/lib/publicVpdCalculatorRules";

const SHARED_DESCRIPTION =
  "Calculate air VPD with measured leaf temperature and calibration evidence, then compare stage-aware leaf VPD. No upload or device control.";

const seo = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: (args: unknown) => seo(args) }));
vi.mock("@/lib/pricingAnalytics", () => ({ trackPricingEvent: () => {} }));

import PublicVpdCalculator from "@/pages/PublicVpdCalculator";

describe("public VPD calculator description", () => {
  it("names measured leaf temperature and calibration evidence", () => {
    expect(SHARED_DESCRIPTION.length).toBeLessThanOrEqual(160);
    expect(PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION).toBe(SHARED_DESCRIPTION);
    expect(PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION).toContain("leaf temperature");
    expect(PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION).toContain("calibration");
    const staticDocument = STATIC_PUBLIC_SEO_DOCUMENTS.find(
      (document) => document.path === "/tools/vpd-calculator",
    );
    expect(staticDocument?.metadata.description).toBe(PUBLIC_VPD_CALCULATOR_PAGE_DESCRIPTION);
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
