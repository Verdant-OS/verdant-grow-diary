/**
 * One-Tent Loop Golden Path fixture — deterministic single-grow,
 * single-tent, single-plant scenario used to walk the entire Verdant
 * operating loop in one stitched regression test.
 *
 * Contract:
 *  - Pure data. No I/O, no Supabase, no crypto.
 *  - Every timestamp is derived from `GOLDEN_NOW`, never `Date.now()`.
 *  - All sensor telemetry is `source: "manual"` and clearly labeled.
 *    Nothing here may be represented as live in downstream tests.
 *  - No demo tokens, service-role values, signed URLs, or PII.
 *
 * The fixture is intentionally lean — new stages can add slices, but
 * must preserve determinism and source honesty.
 */

/** Fixed "now" anchor for the entire golden path. */
export const ONE_TENT_GOLDEN_NOW = new Date("2026-07-11T14:00:00Z");

/** Stable owner id — never a real user id. */
export const ONE_TENT_GOLDEN_USER_ID = "golden-user-0000-4000-8000-000000000001";
/** A different user id used only for cross-user isolation assertions. */
export const ONE_TENT_OTHER_USER_ID = "golden-user-0000-4000-8000-000000000002";

const minutesAgo = (m: number): string =>
  new Date(ONE_TENT_GOLDEN_NOW.getTime() - m * 60_000).toISOString();

export interface GoldenGrow {
  id: string;
  user_id: string;
  name: string;
  started_at: string;
}
export interface GoldenTent {
  id: string;
  user_id: string;
  grow_id: string;
  name: string;
}
export interface GoldenPlant {
  id: string;
  user_id: string;
  grow_id: string;
  tent_id: string;
  name: string;
  stage: "seedling" | "vegetation" | "flower" | "harvest";
}
export interface GoldenQuickLog {
  id: string;
  user_id: string;
  plant_id: string;
  tent_id: string;
  grow_id: string;
  event_type: "observation";
  note: string;
  occurred_at: string;
  idempotency_key: string;
}
export type GoldenSensorSource =
  | "live"
  | "manual"
  | "csv"
  | "demo"
  | "stale"
  | "invalid";
export interface GoldenSensorSnapshot {
  id: string;
  user_id: string;
  tent_id: string;
  plant_id: string | null;
  source: GoldenSensorSource;
  captured_at: string;
  confidence: "low" | "medium" | "high";
  air_temp_f: number;
  humidity_pct: number;
  vpd_kpa: number;
  raw_payload: {
    entered_by: "grower";
    unit_system: "imperial";
  };
}
export interface GoldenGrowTargets {
  grow_id: string;
  tent_id: string;
  air_temp_f_max: number;
  humidity_pct_min: number;
  humidity_pct_max: number;
  vpd_kpa_max: number;
}

export const ONE_TENT_GOLDEN_GROW: GoldenGrow = Object.freeze({
  id: "golden-grow-0001",
  user_id: ONE_TENT_GOLDEN_USER_ID,
  name: "One-Tent Golden Run",
  started_at: minutesAgo(60 * 24 * 40), // 40 days in
});

export const ONE_TENT_GOLDEN_TENT: GoldenTent = Object.freeze({
  id: "golden-tent-0001",
  user_id: ONE_TENT_GOLDEN_USER_ID,
  grow_id: ONE_TENT_GOLDEN_GROW.id,
  name: "Flower Tent A",
});

export const ONE_TENT_GOLDEN_PLANT: GoldenPlant = Object.freeze({
  id: "golden-plant-0001",
  user_id: ONE_TENT_GOLDEN_USER_ID,
  grow_id: ONE_TENT_GOLDEN_GROW.id,
  tent_id: ONE_TENT_GOLDEN_TENT.id,
  name: "Golden Plant 1",
  stage: "flower",
});

export const ONE_TENT_GOLDEN_QUICK_LOG_NOTE =
  "Observed mild leaf-edge curl after a warm afternoon.";

export const ONE_TENT_GOLDEN_QUICK_LOG: GoldenQuickLog = Object.freeze({
  id: "golden-log-0001",
  user_id: ONE_TENT_GOLDEN_USER_ID,
  plant_id: ONE_TENT_GOLDEN_PLANT.id,
  tent_id: ONE_TENT_GOLDEN_TENT.id,
  grow_id: ONE_TENT_GOLDEN_GROW.id,
  event_type: "observation",
  note: ONE_TENT_GOLDEN_QUICK_LOG_NOTE,
  occurred_at: minutesAgo(5),
  // Deterministic: same submission == same key == same row (idempotency).
  idempotency_key:
    "golden-idem-plant-0001-observation-2026-07-11T13:55:00Z",
});

export const ONE_TENT_GOLDEN_SNAPSHOT: GoldenSensorSnapshot = Object.freeze({
  id: "golden-snap-0001",
  user_id: ONE_TENT_GOLDEN_USER_ID,
  tent_id: ONE_TENT_GOLDEN_TENT.id,
  plant_id: ONE_TENT_GOLDEN_PLANT.id,
  source: "manual",
  captured_at: minutesAgo(3),
  confidence: "medium",
  air_temp_f: 82,
  humidity_pct: 48,
  vpd_kpa: 1.65,
  raw_payload: { entered_by: "grower", unit_system: "imperial" },
});

/**
 * Grower-owned targets. The golden-path test may adjust ONE field of a
 * *copy* of this record to force a deterministic alert breach — it must
 * never mutate this frozen source of truth.
 */
export const ONE_TENT_GOLDEN_TARGETS: GoldenGrowTargets = Object.freeze({
  grow_id: ONE_TENT_GOLDEN_GROW.id,
  tent_id: ONE_TENT_GOLDEN_TENT.id,
  air_temp_f_max: 85,
  humidity_pct_min: 40,
  humidity_pct_max: 60,
  vpd_kpa_max: 1.6, // snapshot 1.65 breaches this — deterministic alert
});

/** Snapshot from another user; must never appear in the golden path. */
export const ONE_TENT_OTHER_USER_SNAPSHOT: GoldenSensorSnapshot = Object.freeze({
  id: "other-snap-9999",
  user_id: ONE_TENT_OTHER_USER_ID,
  tent_id: "other-tent-9999",
  plant_id: "other-plant-9999",
  source: "manual",
  captured_at: minutesAgo(1),
  confidence: "medium",
  air_temp_f: 999,
  humidity_pct: 99,
  vpd_kpa: 9.99,
  raw_payload: { entered_by: "grower", unit_system: "imperial" },
});
