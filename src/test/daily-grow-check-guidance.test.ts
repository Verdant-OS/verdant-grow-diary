/**
 * Tests for Daily Grow Check onboarding & empty-state guidance.
 *
 * Covers pure copy/state rules and card wiring/safety. Does not
 * re-test the underlying consistency calculation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  deriveDailyGrowCheckGuidance,
  WHAT_COUNTS_HINT,
  CTA_START_TODAY,
  CTA_KEEP_RHYTHM,
  ONBOARDING_HEADLINE,
  ONBOARDING_BODY,
  ONBOARDING_SECONDARY,
  CTA_QUICK_LOG,
  CTA_ENV_SNAPSHOT,
} from "@/lib/dailyGrowCheckGuidanceRules";

const baseSummary = (
  overrides: Partial<{
    checkedDays: number;
    missedDays: number;
    todayHasActivity: boolean;
    hasAnyActivity: boolean;
    windowDays: number;
  }> = {},
) => ({
  checkedDays: 0,
  missedDays: 7,
  todayHasActivity: false,
  hasAnyActivity: false,
  windowDays: 7,
  ...overrides,
});

describe("deriveDailyGrowCheckGuidance · pure copy rules", () => {
  it("returns empty state when no activity", () => {
    const g = deriveDailyGrowCheckGuidance(baseSummary());
    expect(g.state).toBe("empty");
    expect(g.headline).toBe(ONBOARDING_HEADLINE);
    expect(g.headline).toMatch(/start today's grow check/i);
    expect(g.ctaLabel).toBe(CTA_START_TODAY);
    expect(g.isPositive).toBe(false);
  });

  it("empty state explains what counts as a check", () => {
    const g = deriveDailyGrowCheckGuidance(baseSummary());
    expect(g.whatCountsHint).toBe(WHAT_COUNTS_HINT);
    expect(g.whatCountsHint.toLowerCase()).toMatch(/quick note/);
    expect(g.whatCountsHint.toLowerCase()).toMatch(/manual sensor snapshot/);
  });

  it("empty state body explains connect-notes-with-conditions purpose", () => {
    const g = deriveDailyGrowCheckGuidance(baseSummary());
    expect(g.body).toBe(ONBOARDING_BODY);
    expect(g.body.toLowerCase()).toMatch(/connect plant notes/);
    expect(g.body.toLowerCase()).toMatch(/tent conditions/);
  });

  it("empty state nextStep matches onboarding secondary hint", () => {
    const g = deriveDailyGrowCheckGuidance(baseSummary());
    expect(g.nextStep).toBe(ONBOARDING_SECONDARY);
    expect(g.nextStep.toLowerCase()).toMatch(/short note counts/);
  });

  it("today-unchecked shows one clear next step (consistent history)", () => {
    const g = deriveDailyGrowCheckGuidance(
      baseSummary({
        checkedDays: 5,
        missedDays: 2,
        hasAnyActivity: true,
        todayHasActivity: false,
      }),
    );
    expect(g.state).toBe("today-unchecked");
    expect(g.headline).toMatch(/today isn't checked/i);
    expect(g.nextStep).toMatch(/add one quick note/i);
    expect(g.isPositive).toBe(false);
  });

  it("today-checked shows positive confirmation without forbidden wording", () => {
    const g = deriveDailyGrowCheckGuidance(
      baseSummary({
        checkedDays: 3,
        missedDays: 4,
        hasAnyActivity: true,
        todayHasActivity: true,
      }),
    );
    expect(g.state).toBe("today-checked");
    expect(g.isPositive).toBe(true);
    expect(g.ctaLabel).toBe(CTA_KEEP_RHYTHM);
    const all = `${g.headline} ${g.body} ${g.nextStep}`.toLowerCase();
    expect(all).not.toMatch(/\bcompleted\b/);
    expect(all).not.toMatch(/perfect/);
    expect(all).not.toMatch(/guaranteed/);
    expect(all).not.toMatch(/healthy/);
  });

  it("inconsistent-checks state shows checked/missed counts and gentle encouragement", () => {
    const g = deriveDailyGrowCheckGuidance(
      baseSummary({
        checkedDays: 3,
        missedDays: 4,
        hasAnyActivity: true,
        todayHasActivity: false,
      }),
    );
    expect(g.state).toBe("today-unchecked-inconsistent");
    expect(g.headline).toMatch(/checked 3 of last 7 days/i);
    expect(g.body).toMatch(/missed 4 days/i);
    expect(g.nextStep).toMatch(/small is fine/i);
  });

  it("pluralizes missed day correctly when 1", () => {
    const g = deriveDailyGrowCheckGuidance(
      baseSummary({
        checkedDays: 1,
        missedDays: 1,
        windowDays: 2,
        hasAnyActivity: true,
        todayHasActivity: false,
      }),
    );
    // checked == missed → not classified as inconsistent
    expect(g.state).toBe("today-unchecked");
  });

  it("never uses forbidden wording in any state", () => {
    const states = [
      baseSummary(),
      baseSummary({ hasAnyActivity: true, todayHasActivity: true, checkedDays: 7, missedDays: 0 }),
      baseSummary({ hasAnyActivity: true, todayHasActivity: false, checkedDays: 5, missedDays: 2 }),
      baseSummary({ hasAnyActivity: true, todayHasActivity: false, checkedDays: 2, missedDays: 5 }),
    ];
    for (const s of states) {
      const g = deriveDailyGrowCheckGuidance(s);
      const all =
        `${g.headline} ${g.body} ${g.nextStep} ${g.ctaLabel} ${g.whatCountsHint}`.toLowerCase();
      expect(all).not.toMatch(/\bcompleted\b/);
      expect(all).not.toMatch(/perfect grow/);
      expect(all).not.toMatch(/\bperfect\b/);
      expect(all).not.toMatch(/guaranteed healthy/);
      expect(all).not.toMatch(/\bhealthy\b/);
    }
  });
});

describe("Daily Grow Check guidance · card wiring + safety", () => {
  const root = resolve(__dirname, "../..");
  const card = readFileSync(
    resolve(root, "src/components/PlantDailyGrowCheckConsistencyCard.tsx"),
    "utf8",
  );
  const rules = readFileSync(resolve(root, "src/lib/dailyGrowCheckGuidanceRules.ts"), "utf8");

  it("card renders guidance headline / body / next-step blocks", () => {
    expect(card).toMatch(/plant-daily-grow-check-guidance-headline/);
    expect(card).toMatch(/plant-daily-grow-check-guidance-body/);
    expect(card).toMatch(/plant-daily-grow-check-guidance-next-step/);
  });

  it("card renders 'what counts as a check' hint", () => {
    expect(card).toMatch(/plant-daily-grow-check-what-counts/);
    expect(card).toMatch(/guidance\.whatCountsHint/);
  });

  it("card CTA still routes to /daily-check?plantId=<id>", () => {
    expect(card).toMatch(/\/daily-check\?plantId=\$\{plantId\}/);
  });

  it("card exposes guidance state as data attribute", () => {
    expect(card).toMatch(/data-guidance-state=\{guidance\.state\}/);
  });

  it("card and rules avoid forbidden health/completion wording", () => {
    for (const src of [card, rules]) {
      expect(src.toLowerCase()).not.toMatch(/\bcompleted\b/);
      expect(src.toLowerCase()).not.toMatch(/perfect grow/);
      expect(src.toLowerCase()).not.toMatch(/guaranteed healthy/);
      // 'healthy' substring intentionally forbidden in user copy
      expect(src.toLowerCase()).not.toMatch(/healthy/);
    }
  });

  it("rules module is I/O-free and has no write / RPC / service_role / ingestion surfaces", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
    for (const re of [
      /service_role/i,
      /mqtt/i,
      /home[_-]?assistant/i,
      /pi[_-]?bridge/i,
      /pi[_-]?ingest/i,
      /action[_-]?queue/i,
      /automation/i,
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
    ]) {
      expect(rules).not.toMatch(re);
      expect(card).not.toMatch(re);
    }
  });
});
