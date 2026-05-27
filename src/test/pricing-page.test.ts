/**
 * Tests for the Phase 2 pricing page (/pricing).
 *
 * Verifies:
 *   1. Pricing page renders all tiers.
 *   2. Founder Lifetime shows $129 and first 75 buyer limit.
 *   3. Free tier does not imply paid-only lockout of basic diary.
 *   4. Pro tier includes sync, backup, multi-tent, exports, priority support.
 *   5. Page does not include forbidden claims: autopilot, guaranteed yield, AI grows for you.
 *   6. CTAs render correctly.
 *   7. FAQ renders trust/data ownership copy.
 *   8. No unrelated routes are changed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSrc = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

const PRICING = readSrc("pages/Pricing.tsx");
const APP = readSrc("App.tsx");

describe("Pricing page — tier rendering", () => {
  it("renders Free tier at $0", () => {
    expect(PRICING).toMatch(/\$0/);
    expect(PRICING).toMatch(/Free/);
    expect(PRICING).toMatch(/forever/);
  });

  it("renders Pro Monthly at $12/month", () => {
    expect(PRICING).toMatch(/\$12/);
    expect(PRICING).toMatch(/Pro Monthly/);
    expect(PRICING).toMatch(/\/month/);
  });

  it("renders Pro Annual at $115/year", () => {
    expect(PRICING).toMatch(/\$115/);
    expect(PRICING).toMatch(/Pro Annual/);
    expect(PRICING).toMatch(/\/year/);
  });

  it("renders Founder Lifetime at $129 one-time with 75 buyer limit", () => {
    expect(PRICING).toMatch(/\$129/);
    expect(PRICING).toMatch(/Founder Lifetime/);
    expect(PRICING).toMatch(/one-time/);
    expect(PRICING).toMatch(/75/);
    expect(PRICING).toMatch(/First 75 buyers/);
  });
});

describe("Pricing page — Free tier does not lock out basic diary", () => {
  it("Free tier includes plant profiles, basic diary, photo logs", () => {
    expect(PRICING).toMatch(/Plant profiles/);
    expect(PRICING).toMatch(/Basic grow diary/);
    expect(PRICING).toMatch(/Photo logs/);
    expect(PRICING).toMatch(/Manual notes/);
    expect(PRICING).toMatch(/Basic timeline/);
  });

  it("Free does not imply the user cannot use the diary without paying", () => {
    // Ensure we have an explicit free plan with features listed
    expect(PRICING).toMatch(/FREE_FEATURES/);
    // The free tier should have substantive features, not a "locked" state
    expect(PRICING).not.toMatch(/unlock.*diary/i);
    expect(PRICING).not.toMatch(/pay.*to.*access.*diary/i);
  });
});

describe("Pricing page — Pro tier includes required features", () => {
  it("includes cloud sync", () => {
    expect(PRICING).toMatch(/Cloud sync/);
  });

  it("includes automatic backups", () => {
    expect(PRICING).toMatch(/Automatic backups/);
  });

  it("includes multi-tent support", () => {
    expect(PRICING).toMatch(/Multi-tent support/);
  });

  it("includes advanced exports", () => {
    expect(PRICING).toMatch(/Advanced exports/);
  });

  it("includes priority support", () => {
    expect(PRICING).toMatch(/Priority support/);
  });

  it("includes longer grow history", () => {
    expect(PRICING).toMatch(/Longer grow history/);
  });

  it("includes sensor snapshot history", () => {
    expect(PRICING).toMatch(/Sensor snapshot history/);
  });
});

describe("Pricing page — safety / forbidden claims", () => {
  it("does not claim AI grows for you", () => {
    expect(PRICING).not.toMatch(/AI grows for you/i);
  });

  it("does not use 'autopilot'", () => {
    expect(PRICING).not.toMatch(/autopilot/i);
  });

  it("does not guarantee yield", () => {
    expect(PRICING).not.toMatch(/guaranteed yield/i);
  });

  it("does not promise equipment control", () => {
    // Check there is no positive promise like "controls your equipment" or "we control hardware"
    expect(PRICING).not.toMatch(/Verdant controls your/i);
    expect(PRICING).not.toMatch(/we control.*hardware/i);
    expect(PRICING).not.toMatch(/sends commands to your/i);
    // Must explicitly disclaim control (may be split across JSX lines)
    expect(PRICING).toMatch(/never controls equipment/i);
  });

  it("does not claim data is sold", () => {
    expect(PRICING).not.toMatch(/sell your data/i);
    // The FAQ explicitly says "never sell"
    expect(PRICING).toMatch(/never sell/i);
  });

  it("does not include cannabis sales language", () => {
    expect(PRICING).not.toMatch(/buy.*cannabis/i);
    expect(PRICING).not.toMatch(/sell.*cannabis/i);
    expect(PRICING).not.toMatch(/dispensary/i);
  });
});

describe("Pricing page — CTAs", () => {
  it("renders Start Free CTA", () => {
    expect(PRICING).toMatch(/Start Free/);
  });

  it("renders Upgrade to Pro CTA", () => {
    expect(PRICING).toMatch(/Upgrade to Pro/);
  });

  it("renders Claim Founder Lifetime CTA", () => {
    expect(PRICING).toMatch(/Claim Founder Lifetime/);
  });
});

describe("Pricing page — FAQ and trust/data ownership", () => {
  it("FAQ mentions data ownership", () => {
    expect(PRICING).toMatch(/data.*belongs to you/i);
    expect(PRICING).toMatch(/Data ownership/);
  });

  it("FAQ mentions hardware neutrality", () => {
    expect(PRICING).toMatch(/hardware neutral/i);
  });

  it("FAQ explains Verdant does not control equipment", () => {
    expect(PRICING).toMatch(/never controls equipment/i);
  });

  it("trust section renders", () => {
    expect(PRICING).toMatch(/Your data\. Your grows\. Your control\./);
  });
});

describe("Pricing page — analytics events", () => {
  it("fires pricing_page_view on mount", () => {
    expect(PRICING).toMatch(/pricing_page_view/);
  });

  it("fires CTA events", () => {
    expect(PRICING).toMatch(/pricing_cta_free_clicked/);
    expect(PRICING).toMatch(/pricing_cta_pro_monthly_clicked/);
    expect(PRICING).toMatch(/pricing_cta_pro_annual_clicked/);
    expect(PRICING).toMatch(/pricing_cta_founder_lifetime_clicked/);
  });

  it("fires pricing_faq_opened", () => {
    expect(PRICING).toMatch(/pricing_faq_opened/);
  });
});

describe("Pricing page — route registration", () => {
  it("registers /pricing route in App.tsx", () => {
    expect(APP).toMatch(/path="\/pricing"\s+element=\{<Pricing\s*\/>\}/);
    expect(APP).toMatch(/import\s+Pricing\s+from\s+"\.\/pages\/Pricing"/);
  });

  it("pricing route is outside AppShell (public page)", () => {
    // The /pricing route should appear BEFORE the <Route element={<AppShell />}> block
    const pricingIdx = APP.indexOf('/pricing"');
    const appShellIdx = APP.indexOf("<AppShell");
    expect(pricingIdx).toBeGreaterThan(-1);
    expect(appShellIdx).toBeGreaterThan(-1);
    expect(pricingIdx).toBeLessThan(appShellIdx);
  });

  it("does not change unrelated routes", () => {
    // Core routes still present
    expect(APP).toMatch(/path="\/"\s+element=\{<Dashboard/);
    expect(APP).toMatch(/path="\/plants"/);
    expect(APP).toMatch(/path="\/tents"/);
    expect(APP).toMatch(/path="\/sensors"/);
    expect(APP).toMatch(/path="\/alerts"/);
    expect(APP).toMatch(/path="\/auth"/);
    expect(APP).toMatch(/path="\/welcome"/);
  });
});

describe("Pricing page — hero messaging", () => {
  it("contains the required hero copy", () => {
    expect(PRICING).toMatch(/Protect your grow history/);
    expect(PRICING).toMatch(/Understand what changed/);
    expect(PRICING).toMatch(/Make better/);
    expect(PRICING).toMatch(/decisions next run/);
  });

  it("contains the support copy", () => {
    expect(PRICING).toMatch(/grow room operating system/);
    // JSX may split across lines; check key phrases independently
    expect(PRICING).toMatch(/locking yourself into one hardware brand/);
  });

  it("contains the tagline", () => {
    expect(PRICING).toMatch(/Plant memory\. Sensor truth\. Better decisions\./);
  });
});
