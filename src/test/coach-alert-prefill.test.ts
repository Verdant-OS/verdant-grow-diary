/**
 * Coach page — optional alert-context prefill (`/doctor?alertId=...`).
 *
 * Pure-rule unit tests for src/lib/coachAlertPrefill.ts plus source-level
 * static pins on src/pages/Coach.tsx (the house style for Coach changes —
 * see coach-ai-doctor-session-id-threading.test.tsx).
 *
 * Invariants:
 *  - The alertId param is validated against the back-pointer id grammar
 *    before any DB lookup.
 *  - Prefill only composes from stored alert fields (title + reason) and
 *    never overwrites a question the grower already typed.
 *  - Navigation alone never fires an AI request: the prefill effect
 *    contains no ask() call and no functions.invoke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COACH_ALERT_ID_PARAM,
  buildCoachAlertPrefillQuestion,
  normalizeCoachAlertIdParam,
} from "@/lib/coachAlertPrefill";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const PREFILL_LIB = readFileSync(
  resolve(ROOT, "src/lib/coachAlertPrefill.ts"),
  "utf8",
);

describe("normalizeCoachAlertIdParam", () => {
  it("accepts UUID-shaped and token-grammar ids, trimming whitespace", () => {
    expect(
      normalizeCoachAlertIdParam("f47ac10b-58cc-4372-a567-0e02b2c3d479"),
    ).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(normalizeCoachAlertIdParam("  abc_DEF-123  ")).toBe("abc_DEF-123");
  });

  it("rejects null/empty/oversized/invalid values", () => {
    expect(normalizeCoachAlertIdParam(null)).toBeNull();
    expect(normalizeCoachAlertIdParam(undefined)).toBeNull();
    expect(normalizeCoachAlertIdParam("")).toBeNull();
    expect(normalizeCoachAlertIdParam("   ")).toBeNull();
    expect(normalizeCoachAlertIdParam("a".repeat(65))).toBeNull();
    expect(normalizeCoachAlertIdParam("has space")).toBeNull();
    expect(normalizeCoachAlertIdParam("slash/y")).toBeNull();
    expect(normalizeCoachAlertIdParam("[alert:x]")).toBeNull();
    expect(normalizeCoachAlertIdParam("a;drop table")).toBeNull();
  });

  it("exports the param name used by alert surfaces", () => {
    expect(COACH_ALERT_ID_PARAM).toBe("alertId");
  });
});

describe("buildCoachAlertPrefillQuestion", () => {
  it("composes title + reason into a single reviewable question", () => {
    expect(
      buildCoachAlertPrefillQuestion({
        title: "Temperature above target",
        reason: "Temperature is above the configured maximum.",
      }),
    ).toBe(
      "Open alert: Temperature above target. Temperature is above the configured maximum. What should I check first?",
    );
  });

  it("omits the reason segment when reason is blank", () => {
    expect(
      buildCoachAlertPrefillQuestion({ title: "VPD out of range", reason: "" }),
    ).toBe("Open alert: VPD out of range. What should I check first?");
    expect(
      buildCoachAlertPrefillQuestion({ title: "VPD out of range", reason: null }),
    ).toBe("Open alert: VPD out of range. What should I check first?");
  });

  it("normalizes trailing periods instead of doubling them", () => {
    expect(
      buildCoachAlertPrefillQuestion({ title: "Temp high.", reason: "Above max.." }),
    ).toBe("Open alert: Temp high. Above max. What should I check first?");
  });

  it("returns null without a usable title", () => {
    expect(buildCoachAlertPrefillQuestion({ title: "", reason: "x" })).toBeNull();
    expect(buildCoachAlertPrefillQuestion({ title: null, reason: "x" })).toBeNull();
    expect(buildCoachAlertPrefillQuestion({ title: "  .", reason: "x" })).toBeNull();
  });

  it("template copy passes the calm-copy linter and avoids certainty language", () => {
    const q = buildCoachAlertPrefillQuestion({
      title: "Humidity above target",
      reason: "Humidity is above the configured maximum",
    })!;
    expect(paywallCtaHasBannedWords(q)).toBe(false);
    expect(q.toLowerCase()).not.toMatch(/diagnos(is|e)d?|will fix|guarantee/);
  });
});

// ---------- Static pins on Coach.tsx ----------
describe("Coach wiring · alert prefill", () => {
  it("reads search params and the shared param constant", () => {
    expect(COACH).toMatch(
      /import\s*\{[^}]*useSearchParams[^}]*\}\s*from\s*["']react-router-dom["']/,
    );
    expect(COACH).toMatch(/searchParams\.get\(COACH_ALERT_ID_PARAM\)/);
  });

  it("fetches the alert via the RLS-scoped alerts lib only after id validation", () => {
    expect(COACH).toMatch(
      /import\s*\{[^}]*getAlertById[^}]*\}\s*from\s*["']@\/lib\/alerts["']/,
    );
    const effect = COACH.split("normalizeCoachAlertIdParam(alertIdParam)")[1] ?? "";
    expect(effect.length).toBeGreaterThan(0);
    const block = effect.slice(0, effect.indexOf("[alertIdParam]"));
    expect(block).toMatch(/getAlertById\(alertId\)/);
  });

  it("never clobbers a question the grower already typed", () => {
    expect(COACH).toMatch(
      /setQuestion\(\(q\)\s*=>\s*\(q\.trim\(\)\.length\s*>\s*0\s*\?\s*q\s*:\s*prefill\)\)/,
    );
  });

  it("prefill effect never fires an AI request or write", () => {
    const start = COACH.indexOf("Optional alert-context prefill");
    expect(start).toBeGreaterThan(-1);
    const end = COACH.indexOf("[alertIdParam]);", start);
    expect(end).toBeGreaterThan(start);
    const effect = COACH.slice(start, end);
    expect(effect).not.toMatch(/\bask\(/);
    expect(effect).not.toMatch(/functions\.invoke/);
    expect(effect).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("Coach still performs exactly one edge invoke and two action_queue inserts", () => {
    expect((COACH.match(/functions\.invoke\(/g) ?? []).length).toBe(1);
    expect(
      (COACH.match(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/g) ?? [])
        .length,
    ).toBe(2);
  });
});

describe("static safety · coachAlertPrefill lib", () => {
  it("is pure — no React, no Supabase, no I/O", () => {
    expect(PREFILL_LIB).not.toMatch(/from\s+["']react["']/);
    expect(PREFILL_LIB).not.toMatch(/@\/integrations\/supabase/);
    expect(PREFILL_LIB).not.toMatch(/fetch\(/);
    expect(PREFILL_LIB).not.toMatch(/\.from\(/);
  });
});
