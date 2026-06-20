import type { ReflectionOutput } from "./postGrowReflectionTypes";

export function createValidPostGrowReflectionOutput(): ReflectionOutput {
  return {
    executive_reflection:
      "This run showed useful stability: flower VPD averaged 1.21 kPa across 624 readings, and the final cure stabilized near 60% RH by 2026-05-18.",
    key_wins: [
      "Environmental control was repeatable in flower: 87% of VPD readings stayed in the 0.9-1.5 kPa target band.",
      "The 11-day dry protected quality in this run; weight moved from 1420 g on 2026-04-28 to 389 g on 2026-05-09.",
      "Cure notes improved from green diesel to diesel citrus by evt-cure-006.",
    ],
    repeat_next_run: [
      "Repeat the slow dry target that coincided with 60% final jar RH and a 9.2 quality score.",
      "Keep moderate feed strength after week 4 because the notes report no unresolved late-flower pest or stress flags.",
    ],
    adjust_or_avoid: [
      "Avoid treating the strong harvest as proof that one action caused the result; keep comparing timing across future runs.",
    ],
    post_harvest_specific_insights: [
      "Weight loss slowed near day 11, ending at 389 g after starting at 1420 g, which suggests the dry was not rushed in this run.",
      "Jar RH moved from 64% on 2026-05-10 to 60% on 2026-05-18 while aroma notes improved.",
    ],
    pheno_strain_notes: [
      "No strong pheno claim should be made unless future plant-level notes separate individual Sour Diesel plants.",
    ],
    low_risk_experiments: [
      "Repeat the photo cadence and add one labeled dry-room airflow note during the first 48 hours after harvest.",
    ],
    confidence: "High",
    gaps: ["No major gaps were recorded in the fixture, but future plant-level pheno notes would improve selection confidence."],
  };
}

export function createMalformedPostGrowReflectionOutput(): unknown {
  return {
    executive_reflection: "Looks good.",
    key_wins: "Stable environment",
    repeat_next_run: [],
    adjust_or_avoid: [],
    post_harvest_specific_insights: [],
    pheno_strain_notes: [],
    low_risk_experiments: [],
    confidence: "Very High",
  };
}

export function createOverconfidentPostGrowReflectionOutput(): ReflectionOutput {
  return {
    ...createValidPostGrowReflectionOutput(),
    executive_reflection:
      "The 11-day dry definitely caused the 9.2 quality score and will guarantee the same result next run.",
    confidence: "High",
    gaps: ["Missing side-by-side control data."],
  };
}

export function createMissingEvidencePostGrowReflectionOutput(): ReflectionOutput {
  return {
    executive_reflection: "The grow went well and the dry was good.",
    key_wins: ["The plant looked healthy."],
    repeat_next_run: ["Repeat the same approach."],
    adjust_or_avoid: ["Avoid changing too much."],
    post_harvest_specific_insights: ["The cure seemed fine."],
    pheno_strain_notes: ["No clear pheno notes."],
    low_risk_experiments: ["Take better notes."],
    confidence: "Medium",
    gaps: ["More data would help."],
  };
}

export function createUnsafeAutomationPostGrowReflectionOutput(): ReflectionOutput {
  return {
    ...createValidPostGrowReflectionOutput(),
    repeat_next_run: [
      "Automatically control the exhaust fan when RH reaches 60% and turn on the dehumidifier without review.",
    ],
    confidence: "Medium",
  };
}
