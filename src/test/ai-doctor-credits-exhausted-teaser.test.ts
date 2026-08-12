/**
 * AI Doctor credits-exhausted rules — pure math + loader guardrails.
 *
 * Ported from main's #758 slice. On THIS branch the rules module and the
 * `useAiDoctorGrowCreditsUsed` loader back the tent-alerts doctor-CTA
 * credit gate (see alert-doctor-credit-gate.test.tsx); the Plant-Detail
 * teaser COMPONENT itself was not ported, so the original teaser-component
 * wiring pins are intentionally absent here. If that teaser lands on this
 * branch later, restore them from main's copy of this file.
 *
 * These tests pin:
 *  - the exhaustion/low math (limit/used → remaining, malformed input hides);
 *  - eligibility (free plan only, never for paid plans, never while
 *    comfortably under the limit, never falsely "low" on a fresh grow);
 *  - copy stays calm (banned-marketing-word free) for both states;
 *  - the loader stays read-only, scoped to the caller's own rows,
 *    selecting only `weight`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildAiDoctorCreditsExhaustedTeaserView,
  AI_DOCTOR_CREDITS_TEASER_COPY,
  AI_DOCTOR_CREDITS_LOW_COPY,
  AI_DOCTOR_CREDITS_TEASER_HREF,
} from "@/lib/aiDoctorCreditsExhaustedTeaserRules";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("buildAiDoctorCreditsExhaustedTeaserView — exhaustion math", () => {
  it("unresolved input (missing limit/used) → hidden, not a false exhaustion", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: null,
      used: 2,
    });
    expect(v.resolved).toBe(false);
    expect(v.teaser.show).toBe(false);
  });

  it("limit of 0 is treated as unresolved (defensive — real free-plan limit is always 3)", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 0,
      used: 0,
    });
    expect(v.resolved).toBe(false);
    expect(v.teaser.show).toBe(false);
  });

  it("comfortably under the limit (2+ remaining) → remaining computed, teaser hidden", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 3,
      used: 1,
    });
    expect(v.resolved).toBe(true);
    expect(v.remaining).toBe(2);
    expect(v.teaser.show).toBe(false);
    expect(v.teaser.state).toBe("none");
  });

  it("exactly one credit remaining, at least one already spent → LOW state, not exhausted", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 3,
      used: 2,
    });
    expect(v.remaining).toBe(1);
    expect(v.teaser.show).toBe(true);
    expect(v.teaser.state).toBe("low");
    expect(v.teaser.copy).toBe(AI_DOCTOR_CREDITS_LOW_COPY);
  });

  it("a fresh, unused grow with a 1-credit limit is never falsely LOW", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 1,
      used: 0,
    });
    expect(v.remaining).toBe(1);
    expect(v.teaser.show).toBe(false);
    expect(v.teaser.state).toBe("none");
  });

  it("exactly at the limit → remaining 0, teaser shows EXHAUSTED (free plan)", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 3,
      used: 3,
    });
    expect(v.remaining).toBe(0);
    expect(v.teaser.show).toBe(true);
    expect(v.teaser.state).toBe("exhausted");
    expect(v.teaser.copy).toBe(AI_DOCTOR_CREDITS_TEASER_COPY);
  });

  it("over the limit (e.g. a since-reduced allotment) clamps remaining to 0, still shows EXHAUSTED", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: true,
      limit: 3,
      used: 5,
    });
    expect(v.remaining).toBe(0);
    expect(v.teaser.show).toBe(true);
    expect(v.teaser.state).toBe("exhausted");
  });

  it("never shows for paid plans, even at/over the limit", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: false,
      limit: 100,
      used: 100,
    });
    expect(v.teaser.show).toBe(false);
  });

  it("never shows LOW for paid plans either, even at the exact one-remaining threshold", () => {
    const v = buildAiDoctorCreditsExhaustedTeaserView({
      isFreePlan: false,
      limit: 3,
      used: 2,
    });
    expect(v.teaser.show).toBe(false);
    expect(v.teaser.state).toBe("none");
  });

  it("exhausted-state copy is calm — no banned marketing words", () => {
    expect(paywallCtaHasBannedWords(AI_DOCTOR_CREDITS_TEASER_COPY)).toBe(false);
  });

  it("low-state copy is calm — no banned marketing words", () => {
    expect(paywallCtaHasBannedWords(AI_DOCTOR_CREDITS_LOW_COPY)).toBe(false);
  });

  it("low-state and exhausted-state copy are distinct", () => {
    expect(AI_DOCTOR_CREDITS_LOW_COPY).not.toBe(AI_DOCTOR_CREDITS_TEASER_COPY);
  });

  it("teaser links to /pricing", () => {
    expect(AI_DOCTOR_CREDITS_TEASER_HREF).toBe("/pricing");
  });
});

describe("loader guardrails", () => {
  const HOOK = read("src/hooks/useAiDoctorGrowCreditsUsed.ts");

  it("loader is read-only, scoped to the caller's own rows, and selects only weight", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']ai_credit_spends["']\s*\)/);
    expect(HOOK).toMatch(/\.select\(\s*["']weight["']\s*\)/);
    expect(HOOK).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*user!?\.id\s*\)/);
    expect(HOOK).toMatch(/\.eq\(\s*["']grow_id["']\s*,\s*growId/);
    expect(HOOK).not.toMatch(
      /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|functions\.invoke/,
    );
    // Never selects `result` — it can carry unrelated AI Doctor payload data.
    expect(HOOK).not.toMatch(/\.select\([^)]*result/);
  });

  it("loader is disabled without a signed-in user and a grow id", () => {
    expect(HOOK).toMatch(/enabled:\s*!!user\s*&&\s*!!growId/);
  });
});
