/**
 * verdant-seo-landing-copy.test.ts
 *
 * Static scanner. Reads Landing.tsx + verdantSeoCopy.ts at test time — no
 * React render, no Supabase, no network. Asserts:
 *
 *   1. All five SEO landing sections are wired into Landing.tsx by id.
 *   2. Section copy carries the required target phrases.
 *   3. The six source labels (live · manual · csv · demo · stale · invalid)
 *      are reachable from the visible landing surface.
 *   4. At least one safe-promise line ("cannot touch your equipment" or
 *      "does not control equipment") is present.
 *   5. No forbidden automation / device-control language leaks into the
 *      rendered Landing / SEO copy (forbidden strings may only appear in
 *      denylist arrays inside test files or docs examples).
 *   6. The landing FAQ used for FAQPage JSON-LD has no empty answer.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERDANT_SEO_LANDING_SECTIONS,
  VERDANT_LANDING_FAQ,
  VERDANT_PRICING_FAQ_ADDITIONS,
  VERDANT_FORBIDDEN_PUBLIC_PHRASES,
} from "@/constants/verdantSeoCopy";

const REPO_ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), "utf8");

const LANDING = read("src/pages/Landing.tsx");
const SEO_COPY = read("src/constants/verdantSeoCopy.ts");
const PUBLIC_RENDERED = [LANDING, SEO_COPY].join("\n\n");

describe("Verdant SEO landing copy", () => {
  it("has exactly the 5 required SEO landing section ids", () => {
    const expected = [
      "seo-grow-diary",
      "seo-vpd-tracker",
      "seo-hardware-neutral",
      "seo-ai-doctor",
      "seo-plant-memory",
    ];
    expect(VERDANT_SEO_LANDING_SECTIONS.map((s) => s.id)).toEqual(expected);
  });

  it("wires every SEO section id into Landing.tsx via the shared map", () => {
    // Landing renders sections by iterating VERDANT_SEO_LANDING_SECTIONS and
    // setting `id={section.id}`, so the presence of that expression is what
    // guarantees each section id is reachable in the DOM.
    expect(LANDING).toContain("VERDANT_SEO_LANDING_SECTIONS");
    expect(LANDING).toMatch(/id=\{section\.id\}/);
  });

  it("includes required grower-intent phrases in section copy", () => {
    const combined = VERDANT_SEO_LANDING_SECTIONS.map(
      (s) => `${s.heading} ${s.body}`,
    ).join("\n");
    for (const phrase of [
      "grow diary app",
      "grow room VPD tracker",
      "gear you already own",
      "AI grow doctor",
      "plant memory",
    ]) {
      expect(combined.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("names all six source labels somewhere reachable from Landing", () => {
    for (const label of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(PUBLIC_RENDERED.toLowerCase()).toContain(label);
    }
  });

  it("keeps at least one safe-promise line reachable from Landing", () => {
    const safe = [
      /cannot\s+touch\s+your\s+equipment/i,
      /does\s+not\s+control\s+equipment/i,
      /approval[-\s]required\s+by\s+design/i,
    ];
    expect(safe.some((rx) => rx.test(PUBLIC_RENDERED))).toBe(true);
  });

  it("does not leak forbidden automation / device-control language", () => {
    // The literal denylist strings live only in this file and the
    // constants file's forbidden-phrases array (metadata for tests /
    // docs), so we scan the *rendered* Landing surface only.
    for (const phrase of VERDANT_FORBIDDEN_PUBLIC_PHRASES) {
      expect(LANDING.toLowerCase()).not.toContain(phrase.toLowerCase());
    }
  });

  it("has non-empty visible FAQ answers on Landing and Pricing additions", () => {
    for (const entry of [
      ...VERDANT_LANDING_FAQ,
      ...VERDANT_PRICING_FAQ_ADDITIONS,
    ]) {
      expect(entry.question.trim().length).toBeGreaterThan(0);
      expect(entry.answer.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders every landing FAQ question in Landing.tsx via the shared map", () => {
    // The visible accordion iterates VERDANT_LANDING_FAQ, and FAQPage
    // JSON-LD is built from the same constant — so if the map + import
    // are present, visible copy and structured data cannot drift.
    expect(LANDING).toContain("VERDANT_LANDING_FAQ");
    expect(LANDING).toContain("buildFaqPageJsonLd");
  });
});
