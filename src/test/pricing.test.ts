/**
 * Tests for the public Pricing page, Founder Lifetime Deal, and FAQ.
 *
 * File-content tests in the same style as hardware-integrations.test.ts.
 * Verifies pricing copy, tier inclusions, forbidden claims, CTAs, route
 * registration, sitemap, and that no unrelated routes are touched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..", "..");
const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const APP = readSrc("App.tsx");
const PAGE = readSrc("pages/Pricing.tsx");
const CONSTANTS = readSrc("constants/pricing.ts");

const LANDING = readSrc("pages/Landing.tsx");
const ANALYTICS = readSrc("lib/pricingAnalytics.ts");
const SITEMAP = read("public/sitemap.xml");

describe("/pricing route", () => {
  it("is registered as a public route", () => {
    // Page is code-split (React.lazy dynamic import) rather than eagerly imported.
    expect(APP).toMatch(/import\(\s*["']\.\/pages\/Pricing["']\s*\)/);
    expect(APP).toMatch(/path="\/pricing"\s+element=\{<Pricing\s*\/>\}/);
  });

  it("redirects legacy /billing/:plan to canonical /pricing via LegacyBillingRedirect", () => {
    expect(APP).toMatch(/import\(\s*["']\.\/pages\/LegacyBillingRedirect["']\s*\)/);
    expect(APP).toMatch(/path="\/billing\/:plan"\s+element=\{<LegacyBillingRedirect\s*\/>\}/);
  });
});

describe("Pricing page hero + tagline", () => {
  it("includes the required hero headline", () => {
    expect(PAGE).toMatch(
      /Protect your grow history\. Understand what changed\. Make better decisions next run\./,
    );
  });

  it("includes the support copy", () => {
    expect(PAGE).toMatch(/grow room operating system for serious growers/i);
    expect(PAGE).toMatch(/without locking yourself into one hardware brand/i);
  });

  it("includes the tagline", () => {
    expect(PAGE).toMatch(/Plant memory\. Sensor truth\. Better decisions\./);
  });
});

describe("Pricing tiers in constants", () => {
  it("renders Free at $0", () => {
    expect(CONSTANTS).toMatch(/price:\s*0/);
    expect(CONSTANTS).toMatch(/name:\s*"Free"/);
  });

  it("renders Pro Monthly at $12/month", () => {
    expect(CONSTANTS).toMatch(/monthlyPrice:\s*12/);
  });

  it("renders Pro Annual at $99/year", () => {
    expect(CONSTANTS).toMatch(/annualPrice:\s*99/);
  });

  it("renders Founder Lifetime at $129 one-time with first-100 limit", () => {
    expect(CONSTANTS).toMatch(/price:\s*129/);
    expect(CONSTANTS).toMatch(/limit:\s*100/);
    expect(CONSTANTS).toMatch(/one-time/);
  });

  it("describes Founder Lifetime as a limited early-supporter offer", () => {
    expect(PAGE).toMatch(/limited early-supporter offer/i);
    expect(PAGE).toMatch(/not a separate recurring plan/i);
  });

  it("does not render Premium tier or language", () => {
    expect(PAGE).not.toMatch(/\bPremium\b/);
  });

  it("does not render free trial language", () => {
    expect(PAGE).not.toMatch(/free trial/i);
    expect(PAGE).not.toMatch(/trial period/i);
  });
});

describe("Craft tier", () => {
  it("renders a Craft pricing card with toggle-aware CTAs", () => {
    expect(PAGE).toMatch(/testId="pricing-card-craft"/);
    expect(PAGE).toMatch(/pricing-cta-craft-annual/);
    expect(PAGE).toMatch(/pricing-cta-craft-monthly/);
    expect(PAGE).toMatch(/Upgrade to Craft/);
  });

  it("prices Craft at $29/month and $249/year in constants", () => {
    expect(CONSTANTS).toMatch(/monthlyPrice:\s*29/);
    expect(CONSTANTS).toMatch(/annualPrice:\s*249/);
    expect(CONSTANTS).toMatch(/name:\s*"Craft"/);
  });

  it("Craft card highlights the Pro Blueprint and 300 AI Doctor credits", () => {
    expect(CONSTANTS).toMatch(/Pro Blueprint: live per-stage SOP scoring/);
    expect(CONSTANTS).toMatch(/300 AI Doctor credits \/ month/);
  });

  it("Craft CTAs open Paddle checkout with craft price keys", () => {
    expect(PAGE).toMatch(/craft_annual/);
    expect(PAGE).toMatch(/craft_monthly/);
  });

  it("comparison table adds a Blueprint row that only Craft and Founder include", () => {
    expect(PAGE).toMatch(/label:\s*"Blueprint \(live SOP scoring\)"/);
  });

  it("analytics shim knows the Craft CTA events", () => {
    expect(ANALYTICS).toMatch(/pricing_cta_craft_monthly_clicked/);
    expect(ANALYTICS).toMatch(/pricing_cta_craft_annual_clicked/);
  });
});

describe("AI credit packs (top-up surface)", () => {
  it("renders a buy-credits section with a CTA per pack", () => {
    expect(PAGE).toMatch(/data-testid="pricing-credit-packs"/);
    expect(PAGE).toMatch(/id="buy-credits"/);
    expect(PAGE).toMatch(/CREDIT_PACKS\.map/);
    expect(PAGE).toMatch(/pricing-cta-\$\{pack\.sku\}/);
  });

  it("defines the two credit packs in constants (50/$9, 150/$19)", () => {
    expect(CONSTANTS).toMatch(/"credit_pack_50"/);
    expect(CONSTANTS).toMatch(/"credit_pack_150"/);
    expect(CONSTANTS).toMatch(/credits:\s*50\b/);
    expect(CONSTANTS).toMatch(/credits:\s*150\b/);
    expect(CONSTANTS).toMatch(/priceUsd:\s*9\b/);
    expect(CONSTANTS).toMatch(/priceUsd:\s*19\b/);
  });

  it("opens the canonical checkout for the pack sku and fires the pack analytics event", () => {
    expect(PAGE).toMatch(/openCheckout\(\{ priceId: sku \}\)/);
    expect(PAGE).toMatch(/pricing_cta_credit_pack_clicked/);
    expect(ANALYTICS).toMatch(/pricing_cta_credit_pack_clicked/);
  });
});

describe("Pricing page imports constants", () => {
  it("imports pricing constants from @/constants/pricing", () => {
    expect(PAGE).toMatch(/from\s+"@\/constants\/pricing"/);
  });

  it("imports PricingCard from @/components/pricing/PricingCard", () => {
    expect(PAGE).toMatch(/from\s+"@\/components\/pricing\/PricingCard"/);
  });
});

describe("Free vs Pro vs Founder Lifetime comparison", () => {
  const freeBasics = ["Plant profiles & grow diary", "Photo logs", "Manual sensor snapshots"];

  it("Free tier includes the basic diary features in the comparison table", () => {
    for (const item of freeBasics) {
      const pattern = new RegExp(
        `label:\\s*["']${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^}]*free:\\s*true`,
      );
      expect(PAGE).toMatch(pattern);
    }
  });

  it("Pro tier includes backup, exports, priority support", () => {
    for (const item of [
      "Export / backups",
      "Priority support",
      "Sensor snapshot history",
      "Advanced timeline filtering",
    ]) {
      expect(CONSTANTS).toContain(item);
    }
  });

  it("comparison table renders all four columns (Free / Pro / Craft / Founder Lifetime)", () => {
    expect(PAGE).toMatch(/data-testid="pricing-comparison-table"/);
    expect(PAGE).toMatch(/>Free<\/th>/);
    expect(PAGE).toMatch(/>Pro<\/th>/);
    expect(PAGE).toMatch(/>Craft<\/th>/);
    expect(PAGE).toMatch(/Founder Lifetime\s*<\/th>/);
  });

  it("comparison rows expose a founder column", () => {
    expect(PAGE).toMatch(/founder:\s*(true|false|"|')/);
    expect(PAGE).toMatch(/row\.founder/);
  });

  it("comparison rows expose a craft column", () => {
    expect(PAGE).toMatch(/craft:\s*(true|false|"|')/);
    expect(PAGE).toMatch(/row\.craft/);
  });

  it("includes Best for and Price rows for at-a-glance comparison", () => {
    expect(PAGE).toMatch(/label:\s*["']Best for["']/);
    expect(PAGE).toMatch(/label:\s*["']Price["']/);
  });
});

describe("Monthly/Annual billing toggle", () => {
  it("has a billing toggle with test id", () => {
    expect(PAGE).toMatch(/data-testid="billing-toggle"/);
  });

  it("defaults to annual billing state (unless overridden by ?plan preselect)", () => {
    expect(PAGE).toMatch(/preselect\.billing\s*\?\?\s*"annual"/);
  });

  it("shows annual Pro price $99/year and monthly $12/month", () => {
    expect(CONSTANTS).toContain("99");
    expect(CONSTANTS).toContain("12");
  });
});

describe("AI Doctor credits", () => {
  it("Free card mentions 3 AI Doctor credits per grow", () => {
    expect(CONSTANTS).toMatch(/3 AI Doctor credits per grow/);
  });

  it("Pro card mentions 100 AI Doctor credits / month", () => {
    expect(CONSTANTS).toMatch(/100 AI Doctor credits \/ month/);
  });

  it("Founder Lifetime card mentions 100 AI Doctor credits / month", () => {
    expect(CONSTANTS).toMatch(/100 AI Doctor credits \/ month/);
  });

  it("constants never say unlimited AI", () => {
    expect(CONSTANTS.toLowerCase()).not.toMatch(/unlimited ai/);
  });
});

describe("Trust strip", () => {
  it("renders the trust strip with required copy", () => {
    expect(PAGE).toMatch(/TRUST_STRIP/);
    expect(CONSTANTS).toContain("Read-only");
    expect(CONSTANTS).toContain("Honest data labels");
    expect(CONSTANTS).toContain("Your history is always yours");
    expect(CONSTANTS).toContain("No blind automation");
  });
});

describe("Mobile-first pricing layout", () => {
  it("tier card grid uses extra vertical spacing on mobile", () => {
    // Four tiers (Free / Pro / Craft / Founder): 1-up on mobile, 2-up on md,
    // 4-up from xl. Extra mobile gap (gap-8) still guards vertical spacing.
    expect(PAGE).toMatch(/grid\s+gap-8\s+md:gap-6\s+md:grid-cols-2\s+xl:grid-cols-4/);
  });

  it("comparison table is horizontally scrollable on small screens", () => {
    expect(PAGE).toMatch(/overflow-x-auto/);
    // Widened from 640px to 760px to fit the fourth (Craft) column.
    expect(PAGE).toMatch(/min-w-\[760px\]/);
  });

  it('CTA buttons use size="lg" for comfortable tap targets', () => {
    const ctaButtons = PAGE.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(ctaButtons.length).toBeGreaterThan(0);
    const ctaText = /(Start Free|Upgrade to Pro|Upgrade to Craft|Claim Founder Lifetime)/;
    for (const b of ctaButtons) {
      if (ctaText.test(b)) {
        expect(b).toMatch(/size="lg"/);
      }
    }
  });
});

describe("Forbidden tier/offer language", () => {
  it("does not render a hardware bundle tier", () => {
    expect(PAGE).not.toMatch(/hardware bundle/i);
  });
});

describe("CTAs", () => {
  it("renders Start Free, Upgrade to Pro, and Claim Founder Lifetime buttons", () => {
    expect(PAGE).toMatch(/Start Free/);
    expect(PAGE).toMatch(/Upgrade to Pro/);
    expect(PAGE).toMatch(/Claim Founder Lifetime/);
  });

  it("wires CTAs to attributed signup and Paddle checkout price keys", () => {
    // Free CTA opens signup with a fixed source; paid CTAs open the Paddle overlay
    // via usePaddleCheckout (which itself bounces signed-out users to
    // /auth). The old /billing/:plan placeholder links are retired from
    // this page — the placeholder route itself stays mounted for legacy
    // deep links.
    expect(PAGE).toMatch(/to=\{freeSignupPath\}/);
    expect(PAGE).toMatch(/buildAttributedSignupPath/);
    expect(PAGE).toMatch(/usePaddleCheckout/);
    expect(PAGE).toMatch(/openCheckout\(/);
    expect(PAGE).toMatch(/pro_monthly/);
    expect(PAGE).toMatch(/pro_annual/);
    expect(PAGE).toMatch(/craft_monthly/);
    expect(PAGE).toMatch(/craft_annual/);
    expect(PAGE).toMatch(/founder_lifetime/);
  });

  it("fires analytics events for each CTA", () => {
    expect(PAGE).toMatch(/pricing_page_view/);
    expect(PAGE).toMatch(/pricing_cta_free_clicked/);
    expect(PAGE).toMatch(/pricing_cta_pro_monthly_clicked/);
    expect(PAGE).toMatch(/pricing_cta_pro_annual_clicked/);
    expect(PAGE).toMatch(/pricing_cta_craft_monthly_clicked/);
    expect(PAGE).toMatch(/pricing_cta_craft_annual_clicked/);
    expect(PAGE).toMatch(/pricing_cta_founder_lifetime_clicked/);
    expect(PAGE).toMatch(/pricing_faq_opened/);
  });
});

describe("FAQ + trust/data ownership copy", () => {
  it("answers data ownership in the FAQ", () => {
    expect(PAGE).toMatch(/Who owns the grow data/);
    expect(PAGE).toMatch(/does not sell your data/i);
  });

  it("includes a trust/data ownership section", () => {
    expect(PAGE).toMatch(/You own your grow history/);
    expect(PAGE).toMatch(/Hardware-neutral/);
    expect(PAGE).toMatch(/Grower stays in control/);
  });

  it("FAQ covers founder lifetime, hardware, AI safety, and cancellation", () => {
    expect(PAGE).toMatch(/Founder Lifetime Offer work/);
    expect(PAGE).toMatch(/Do I need specific hardware/);
    expect(PAGE).toMatch(/control my equipment or grow for me/);
    expect(PAGE).toMatch(/Can I cancel anytime/);
  });

  it("FAQ explicitly states Verdant does not control equipment", () => {
    expect(PAGE).toMatch(/does not control fans, lights, pumps/i);
  });

  it("FAQ explicitly states actions remain grower-approved", () => {
    expect(PAGE).toMatch(/grower-approved/i);
  });
});

describe("Forbidden claims", () => {
  const forbiddenPatterns: RegExp[] = [
    /autopilot/i,
    /guaranteed yield/i,
    /\bAI grows for you\b/i,
    /grow for you automatically/i,
    /Verdant controls? (your )?equipment/i,
  ];

  it("never claims autopilot, guaranteed yield, or AI grows for you", () => {
    expect(PAGE).not.toMatch(/autopilot/i);
    expect(PAGE).not.toMatch(/guaranteed yield/i);
    expect(PAGE).not.toMatch(/\bAI grows for you\b/i);
  });

  it("does not assert that Verdant controls equipment", () => {
    expect(PAGE).not.toMatch(/Verdant controls (your )?equipment/i);
    expect(PAGE).not.toMatch(/we control your (fans|lights|pumps|heaters|dehumidifiers)/i);
  });

  it("does not include cannabis sales or illegal cultivation language", () => {
    expect(PAGE).not.toMatch(/buy weed/i);
    expect(PAGE).not.toMatch(/illegal grow/i);
  });

  it("no forbidden marketing phrases anywhere on the page", () => {
    for (const p of forbiddenPatterns) {
      expect(PAGE).not.toMatch(p);
    }
  });
});

describe("Safety: no private data on public page", () => {
  const PRIVATE_TABLES = [
    "grows",
    "plants",
    "tents",
    "sensor_readings",
    "alerts",
    "action_queue",
    "diary_entries",
    "grow_events",
    "leads",
  ];

  it("does not query private tables", () => {
    for (const t of PRIVATE_TABLES) {
      expect(PAGE).not.toMatch(new RegExp(`\\.from\\(["']${t}["']`));
    }
  });

  it("does not import supabase client or private hooks", () => {
    expect(PAGE).not.toMatch(/@\/integrations\/supabase\/client/);
    // Allowed: usePageSeo (SEO <head> only), usePaddleCheckout
    // (auth-state + Paddle overlay; signed-out users bounce to /auth), and
    // useFounderSlotsRemaining (public slot counter via edge function;
    // fails soft, never grants entitlement). Any other @/hooks import
    // (dashboard data hooks) remains forbidden.
    expect(PAGE).not.toMatch(
      /@\/hooks\/(?!usePageSeo\b|usePaddleCheckout\b|useFounderSlotsRemaining\b)/,
    );
    // And the checkout hook itself must stay free of private data reads —
    // it may read auth session state, never tables or the supabase client.
    const CHECKOUT_HOOK = readSrc("hooks/usePaddleCheckout.ts");
    expect(CHECKOUT_HOOK).not.toMatch(/@\/integrations\/supabase\/client/);
    expect(CHECKOUT_HOOK).not.toMatch(/supabase\s*\.\s*from\(/);
    expect(CHECKOUT_HOOK).not.toMatch(/service_role/);
    // The founder-slots hook may invoke ONLY its public edge function —
    // no table reads, no service_role, no other function invocations.
    const slotsHook = readSrc("hooks/useFounderSlotsRemaining.ts");
    const invokes = [...slotsHook.matchAll(/functions\.invoke\(\s*["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(invokes).toEqual(["founder-slots-remaining"]);
    expect(slotsHook).not.toMatch(/supabase\s*\.\s*from\(/);
    expect(slotsHook).not.toMatch(/service_role/);
    for (const table of PRIVATE_TABLES) {
      expect(slotsHook).not.toMatch(new RegExp(`\\.from\\(["']${table}["']`));
    }
  });

  it("introduces no service_role or ai-coach call", () => {
    expect(PAGE).not.toMatch(/service_role/);
    expect(PAGE).not.toMatch(/functions\.invoke\(["']ai-coach/);
  });
});

// The /billing/:plan placeholder was retired. The legacy route now
// redirects to canonical /pricing via `LegacyBillingRedirect` — see
// `legacy-checkout-redirect.test.ts` and `legacy-billing-redirect-router.test.tsx`
// for the replacement coverage.

describe("Landing links to /pricing", () => {
  it("Landing page links to the centralized attributed public pricing route", () => {
    expect(LANDING).toContain("buildAttributedPricingPath({ source: acquisitionSource })");
    expect(LANDING).toContain("to={pricingPath}");
  });
});

describe("Analytics shim", () => {
  it("exports trackPricingEvent and the canonical event name", () => {
    expect(ANALYTICS).toMatch(/export function trackPricingEvent/);
    expect(ANALYTICS).toMatch(/PRICING_ANALYTICS_EVENT/);
    expect(ANALYTICS).toMatch(/pricing_page_view/);
  });
});

describe("sitemap", () => {
  it("includes /pricing", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/pricing");
  });

  it("still includes apex, /welcome, and /hardware-integrations", () => {
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/");
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/welcome");
    expect(SITEMAP).toContain("https://verdantgrowdiary.com/hardware-integrations");
  });

  it("does not leak private routes via the new pricing work", () => {
    for (const r of ["/grows", "/plants", "/tents", "/alerts", "/actions", "/settings"]) {
      expect(SITEMAP).not.toContain(`https://verdantgrowdiary.com${r}`);
    }
  });
});

describe("No unrelated routes were changed", () => {
  it("App.tsx routes and the manifest stay in sync (bidirectional)", async () => {
    const { diffAppRoutesAgainstManifest } = await import("./helpers/routeManifestSyncHarness");
    const { APP_ROUTES } = await import("@/lib/appRouteManifest");

    const diff = diffAppRoutesAgainstManifest(APP);

    expect(diff.missingFromManifest).toEqual([]);
    expect(diff.missingFromApp).toEqual([]);
    expect(diff.duplicateManifestPaths).toEqual([]);

    // Explicit guard against the original bug — `/operator/ecowitt` must be
    // present so the Cloud Canary route is always covered by drift checks.
    const manifestPaths = APP_ROUTES.map((r) => r.path);
    expect(manifestPaths).toContain("/operator/ecowitt");
  });
});

describe("Pricing manifest snapshot (narrow)", () => {
  it("pricing-relevant manifest entries match the expected shape", async () => {
    const { getPricingManifestSnapshot } = await import("./helpers/routeManifestSyncHarness");
    // Intentionally narrow: only pricing / public billing-relevant routes so
    // unrelated route changes do not create noisy snapshot diffs here.
    expect(getPricingManifestSnapshot()).toEqual([
      {
        path: "/billing/:plan",
        access: "redirect",
        description:
          "→ /pricing?plan=<canonical> (legacy billing entry; /pricing owns live checkout).",
      },
      {
        path: "/founder",
        access: "public",
        description: "Public Founder Lifetime acquisition and offer explainer.",
      },
      { path: "/hardware-integrations", access: "public" },
      { path: "/pricing", access: "public" },
      { path: "/welcome", access: "public" },
    ]);
  });
});
