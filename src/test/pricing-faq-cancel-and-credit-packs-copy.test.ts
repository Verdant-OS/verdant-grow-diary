/**
 * Pricing page FAQ: two answers that disagreed with the product.
 *
 * 1. "Does Verdant charge extra for AI Doctor?" said "No à-la-carte AI
 *    charges", but Pro and Craft members can buy one-time credit packs
 *    (`CREDIT_PACKS` in src/constants/pricing.ts).
 * 2. "Can I cancel anytime?" promised read-only access to logs after
 *    cancelling. No read-only mode exists: paid access runs to the end of the
 *    paid period (Settings: "access continues until the end of your current
 *    period"), then the account is on Free.
 *
 * The cancel answer appears twice in Pricing.tsx (visible accordion and the
 * FAQPage JSON-LD array), so both copies are checked.
 *
 * @source-scan-justified: the cancel answer is inline JSX and a literal in a
 * component-local array; neither is exported, so the page source is the only
 * place to resolve it from.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CREDIT_PACKS } from "@/constants/pricing";
import { VERDANT_PRICING_FAQ_ADDITIONS } from "@/constants/verdantSeoCopy";

const PAGE = readFileSync(resolve(__dirname, "..", "pages/Pricing.tsx"), "utf8");
const PAGE_FLAT = PAGE.replace(/\s+/g, " ");

const aiAnswer = (): string => {
  const entry = VERDANT_PRICING_FAQ_ADDITIONS.find(
    (e) => e.question === "Does Verdant charge extra for AI Doctor?",
  );
  expect(entry).toBeDefined();
  return entry!.answer;
};

describe("Pricing FAQ: AI charges answer", () => {
  it("no longer says there are no à-la-carte AI charges", () => {
    expect(aiAnswer()).not.toMatch(/no à-la-carte/i);
  });

  it("mentions one-time credit packs with the catalog's credits and prices", () => {
    const answer = aiAnswer();
    expect(answer).toMatch(/one-time credit packs/i);
    for (const pack of CREDIT_PACKS) {
      expect(answer).toContain(`${pack.credits} credits for $${pack.priceUsd}`);
    }
  });

  it("keeps the included-credit facts", () => {
    const answer = aiAnswer();
    expect(answer).toContain("3 AI Doctor credits per grow");
    expect(answer).toContain("100 AI Doctor credits per UTC calendar month");
    expect(answer).toContain("Craft includes 300");
  });
});

describe("Pricing FAQ: cancel answer", () => {
  it("keeps the question", () => {
    expect(PAGE).toMatch(/Can I cancel anytime\?/);
  });

  it("promises no read-only access to logs anywhere on the page", () => {
    expect(PAGE_FLAT).not.toMatch(/read-only access to your logs/i);
  });

  it("states the end-of-period behavior in both the accordion and the JSON-LD copy", () => {
    const sentence =
      "You keep paid features until the end of the billing period you paid for, then your account moves to Free.";
    const occurrences = PAGE_FLAT.split(sentence).length - 1;
    expect(occurrences).toBe(2);
  });
});
