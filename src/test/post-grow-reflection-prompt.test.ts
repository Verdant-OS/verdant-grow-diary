import { describe, expect, it } from "vitest";

import {
  POST_GROW_REFLECTION_PROMPT_VERSION,
  POST_GROW_REFLECTION_REQUIRED_HEADINGS,
  buildPostGrowReflectionPrompt,
  stableContextJson,
} from "@/lib/ai/postGrowReflectionPrompt";
import {
  createRichPhotoperiodReflectionContext,
  createThinAutoflowerReflectionContext,
} from "@/lib/ai/postGrowReflectionFixtures";

describe("buildPostGrowReflectionPrompt", () => {
  it("includes all required output headings", () => {
    const prompt = buildPostGrowReflectionPrompt(createRichPhotoperiodReflectionContext());

    for (const heading of POST_GROW_REFLECTION_REQUIRED_HEADINGS) {
      expect(prompt).toContain(heading);
    }
  });

  it("includes the strict cautious reflection rules", () => {
    const prompt = buildPostGrowReflectionPrompt(createRichPhotoperiodReflectionContext());

    expect(prompt).toContain("Never claim causation from correlation");
    expect(prompt).toContain("coincided with");
    expect(prompt).toContain("If data is thin, missing, stale, invalid, or conflicting, lower confidence");
    expect(prompt).toContain("For autoflowers, be extra cautious about stress");
    expect(prompt).toContain("Do not suggest device control, autopilot behavior, or automated equipment execution");
  });

  it("injects the full stable context JSON with exact evidence numbers", () => {
    const context = createRichPhotoperiodReflectionContext();
    const prompt = buildPostGrowReflectionPrompt(context);

    expect(prompt).toContain(POST_GROW_REFLECTION_PROMPT_VERSION);
    expect(prompt).toContain('"grow_id": "grow-reflection-rich-sour-diesel-001"');
    expect(prompt).toContain('"sensor_coverage_pct": 92');
    expect(prompt).toContain('"percent_in_target": 87');
    expect(prompt).toContain('"overall": 9.2');
    expect(prompt).toContain('"final_jar_rh_pct": 60');
  });

  it("is deterministic for the same input context", () => {
    const context = createRichPhotoperiodReflectionContext();
    expect(buildPostGrowReflectionPrompt(context)).toBe(buildPostGrowReflectionPrompt(context));
    expect(stableContextJson(context)).toBe(stableContextJson(context));
  });

  it("keeps thin autoflower context visibly thin instead of filling missing data", () => {
    const prompt = buildPostGrowReflectionPrompt(createThinAutoflowerReflectionContext());

    expect(prompt).toContain('"grow_type": "autoflower"');
    expect(prompt).toContain('"sensor_coverage_pct": 38');
    expect(prompt).toContain("Missing all dry/cure checkpoint data");
    expect(prompt).toContain('"post_harvest_outcomes": null');
    expect(prompt).not.toContain('"overall": 9.2');
  });
});
