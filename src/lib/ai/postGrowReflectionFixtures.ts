import type { GrowContext } from "./postGrowReflectionTypes";

const richStages = {
  veg: {
    stage: "veg",
    start_date: "2026-02-01",
    end_date: "2026-03-05",
    sensor_coverage_pct: 90,
    metrics: [
      {
        metric: "vpd_kpa",
        unit: "kPa",
        count: 384,
        average: 0.92,
        min: 0.68,
        max: 1.22,
        variance: 0.04,
        percent_in_target: 83,
        target_band: "0.7-1.1 kPa",
        notable_excursions: [],
      },
    ],
  },
  flower: {
    stage: "flower",
    start_date: "2026-03-06",
    end_date: "2026-04-27",
    sensor_coverage_pct: 94,
    metrics: [
      {
        metric: "vpd_kpa",
        unit: "kPa",
        count: 624,
        average: 1.21,
        min: 0.82,
        max: 1.58,
        variance: 0.05,
        percent_in_target: 87,
        target_band: "0.9-1.5 kPa",
        notable_excursions: [
          {
            occurred_at: "2026-04-09T16:00:00Z",
            value: 1.72,
            note: "Short high-VPD excursion during warm afternoon.",
            linked_event_id: "evt-flower-vpd-001",
          },
        ],
      },
      {
        metric: "humidity_pct",
        unit: "%",
        count: 624,
        average: 53,
        min: 44,
        max: 63,
        variance: 12.4,
        percent_in_target: 91,
        target_band: "45-60% RH",
        notable_excursions: [],
      },
    ],
  },
};

export function createRichPhotoperiodReflectionContext(): GrowContext {
  return {
    grow_id: "grow-reflection-rich-sour-diesel-001",
    name: "Sour Diesel 4x4 Spring Run",
    strain: "Sour Diesel",
    grow_type: "photoperiod",
    start_date: "2026-02-01",
    end_date: "2026-05-28",
    final_stage: "curing_complete",
    sensor_coverage_pct: 92,
    source_tags: ["live", "manual"],
    stages: richStages,
    events: [
      {
        id: "evt-harvest-001",
        type: "harvest",
        occurred_at: "2026-04-28T14:30:00Z",
        summary: "Harvested full tent after 53 flower days.",
        evidence: { wet_weight_grams: 1420 },
      },
      {
        id: "evt-dry-003",
        type: "dry_checkpoint",
        occurred_at: "2026-05-06T14:30:00Z",
        summary: "Day 8 dry checkpoint; stems bending, room RH stable.",
        evidence: { weight_grams: 452, room_rh_pct: 59 },
      },
      {
        id: "evt-cure-006",
        type: "cure_burp",
        occurred_at: "2026-05-18T20:00:00Z",
        summary: "Jar RH stabilized at 60% after consistent burping.",
        evidence: { jar_rh_pct: 60, smell_note: "diesel citrus, no hay" },
      },
      {
        id: "evt-final-yield-001",
        type: "final_yield_assessment",
        occurred_at: "2026-05-28T18:00:00Z",
        summary: "Final dry yield and quality score recorded.",
        evidence: { final_dry_yield_grams: 387, overall_quality_score: 9.2 },
      },
    ],
    watering_feeding_summary: {
      watering_event_count: 28,
      feeding_event_count: 12,
      consistency_notes: ["No missed watering events recorded in flower.", "Feed strength stayed moderate after week 4."],
      known_gaps: [],
    },
    photo_summary: {
      photo_count: 64,
      key_observations: ["Dense top colas documented on 2026-04-18.", "No unresolved pest flags in late flower photos."],
      known_gaps: [],
    },
    quality_scores: {
      overall: 9.2,
      aroma: 9.4,
      smoothness: 9.1,
      flavor: 9,
      structure: 8.8,
      notes: "Dense tops, strong diesel aroma, smooth after cure.",
    },
    post_harvest_outcomes: {
      harvest_weight_grams: 1420,
      final_dry_yield_grams: 387,
      weight_loss_curve: [
        { day: 0, date: "2026-04-28", weight_grams: 1420, loss_pct_from_harvest_start: 0 },
        { day: 4, date: "2026-05-02", weight_grams: 760, loss_pct_from_harvest_start: 46.5 },
        { day: 8, date: "2026-05-06", weight_grams: 452, loss_pct_from_harvest_start: 68.2 },
        { day: 11, date: "2026-05-09", weight_grams: 389, loss_pct_from_harvest_start: 72.6 },
      ],
      cure_rh_curve: [
        { date: "2026-05-10", jar_rh_pct: 64, smell_note: "green diesel", burped: true },
        { date: "2026-05-14", jar_rh_pct: 61, smell_note: "diesel citrus", burped: true },
        { date: "2026-05-18", jar_rh_pct: 60, smell_note: "diesel citrus, no hay", burped: true },
      ],
      final_jar_rh_pct: 60,
      smell_progression_notes: ["Green note faded by cure day 8.", "Diesel citrus aroma held through final assessment."],
      flags_resolved: [],
    },
    user_notes: "The 11-day slow dry felt repeatable and protected aroma.",
    previous_user_lessons: [],
    known_gaps: [],
  };
}

export function createThinAutoflowerReflectionContext(): GrowContext {
  return {
    grow_id: "grow-reflection-thin-auto-001",
    name: "Blue Dream Auto First Run",
    strain: "Blue Dream Auto",
    grow_type: "autoflower",
    start_date: "2026-03-01",
    end_date: "2026-05-20",
    final_stage: "harvest",
    sensor_coverage_pct: 38,
    source_tags: ["manual"],
    stages: {
      flower: {
        stage: "flower",
        sensor_coverage_pct: 38,
        metrics: [
          {
            metric: "humidity_pct",
            unit: "%",
            count: 8,
            average: 57,
            min: 49,
            max: 68,
            variance: null,
            percent_in_target: null,
            target_band: null,
            notable_excursions: [],
          },
        ],
      },
    },
    events: [
      {
        id: "evt-thin-harvest-001",
        type: "harvest",
        occurred_at: "2026-05-20T15:00:00Z",
        summary: "Harvest logged without dry/cure follow-up checkpoints.",
        evidence: { final_dry_yield_grams: null },
      },
    ],
    photo_summary: {
      photo_count: 4,
      key_observations: ["Few late-flower photos available."],
      known_gaps: ["No weekly photo cadence."],
    },
    quality_scores: { overall: null, notes: "Generic notes only." },
    post_harvest_outcomes: undefined,
    user_notes: "First run, did not keep many notes.",
    previous_user_lessons: [],
    known_gaps: ["Missing 18 days of VPD data.", "Missing all dry/cure checkpoint data.", "No final quality score."],
  };
}

export function createConflictingSignalsReflectionContext(): GrowContext {
  const context = createRichPhotoperiodReflectionContext();
  return {
    ...context,
    grow_id: "grow-reflection-conflicting-001",
    name: "Sour Diesel Conflicting Signals Run",
    quality_scores: {
      ...context.quality_scores,
      overall: 8.1,
      smoothness: 7,
      notes: "Good yield, but smoke was less smooth than expected.",
    },
    events: [
      ...context.events,
      {
        id: "evt-defol-004",
        type: "training",
        occurred_at: "2026-03-31T18:00:00Z",
        summary: "User noted heavy week-4 defoliation; plants took 5 days to recover.",
        evidence: { recovery_lag_days: 5, user_note: "over-defoliated in week 4" },
      },
    ],
    user_notes: "Environment was stable, but I over-defoliated in week 4 and plants took 5 days to recover.",
    known_gaps: ["No side-by-side control plant for defoliation timing."],
  };
}

export function createPostHarvestHeavyReflectionContext(): GrowContext {
  const context = createRichPhotoperiodReflectionContext();
  return {
    ...context,
    grow_id: "grow-reflection-post-harvest-heavy-001",
    name: "Sour Diesel Fast Dry Recovery Run",
    post_harvest_outcomes: {
      harvest_weight_grams: 1410,
      final_dry_yield_grams: 360,
      weight_loss_curve: [
        { day: 0, date: "2026-04-28", weight_grams: 1410, loss_pct_from_harvest_start: 0 },
        { day: 1, date: "2026-04-29", weight_grams: 1156, loss_pct_from_previous: 18, loss_pct_from_harvest_start: 18 },
        { day: 4, date: "2026-05-02", weight_grams: 610, loss_pct_from_harvest_start: 56.7 },
        { day: 7, date: "2026-05-05", weight_grams: 365, loss_pct_from_harvest_start: 74.1 },
      ],
      cure_rh_curve: [
        { date: "2026-05-06", jar_rh_pct: 69, smell_note: "hay note present", burped: true },
        { date: "2026-05-10", jar_rh_pct: 64, smell_note: "hay fading", burped: true },
        { date: "2026-05-18", jar_rh_pct: 60, smell_note: "diesel aroma returning", burped: true },
      ],
      final_jar_rh_pct: 60,
      smell_progression_notes: ["Initial hay note after fast dry.", "Extended burping correlated with improved aroma by cure day 12."],
      flags_resolved: ["Initial hay smell improved after extended burping."],
    },
    quality_scores: {
      overall: 8.4,
      aroma: 8.0,
      smoothness: 8.2,
      flavor: 8.3,
      notes: "Fast dry hurt early aroma, but cure improved the final jar.",
    },
    known_gaps: ["No room-level airflow reading during first 48 hours of dry."],
  };
}
