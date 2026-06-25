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
const BILLING = readSrc("pages/BillingPlaceholder.tsx");
const LANDING = readSrc("pages/Landing.tsx");
const ANALYTICS = readSrc("lib/pricingAnalytics.ts");
const SITEMAP = read("public/sitemap.xml");

describe("/pricing route", () => {
  it("is registered as a public route", () => {
    expect(APP).toMatch(/import\s+Pricing\s+from\s+"\.\/pages\/Pricing"/);
    expect(APP).toMatch(/path="\/pricing"\s+element=\{<Pricing\s*\/>\}/);
  });

  it("registers a /billing/:plan placeholder route", () => {
    expect(APP).toMatch(/import\s+BillingPlaceholder\s+from\s+"\.\/pages\/BillingPlaceholder"/);
    expect(APP).toMatch(/path="\/billing\/:plan"\s+element=\{<BillingPlaceholder\s*\/>\}/);
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

  it("renders Founder Lifetime at $129 one-time with first-75 limit", () => {
    expect(CONSTANTS).toMatch(/price:\s*129/);
    expect(CONSTANTS).toMatch(/limit:\s*75/);
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

describe("Pricing page imports constants", () => {
  it("imports pricing constants from @/constants/pricing", () => {
    expect(PAGE).toMatch(/from\s+"@\/constants\/pricing"/);
  });

  it("imports PricingCard from @/components/pricing/PricingCard", () => {
    expect(PAGE).toMatch(/from\s+"@\/components\/pricing\/PricingCard"/);
  });
});

describe("Free vs Pro vs Founder Lifetime comparison", () => {
  const freeBasics = [
    "Plant profiles & grow diary",
    "Photo logs",
    "Manual sensor snapshots",
  ];

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

  it("comparison table renders all three columns (Free / Pro / Founder Lifetime)", () => {
    expect(PAGE).toMatch(/data-testid="pricing-comparison-table"/);
    expect(PAGE).toMatch(/>Free<\/th>/);
    expect(PAGE).toMatch(/>Pro<\/th>/);
    expect(PAGE).toMatch(/Founder Lifetime\s*<\/th>/);
  });

  it("comparison rows expose a founder column", () => {
    expect(PAGE).toMatch(/founder:\s*(true|false|"|')/);
    expect(PAGE).toMatch(/row\.founder/);
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

  it("defaults to annual billing state", () => {
    expect(PAGE).toMatch(/useState<BillingPeriod>\("annual"\)/);
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
    expect(PAGE).toMatch(/grid\s+gap-8\s+md:gap-6\s+md:grid-cols-3/);
  });

  it("comparison table is horizontally scrollable on small screens", () => {
    expect(PAGE).toMatch(/overflow-x-auto/);
    expect(PAGE).toMatch(/min-w-\[640px\]/);
  });

  it("CTA buttons use size=\"lg\" for comfortable tap targets", () => {
    const ctaButtons = PAGE.match(/<Button[\s\S]*?<\/Button>/g) ?? [];
    expect(ctaButtons.length).toBeGreaterThan(0);
    const ctaText = /(Start Free|Upgrade to Pro|Claim Founder Lifetime)/;
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

  it("wires CTAs to /auth and /billing placeholder routes", () => {
    expect(PAGE).toMatch(/to="\/auth"/);
    expect(PAGE).toMatch(/\/billing\/pro-monthly/);
    expect(PAGE).toMatch(/\/billing\/pro-annual/);
    expect(PAGE).toMatch(/\/billing\/founder-lifetime/);
  });

  it("fires analytics events for each CTA", () => {
    expect(PAGE).toMatch(/pricing_page_view/);
    expect(PAGE).toMatch(/pricing_cta_free_clicked/);
    expect(PAGE).toMatch(/pricing_cta_pro_monthly_clicked/);
    expect(PAGE).toMatch(/pricing_cta_pro_annual_clicked/);
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
    expect(PAGE).not.toMatch(/@\/hooks\//);
  });

  it("introduces no service_role or ai-coach call", () => {
    expect(PAGE).not.toMatch(/service_role/);
    expect(PAGE).not.toMatch(/functions\.invoke\(["']ai-coach/);
  });
});

describe("Billing placeholder", () => {
  it("does not collect payment or claim to charge the user", () => {
    expect(BILLING).toMatch(/No payment is being collected/i);
    expect(BILLING).not.toMatch(/\bcharge\(/i);
    expect(BILLING).not.toMatch(/stripe/i);
  });

  it("supports the three plan slugs", () => {
    expect(BILLING).toMatch(/pro-monthly/);
    expect(BILLING).toMatch(/pro-annual/);
    expect(BILLING).toMatch(/founder-lifetime/);
  });

  it("includes a software-only compliance note", () => {
    expect(BILLING).toMatch(/sells software only/i);
    expect(BILLING).toMatch(/does not sell cannabis/i);
  });
});

describe("Landing links to /pricing", () => {
  it("Landing page links to the public pricing route", () => {
    expect(LANDING).toMatch(/to="\/pricing"/);
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
    const { diffAppRoutesAgainstManifest } = await import(
      "./helpers/routeManifestSyncHarness"
    );
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
    const { getPricingManifestSnapshot } = await import(
      "./helpers/routeManifestSyncHarness"
    );
    // Intentionally narrow: only pricing / public billing-relevant routes so
    // unrelated route changes do not create noisy snapshot diffs here.
    expect(getPricingManifestSnapshot()).toEqual([
      { path: "/billing/:plan", access: "public", description: "Billing placeholder." },
      { path: "/hardware-integrations", access: "public" },
      { path: "/pricing", access: "public" },
      { path: "/welcome", access: "public" },
    ]);
  });
});

