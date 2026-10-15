/**
 * QA #2017 — copy and accessibility that can change without editing
 * existing scorers. Billing-period labels, tent help text, the
 * add-existing empty helper, the merge dialog footer, and nested
 * "See plans" controls.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "@/lib/react-router-compat";
import { getPlantDropdownHelperText } from "@/lib/plantDropdownReasonRules";
import { isMergeDuplicateEntryEnabled } from "@/lib/plantMergeTargetReasonRules";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import PublicOneTentTour from "@/components/PublicOneTentTour";
import Pricing from "@/pages/Pricing";

vi.mock("@/lib/pricingAnalytics", () => ({
  trackPricingEvent: vi.fn(),
  PRICING_ANALYTICS_EVENT: "verdant:analytics",
}));

const MERGE_DIALOG = readFileSync(
  resolve(process.cwd(), "src/components/PlantMergeDialog.tsx"),
  "utf8",
);
const CHECKOUT = readFileSync(resolve(process.cwd(), "src/pages/CheckoutSuccess.tsx"), "utf8");

describe("QA #2017 copy and accessibility", () => {
  it("says the tent's only plant is already here when nothing else is eligible", () => {
    expect(
      getPlantDropdownHelperText({
        total: 1,
        visible: 0,
        hiddenArchived: 0,
        hiddenCrossGrow: 0,
        hiddenMissingGrow: 0,
        hiddenSourcePlant: 0,
        hiddenAlreadyInTent: 1,
      }),
    ).toBe("This tent's only plant is already here.");
  });

  it("uses fixed tent help wording instead of repeating the word tent", async () => {
    const user = userEvent.setup();
    render(
      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[{ dataSource: "supabase", isDemoData: false, sourceReason: "supabase" }]}
      />,
    );
    await user.click(screen.getByTestId("info-popover-trigger-grow-data-source-disclosure-source"));
    expect(
      screen.getByTestId("info-popover-content-grow-data-source-disclosure-source"),
    ).toHaveTextContent(
      "Plants and tents saved in your Verdant workspace — not a live sensor reading.",
    );
  });

  it("keeps Merge Duplicate closed until a target exists and names the footer Cancel", () => {
    expect(isMergeDuplicateEntryEnabled({ fetched: false, selectableOptionCount: 0 })).toBe(true);
    expect(isMergeDuplicateEntryEnabled({ fetched: true, selectableOptionCount: 0 })).toBe(false);
    expect(isMergeDuplicateEntryEnabled({ fetched: true, selectableOptionCount: 1 })).toBe(true);
    expect(MERGE_DIALOG).toContain("isMergeDuplicateEntryEnabled");
    expect(MERGE_DIALOG).toMatch(/data-testid="plant-merge-cancel"[\s\S]{0,160}>\s*Cancel\s*</);
  });

  it("does not nest the public tour See plans button inside a link", () => {
    render(
      <MemoryRouter>
        <PublicOneTentTour hasAccount={false} />
      </MemoryRouter>,
    );
    const pricing = screen.getByTestId("public-one-tent-tour-pricing-cta");
    expect(pricing.tagName).toBe("A");
    expect(pricing.querySelector("button")).toBeNull();
    expect(pricing).toHaveTextContent("See plans");
  });

  it("does not nest the checkout See plans button inside a link", () => {
    const at = CHECKOUT.indexOf('data-testid="checkout-success-pricing-link"');
    const block = CHECKOUT.slice(Math.max(0, at - 180), at + 220);
    expect(block).toMatch(/<Button[^>]*asChild/);
    expect(block).not.toMatch(/<Link[^>]*>\s*<Button/);
  });

  it("lets Monthly and Annual set the billing period", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    );
    const toggle = screen.getByTestId("billing-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Monthly" }));
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "Annual" }));
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
