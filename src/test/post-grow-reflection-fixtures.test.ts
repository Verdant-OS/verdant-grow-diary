import { describe, expect, it } from "vitest";

import {
  createConflictingSignalsReflectionContext,
  createPostHarvestHeavyReflectionContext,
  createRichPhotoperiodReflectionContext,
  createThinAutoflowerReflectionContext,
} from "@/lib/ai/postGrowReflectionFixtures";

describe("post-grow reflection fixtures", () => {
  it("uses stable fixture identifiers", () => {
    expect(createRichPhotoperiodReflectionContext().grow_id).toBe("grow-reflection-rich-sour-diesel-001");
    expect(createThinAutoflowerReflectionContext().grow_id).toBe("grow-reflection-thin-auto-001");
    expect(createConflictingSignalsReflectionContext().grow_id).toBe("grow-reflection-conflicting-001");
    expect(createPostHarvestHeavyReflectionContext().grow_id).toBe("grow-reflection-post-harvest-heavy-001");
  });

  it("rich photoperiod fixture includes harvest, dry, cure, quality, and sensor evidence", () => {
    const context = createRichPhotoperiodReflectionContext();

    expect(context.grow_type).toBe("photoperiod");
    expect(context.sensor_coverage_pct).toBe(92);
    expect(context.events.some((event) => event.type === "harvest")).toBe(true);
    expect(context.events.some((event) => event.type === "dry_checkpoint")).toBe(true);
    expect(context.events.some((event) => event.type === "cure_burp")).toBe(true);
    expect(context.post_harvest_outcomes?.weight_loss_curve.length).toBeGreaterThan(2);
    expect(context.quality_scores?.overall).toBe(9.2);
    expect(context.stages.flower.metrics[0].percent_in_target).toBe(87);
  });

  it("thin autoflower fixture makes missing post-harvest data explicit", () => {
    const context = createThinAutoflowerReflectionContext();

    expect(context.grow_type).toBe("autoflower");
    expect(context.sensor_coverage_pct).toBe(38);
    expect(context.post_harvest_outcomes).toBeUndefined();
    expect(context.known_gaps).toContain("Missing all dry/cure checkpoint data.");
    expect(context.quality_scores?.overall).toBeNull();
  });

  it("conflicting fixture includes positive stability and negative user recovery note", () => {
    const context = createConflictingSignalsReflectionContext();

    expect(context.stages.flower.metrics[0].percent_in_target).toBe(87);
    expect(context.quality_scores?.smoothness).toBe(7);
    expect(context.user_notes).toContain("over-defoliated in week 4");
    expect(context.events.some((event) => event.id === "evt-defol-004")).toBe(true);
    expect(context.known_gaps).toContain("No side-by-side control plant for defoliation timing.");
  });

  it("post-harvest heavy fixture includes fast dry and cure recovery evidence", () => {
    const context = createPostHarvestHeavyReflectionContext();
    const curve = context.post_harvest_outcomes?.weight_loss_curve ?? [];
    const rhCurve = context.post_harvest_outcomes?.cure_rh_curve ?? [];

    expect(curve[1].loss_pct_from_previous).toBe(18);
    expect(rhCurve[0].jar_rh_pct).toBe(69);
    expect(rhCurve[0].smell_note).toContain("hay");
    expect(context.post_harvest_outcomes?.final_jar_rh_pct).toBe(60);
    expect(context.post_harvest_outcomes?.flags_resolved).toContain("Initial hay smell improved after extended burping.");
  });
});
