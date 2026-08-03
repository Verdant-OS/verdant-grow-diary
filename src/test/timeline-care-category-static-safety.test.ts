/**
 * Static wiring — main Timeline care category chips + SSR client import safety.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

describe("timeline care category — Timeline.tsx wiring", () => {
  const src = read("src/pages/Timeline.tsx");
  const rules = read("src/lib/timelineEvidenceFilterRules.ts");

  it("wires care category filter UI and state", () => {
    expect(src).toMatch(/timeline-care-category-filter/);
    expect(src).toMatch(/careCategoryFilter/);
    expect(src).toMatch(/TIMELINE_CARE_CATEGORY_FILTERS/);
    expect(src).toMatch(/careCategory:\s*careCategoryFilter/);
  });

  it("exposes watering, feeding, training, and diagnoses labels", () => {
    expect(rules).toMatch(/watering:\s*"Watering"/);
    expect(rules).toMatch(/feeding:\s*"Feeding"/);
    expect(rules).toMatch(/training:\s*"Training"/);
    expect(rules).toMatch(/symptoms:\s*"Diagnoses"/);
  });

  it("uses classifyTimelineEntry for care category grouping", () => {
    expect(rules).toMatch(/classifyTimelineEntry/);
    expect(rules).toMatch(/careCategory/);
  });

  it("keeps date-range inputs available on the page", () => {
    expect(src).toMatch(/timeline-start-date/);
    expect(src).toMatch(/timeline-end-date/);
    expect(src).toMatch(/timeline-search-input/);
  });
});

describe("supabase client SSR import contract", () => {
  const client = read("src/integrations/supabase/client.ts");

  it("does not eagerly read window.sessionStorage in the createClient options object", () => {
    // Forbidden patterns that evaluate sessionStorage while building options.
    expect(client).not.toMatch(/storage:\s*typeof window[^\n]*sessionStorage/);
    expect(client).not.toMatch(/storage:\s*window\.sessionStorage/);
    expect(client).toMatch(/createLazySessionStorage/);
  });
});
