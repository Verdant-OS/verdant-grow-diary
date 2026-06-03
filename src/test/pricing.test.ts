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

describe("Pricing tiers", () => {
  it("renders Free at $0/month", () => {
    expect(PAGE).toMatch(/name="Free"/);
    expect(PAGE).toMatch(/price="\$0"/);
  });

  it("renders Pro Monthly at $12/month", () => {
    expect(PAGE).toMatch(/PRO_MONTHLY_PRICE_USD\s*=\s*12/);
    expect(PAGE).toMatch(/\$\{PRO_MONTHLY_PRICE_USD\}\/mo/);
  });

  it("renders Pro Annual at $115/year", () => {
    expect(PAGE).toMatch(/PRO_ANNUAL_PRICE_USD\s*=\s*115/);
    expect(PAGE).toMatch(/\$\{PRO_ANNUAL_PRICE_USD\}\/year/);
  });

  it("renders Founder Lifetime at $129 one-time with first-75 limit", () => {
    expect(PAGE).toMatch(/FOUNDER_LIFETIME_PRICE_USD\s*=\s*129/);
    expect(PAGE).toMatch(/FOUNDER_LIFETIME_LIMIT\s*=\s*75/);
    expect(PAGE).toMatch(/one-time/);
    expect(PAGE).toMatch(/First \$\{FOUNDER_LIFETIME_LIMIT\}/);
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

describe("Free vs Pro comparison", () => {
  const freeBasics = [
    "Plant profiles",
    "Basic grow diary",
    "Photo logs",
    "Manual notes",
    "Basic timeline",
    "Manual sensor entries",
  ];

  it("Free tier includes the basic diary features (no paid lockout)", () => {
    for (const item of freeBasics) {
      // Each free feature appears in the comparison rows as free: true.
      const pattern = new RegExp(
        `label:\\s*["']${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'],\\s*free:\\s*true`,
      );
      expect(PAGE).toMatch(pattern);
    }
  });

  it("Pro tier includes sync, backup, multi-tent, exports, priority support", () => {
    for (const item of [
      "Cloud sync",
      "Automatic backups",
      "Multi-tent support",
      "Advanced exports",
      "Priority support",
      "Sensor snapshot history",
      "Longer grow history",
      "Better timeline filtering",
    ]) {
      expect(PAGE).toContain(item);
    }
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
    expect(PAGE).toMatch(/to="\/billing\/pro-monthly"/);
    expect(PAGE).toMatch(/to="\/billing\/pro-annual"/);
    expect(PAGE).toMatch(/to="\/billing\/founder-lifetime"/);
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
    // Spot-check the obvious ones explicitly to keep failure messages clear.
    expect(PAGE).not.toMatch(/autopilot/i);
    expect(PAGE).not.toMatch(/guaranteed yield/i);
    expect(PAGE).not.toMatch(/\bAI grows for you\b/i);
  });

  it("does not assert that Verdant controls equipment", () => {
    // The page may quote/refute equipment control in the FAQ; ensure no
    // positive marketing claim sneaks in.
    expect(PAGE).not.toMatch(/Verdant controls (your )?equipment/i);
    expect(PAGE).not.toMatch(/we control your (fans|lights|pumps|heaters|dehumidifiers)/i);
  });

  it("does not include cannabis sales or illegal cultivation language", () => {
    expect(PAGE).not.toMatch(/buy weed/i);
    expect(PAGE).not.toMatch(/sell cannabis/i);
    expect(PAGE).not.toMatch(/illegal grow/i);
  });

  // Defensive sweep
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
    // Paddle integration is allowed in sandbox-only mode; no live charge() calls.
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
  // Snapshot the set of <Route path="..."> strings in App.tsx so this test
  // fails loudly if a future pricing edit accidentally touches another
  // route. The expected set must equal App's current route list plus the
  // two new ones added by this PR.
  it("App.tsx route list matches the expected pricing-aware set", () => {
    const paths = [...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(paths).toEqual(
      [
        "*",
        "/",
        "/action-queue",
        "/actions",
        "/actions/:actionId",
        "/admin/leads",
        "/alerts",
        "/alerts/:alertId",
        "/auth",
        "/billing/:plan",
        "/daily-check",
        "/demo",
        "/diagnostics",
        "/doctor",
        "/doctor/sessions",
        "/doctor/sessions/:sessionId",
        "/features",
        "/grow-lineage",
        "/grow-room",
        "/grows",
        "/grows/:growId",
        "/hardware-integrations",
        "/imports/representative-csv",
        "/leads",
        "/login",
        "/logs",
        "/pi-ingest-status",
        "/plants",
        "/plants/:id",
        "/pricing",
        "/register",
        "/reports",
        "/sensors",
        "/settings",
        "/signup",
        "/tasks",
        "/tents",
        "/tents/:id",
        "/timeline",
        "/welcome",
      ].sort(),
    );
  });
});
