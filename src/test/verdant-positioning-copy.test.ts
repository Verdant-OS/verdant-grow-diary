/**
 * Verdant positioning polish — static safety + copy tests.
 *
 * Verifies the public landing surface leads with the strongest value
 * drivers, keeps safety framing, and introduces no forbidden automation
 * / device-control language or write paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERDANT_HERO,
  VERDANT_VALUE_DRIVERS,
  VERDANT_TRUST,
  VERDANT_LOOP,
} from "@/constants/verdantPositioningCopy";

const LANDING = readFileSync(
  resolve(__dirname, "..", "pages/Landing.tsx"),
  "utf8",
);

describe("Verdant positioning copy constants", () => {
  it("hero uses the strong grower-facing headline", () => {
    expect(VERDANT_HERO.headline).toMatch(/See what changed/);
    expect(VERDANT_HERO.headline).toMatch(/Decide what to do next/);
  });

  it("subheadline names the anti-lock-in wedge (gear you already own)", () => {
    expect(VERDANT_HERO.subheadline).toMatch(/gear you already own/i);
    expect(VERDANT_HERO.subheadline).toMatch(/cannot touch your equipment/i);
    expect(VERDANT_HERO.subheadline).toMatch(/cites its evidence/i);
  });

  it("tagline is the three-part promise", () => {
    expect(VERDANT_HERO.tagline).toMatch(
      /Plant memory\. Sensor truth\. Grower-approved decisions\./,
    );
  });

  it("exposes primary Start Free and secondary Explore Demo CTAs", () => {
    expect(VERDANT_HERO.primaryCtaLabel).toBe("Start Free");
    expect(VERDANT_HERO.secondaryCtaLabel).toBe("Explore Demo");
  });

  it("ships all five ranked value drivers in order", () => {
    const titles = VERDANT_VALUE_DRIVERS.map((c) => c.title);
    expect(titles).toEqual([
      "Works with the gear you already own",
      "You stay in control",
      "One plant timeline",
      "Log the moment in 30 seconds",
      "AI that shows its work",
    ]);
  });

  it("trust section names source labels: live/manual/csv/demo/stale/invalid", () => {
    const joined = VERDANT_TRUST.bullets.join(" ").toLowerCase();
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(joined).toContain(label);
    }
  });

  it("trust section keeps no-blind-automation and no-device-control promises", () => {
    expect(VERDANT_TRUST.bullets).toContain("No blind automation");
    expect(VERDANT_TRUST.bullets).toContain("No device control by default");
    expect(VERDANT_TRUST.heading).toMatch(/decision-maker/i);
  });

  it("One-Tent Loop lists the full V0 flow", () => {
    expect(VERDANT_LOOP.steps).toEqual([
      "Grow",
      "Tent",
      "Plant",
      "Quick Log",
      "Timeline",
      "Sensor Snapshot",
      "AI Doctor",
      "Alert",
      "Action Queue",
    ]);
  });
});

describe("Landing page renders the polished positioning", () => {
  it("hero headline appears in the landing source", () => {
    expect(LANDING).toMatch(/See what changed/);
    expect(LANDING).toMatch(/Decide what to do next/);
  });

  it("subheadline / trust copy references gear you already own and equipment safety", () => {
    // Copy is sourced from the constants module (imported), and reinforced
    // in inline trust copy.
    expect(LANDING).toMatch(/VERDANT_HERO/);
    expect(LANDING).toMatch(/VERDANT_TRUST/);
    expect(LANDING).toMatch(/cannot\s+touch\s+your\s+equipment/i);
  });

  it("wires the primary CTA to /auth and the secondary CTA to the loop anchor", () => {
    expect(LANDING).toMatch(/to="\/auth"/);
    expect(LANDING).toMatch(/href="#loop"/);
    // /demo is not primary-marketed here; App.tsx redirects it to /welcome.
    expect(LANDING).not.toMatch(/to="\/demo"/);
    expect(LANDING).not.toMatch(/href="\/demo"/);
  });

  it("contains no forbidden automation / device-control copy", () => {
    const forbidden: RegExp[] = [
      /\bautopilot\b/i,
      /fully\s+automated\s+grow\s+control/i,
      /AI\s+controls\s+your\s+equipment/i,
      /automatic\s+device\s+control/i,
      /\bintelligence\s+layer\b/i,
      /\bblind\s+automation\s+enabled\b/i,
    ];
    for (const re of forbidden) {
      expect(LANDING).not.toMatch(re);
    }
  });

  it("introduces no Supabase write helpers or service_role usage", () => {
    expect(LANDING).not.toMatch(/service_role/);
    expect(LANDING).not.toMatch(/\.insert\(/);
    expect(LANDING).not.toMatch(/\.update\(/);
    expect(LANDING).not.toMatch(/\.delete\(/);
    expect(LANDING).not.toMatch(/\.upsert\(/);
    expect(LANDING).not.toMatch(/functions\.invoke/);
    expect(LANDING).not.toMatch(/@\/integrations\/supabase\/client/);
  });
});
