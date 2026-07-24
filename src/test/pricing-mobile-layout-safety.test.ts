/**
 * Static safety scans for the /pricing page at narrow mobile widths.
 *
 * Root cause locked here (walkthrough 2026-07-16, MEDIUM): at a 390px
 * viewport (371px client width with scrollbar) the plan cards overflowed the
 * page by ~4px. shadcn's Button base includes `whitespace-nowrap`, so the
 * priced CTA labels ("Upgrade to Pro — $99/ year", "Claim Founder Lifetime
 * — $129") set a min-content width wider than the card; grid items default
 * to min-width:auto, so the track propped open past the viewport.
 *
 * Guards (mirrors dashboard-mobile-layout-safety.test.ts):
 *   - PricingCard root carries min-w-0 (grid item may shrink)
 *   - every plan-card CTA Button is wrap-capable (whitespace-normal +
 *     h-auto with a min-h touch-target floor)
 *   - the comparison table stays inside its intentional overflow-x-auto
 *     scroll container
 *
 * Pure file-content scans. No rendering, no network.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PRICING = read("src/pages/Pricing.tsx");
const PRICING_CARD = read("src/components/pricing/PricingCard.tsx");

describe("PricingCard narrow-viewport safety", () => {
  it("card root allows shrinking below content min-content width (min-w-0)", () => {
    expect(PRICING_CARD).toMatch(/min-w-0/);
  });
});

describe("Pricing plan-card CTAs wrap instead of forcing page overflow", () => {
  it("every plan-card CTA overrides Button's whitespace-nowrap and fixed height", () => {
    // The three tier CTAs (Free / Pro / Founder) all render with this exact
    // wrap-safety class set: w-full width, wrap-capable text, auto height
    // with a 44px touch-target floor.
    const wrapSafe = PRICING.match(/className="w-full h-auto min-h-11 whitespace-normal"/g) ?? [];
    expect(wrapSafe.length).toBeGreaterThanOrEqual(3);
  });

  it("no plan-card CTA regresses to a bare nowrap w-full Button", () => {
    // A bare className="w-full" keeps Button's whitespace-nowrap and lets a
    // priced label prop the card (and page) wider than the viewport.
    expect(PRICING).not.toMatch(/className="w-full"/);
  });

  it("comparison table keeps its intentional horizontal scroll container", () => {
    // The wide table is allowed to exceed the viewport — but only inside
    // its own overflow-x-auto wrapper, never at page level.
    expect(PRICING).toMatch(/overflow-x-auto[\s\S]{0,200}pricing-comparison-table/);
  });
});
