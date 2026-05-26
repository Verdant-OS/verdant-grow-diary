/**
 * Tests for Daily Grow Check History card onboarding / empty-state guidance.
 *
 * Uses static file analysis for wiring contracts and pure-function checks
 * for copy safety. Does not re-test the underlying history or consistency
 * calculation (covered by existing tests).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ONBOARDING_HEADLINE,
  ONBOARDING_BODY,
  ONBOARDING_SECONDARY,
  CTA_QUICK_LOG,
  CTA_ENV_SNAPSHOT,
  WHAT_COUNTS_HINT,
} from "@/lib/dailyGrowCheckGuidanceRules";

const root = resolve(__dirname, "../..");

const histCard = readFileSync(
  resolve(root, "src/components/PlantDailyGrowCheckHistoryCard.tsx"),
  "utf8",
);
const guidanceRules = readFileSync(resolve(root, "src/lib/dailyGrowCheckGuidanceRules.ts"), "utf8");
const histRules = readFileSync(resolve(root, "src/lib/dailyGrowCheckHistoryRules.ts"), "utf8");

describe("Daily Grow Check History · onboarding empty state", () => {
  it("history card renders the onboarding panel test ID", () => {
    expect(histCard).toMatch(/plant-daily-grow-check-history-onboarding/);
  });

  it("history card renders Quick Log CTA test ID", () => {
    expect(histCard).toMatch(/plant-daily-grow-check-history-cta-note/);
  });

  it("history card renders environment snapshot CTA test ID", () => {
    expect(histCard).toMatch(/plant-daily-grow-check-history-cta-sensor/);
  });

  it("history card uses shared buildDailyCheckEntryHref helper for CTA hrefs", () => {
    expect(histCard).toMatch(/buildDailyCheckEntryHref/);
  });

  it("history card Quick Log CTA includes method=note via buildDailyCheckEntryHref", () => {
    expect(histCard).toMatch(/method.*note/);
  });

  it("history card environment snapshot CTA includes method=sensor via buildDailyCheckEntryHref", () => {
    expect(histCard).toMatch(/method.*sensor/);
  });

  it("history card imports all onboarding copy from guidance rules (no string duplication in TSX)", () => {
    expect(histCard).toMatch(/ONBOARDING_HEADLINE/);
    expect(histCard).toMatch(/ONBOARDING_BODY/);
    expect(histCard).toMatch(/ONBOARDING_SECONDARY/);
    expect(histCard).toMatch(/CTA_QUICK_LOG/);
    expect(histCard).toMatch(/CTA_ENV_SNAPSHOT/);
    expect(histCard).toMatch(/WHAT_COUNTS_HINT/);
  });

  it("history card still renders normal rows when activity is present", () => {
    expect(histCard).toMatch(/plant-daily-grow-check-history-rows/);
  });

  it("history card uses hasDailyCheckActivity from rules (no logic duplication in TSX)", () => {
    expect(histCard).toMatch(/hasDailyCheckActivity/);
  });

  it("history rules exports hasDailyCheckActivity helper", () => {
    expect(histRules).toMatch(/export function hasDailyCheckActivity/);
  });
});

describe("Daily Grow Check History · onboarding copy safety", () => {
  it("onboarding copy constants do not contain forbidden words", () => {
    const allCopy = [
      ONBOARDING_HEADLINE,
      ONBOARDING_BODY,
      ONBOARDING_SECONDARY,
      CTA_QUICK_LOG,
      CTA_ENV_SNAPSHOT,
      WHAT_COUNTS_HINT,
    ]
      .join(" ")
      .toLowerCase();

    expect(allCopy).not.toMatch(/\bcomplete\b/);
    expect(allCopy).not.toMatch(/\bcompleted\b/);
    expect(allCopy).not.toMatch(/\bperfect\b/);
    expect(allCopy).not.toMatch(/\bhealthy\b/);
  });

  it("onboarding body mentions both check methods", () => {
    expect(ONBOARDING_BODY.toLowerCase()).toMatch(/quicklog|quick log/);
    expect(ONBOARDING_BODY.toLowerCase()).toMatch(/manual.*snapshot|snapshot.*manual/);
  });

  it("WHAT_COUNTS_HINT explains both check paths", () => {
    expect(WHAT_COUNTS_HINT.toLowerCase()).toMatch(/quick note/);
    expect(WHAT_COUNTS_HINT.toLowerCase()).toMatch(/manual sensor snapshot/);
  });
});

describe("Daily Grow Check History · wiring safety", () => {
  it("history card has no Supabase write surfaces", () => {
    for (const re of [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
      /service_role/i,
    ]) {
      expect(histCard).not.toMatch(re);
    }
  });

  it("history card has no AI Coach, action_queue, device-control, or automation references", () => {
    for (const re of [
      /ai[_-]?coach/i,
      /action[_-]?queue/i,
      /device[_-]?command/i,
      /automation/i,
      /mqtt/i,
      /home[_-]?assistant/i,
    ]) {
      expect(histCard).not.toMatch(re);
    }
  });

  it("guidance rules file is I/O-free and write-free", () => {
    expect(guidanceRules).not.toMatch(/@\/integrations\/supabase/);
    expect(guidanceRules).not.toMatch(/from\s+["']react["']/);
    for (const re of [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /\.upsert\(/,
      /\.rpc\(/,
      /service_role/i,
      /action[_-]?queue/i,
      /ai[_-]?coach/i,
    ]) {
      expect(guidanceRules).not.toMatch(re);
    }
  });
});
