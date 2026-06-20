/**
 * greenhouseRootZoneRules — pure, medium-aware root-zone interpretation.
 *
 * Contract:
 *  - Pure. No I/O, no React, no Supabase, no fetch, no timers, no
 *    automation, no device control.
 *  - Consumes resolved snapshot-like inputs only.
 *  - Medium-aware: coco / rockwool / hydro may use runoff-EC delta as a
 *    primary signal. Living soil (and peat-heavy organic mixes) MUST
 *    NOT use runoff EC as a primary health signal — runoff is unstable
 *    and over-reaction can damage microbiology.
 *  - Never recommends aggressive feed changes / flushes from weak
 *    evidence. Worst-case classification is "risk" with a reason — no
 *    action commands.
 *  - No `command`, `device_id`, `action_queue`, `control`, `relay`, or
 *    `execute` keys are ever emitted.
 */
import { normalizeGreenhouseSource, type GreenhouseSource } from "./greenhouseLightRules";

export type RootZoneMedium =
  | "coco"
  | "rockwool"
  | "hydro"
  | "living_soil"
  | "peat"
  | "soil";

const RUNOFF_EC_MEDIA: ReadonlySet<RootZoneMedium> = new Set<RootZoneMedium>([
  "coco",
  "rockwool",
  "hydro",
]);

const SOIL_LIKE_MEDIA: ReadonlySet<RootZoneMedium> = new Set<RootZoneMedium>([
  "living_soil",
  "peat",
  "soil",
]);

function normalizeMedium(input: unknown): RootZoneMedium | null {
  if (typeof input !== "string") return null;
  const k = input.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (
    k === "coco" ||
    k === "rockwool" ||
    k === "hydro" ||
    k === "living_soil" ||
    k === "peat" ||
    k === "soil"
  ) {
    return k as RootZoneMedium;
  }
  return null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export interface RootZoneEcInput {
  medium: unknown;
  /** Feed (input) EC in mS/cm. */
  feedEcMscm?: number | null;
  /** Runoff EC in mS/cm. */
  runoffEcMscm?: number | null;
  /** Source of the underlying reading — normalized here. */
  source?: unknown;
}

export type RootZoneStatus = "unknown" | "ok" | "review" | "risk";

export interface RootZoneEcResult {
  status: RootZoneStatus;
  medium: RootZoneMedium | null;
  source: GreenhouseSource;
  /** True iff runoff-EC delta was the basis of classification. */
  deltaUsed: boolean;
  /** Delta = runoff - feed (mS/cm), when both present. */
  deltaMscm: number | null;
  /** Human-readable reason; suitable for review copy. */
  reason: string;
  /** Conservative inspection-only guidance, never an executable command. */
  guidance: string;
}

const NEVER: string =
  "no_action_command_emitted_grower_must_inspect_before_changing_feed";

/**
 * Assess root-zone EC in a medium-aware way.
 *
 *  - coco / rockwool / hydro: classify via runoff − feed delta.
 *  - living_soil / peat / soil: runoff EC is NOT a primary health
 *    signal; returns "unknown" with explanatory reason, even when
 *    runoff EC is present.
 *  - Unknown medium → "unknown".
 *  - stale/invalid source → "unknown".
 *  - Never returns an aggressive "flush" or "change feed" action.
 */
export function assessRootZoneEc(input: RootZoneEcInput): RootZoneEcResult {
  const source = normalizeGreenhouseSource(input?.source);
  const medium = normalizeMedium(input?.medium);
  const feed = input?.feedEcMscm;
  const runoff = input?.runoffEcMscm;
  const delta =
    isFiniteNumber(feed) && isFiniteNumber(runoff) ? runoff - feed : null;

  if (source === "stale" || source === "invalid") {
    return {
      status: "unknown",
      medium,
      source,
      deltaUsed: false,
      deltaMscm: delta,
      reason: "source_not_healthy_cannot_assess_root_zone",
      guidance: NEVER,
    };
  }

  if (!medium) {
    return {
      status: "unknown",
      medium: null,
      source,
      deltaUsed: false,
      deltaMscm: delta,
      reason: "unknown_medium_root_zone_assessment_skipped",
      guidance: NEVER,
    };
  }

  if (SOIL_LIKE_MEDIA.has(medium)) {
    return {
      status: "unknown",
      medium,
      source,
      deltaUsed: false,
      deltaMscm: delta,
      reason:
        "runoff_ec_is_not_a_primary_health_signal_for_living_soil_or_peat",
      guidance: NEVER,
    };
  }

  if (!RUNOFF_EC_MEDIA.has(medium)) {
    return {
      status: "unknown",
      medium,
      source,
      deltaUsed: false,
      deltaMscm: delta,
      reason: "medium_not_supported_for_runoff_ec_assessment",
      guidance: NEVER,
    };
  }

  // From here on: coco / rockwool / hydro.
  if (delta === null) {
    return {
      status: "unknown",
      medium,
      source,
      deltaUsed: false,
      deltaMscm: null,
      reason: "feed_or_runoff_ec_missing_cannot_compute_delta",
      guidance: NEVER,
    };
  }

  // Conservative bands (mS/cm). Values outside push to "review" first,
  // then "risk" only when clearly off. No aggressive flushes/feed
  // changes emitted regardless.
  const abs = Math.abs(delta);
  if (abs <= 0.3) {
    return {
      status: "ok",
      medium,
      source,
      deltaUsed: true,
      deltaMscm: round1(delta),
      reason: "runoff_ec_close_to_feed_ec",
      guidance: NEVER,
    };
  }
  if (abs <= 0.8) {
    return {
      status: "review",
      medium,
      source,
      deltaUsed: true,
      deltaMscm: round1(delta),
      reason:
        delta > 0
          ? "runoff_ec_higher_than_feed_review_for_salt_accumulation"
          : "runoff_ec_lower_than_feed_review_for_uptake_or_dilution",
      guidance: NEVER,
    };
  }
  return {
    status: "risk",
    medium,
    source,
    deltaUsed: true,
    deltaMscm: round1(delta),
    reason:
      delta > 0
        ? "runoff_ec_far_above_feed_inspect_root_zone_before_acting"
        : "runoff_ec_far_below_feed_inspect_root_zone_before_acting",
    guidance: NEVER,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
