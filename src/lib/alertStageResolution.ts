/**
 * alertStageResolution — resolve the stage that alert/threshold surfaces
 * evaluate VPD / temperature / humidity targets against.
 *
 * Why this exists (live audit, bug #14): the Alerts surface resolved its
 * "Alert context: Using <stage> targets" header and its alert persistence
 * from `grows.stage` alone, while every environment surface rendering the
 * SAME tent readings (Dashboard Environment Snapshot, Tent Detail, Sensors)
 * uses `tents.stage`. The two columns are written by different flows —
 * Quick Log writes `grows.stage` only when the grower touches the stage
 * select; Edit Tent writes `tents.stage`; both rows start at the "seedling"
 * creation default — so either column can lag the other, and the Alerts
 * surface claimed "Seedling targets" for a grow the grower had already
 * advanced to Vegetative.
 *
 * PRECEDENCE (explicit, deterministic):
 *  1. Every value is classified with the live `normalizeVpdStage` alias
 *     table (the same normalizer the downstream classifiers use, covering
 *     legacy tokens like "Vegetative", "transition", "bloom", "flush",
 *     "curing"); values it cannot recognize drop out.
 *  2. The grow row contributes its recognized stage as one candidate.
 *  3. The tents contribute at most ONE candidate, by CONSENSUS: when every
 *     recognized tent stage normalizes to the same stage, that stage is the
 *     tent candidate; when recognized tent stages disagree with each other,
 *     the tents abstain. (A grow running tents at mixed stages has no
 *     single tent truth — the grow row's declared stage governs, exactly
 *     as it did before this helper existed. Callers classifying a reading
 *     from one specific tent should pass only that tent's stage — the
 *     scoped Dashboard passes the snapshot-selection tents.)
 *  4. HARVEST CAP: a tent-sourced candidate that normalizes to "harvest"
 *     (incl. drying/cure/curing) is ignored while the grow row holds a
 *     recognized pre-harvest stage. Tents reach harvest/cure and then get
 *     reused — GrowLineageRepair repoints `tents.grow_id` without touching
 *     the stage — and harvest bands are null/context-only, so letting a
 *     leftover harvest tent outrank an actively-staged grow row would
 *     silently switch every stage-band alert off for a live grow. Closing
 *     out a grow's alerting is the grow row's call. (When the grow stage
 *     is unknown, an agreeing harvest tent stands — it is the only signal.)
 *  5. Between the grow candidate and the tent candidate, the MOST ADVANCED
 *     stage in progression order wins (seedling → veg → preflower →
 *     flower → late_flower → harvest): a trailing value is a stale
 *     leftover the grower stopped updating (tents and grows both start at
 *     the "seedling" creation default; Quick Log writes `grows.stage` only
 *     when the stage select is touched, Edit Tent writes `tents.stage`).
 *     The grow wins rank ties, preserving its historical primacy.
 *  6. The winner is returned as the field's RAW stored value, not the
 *     normalized token, so downstream consumers (`classifyVpdAgainstStage`,
 *     `classifyTempAgainstStage`, header copy) receive exactly the string
 *     they would have received before this helper and keep their own alias
 *     handling.
 *  7. When no candidate is recognized the result is null — callers keep
 *     their existing "no active stage target" handling. Never guess. (This
 *     is stricter than the old raw passthrough only for garbage values the
 *     classifiers already treated as stage-unknown; the header now says
 *     "no active stage" instead of echoing the garbage token.)
 *
 * Net contract: tent stages can RESCUE a stale-trailing grow row (the
 * audited bug), but can never silently regress an actively-staged grow to
 * harvest/context-only, and never override the grow row in a mixed-stage
 * layout. Every path where the tents are ignored behaves exactly like the
 * pre-resolver code (grow row governs).
 *
 * Pure: no I/O, no React, no Supabase, no time.
 */
import { normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

/** Stage progression rank. `unknown` is not a candidate and has no rank. */
const STAGE_PROGRESSION: readonly Exclude<VpdStage, "unknown">[] = [
  "seedling",
  "veg",
  "preflower",
  "flower",
  "late_flower",
  "harvest",
];

function progressionRank(stage: VpdStage): number {
  return STAGE_PROGRESSION.indexOf(stage as Exclude<VpdStage, "unknown">);
}

export interface ResolveAlertContextStageInput {
  /** The grow row's stage (raw stored value; unknown text tolerated). */
  growStage?: unknown;
  /** The grow's tents' stages (raw stored values; unknowns drop out). */
  tentStages?: ReadonlyArray<unknown> | null;
}

export interface ResolvedAlertContextStage {
  /** RAW stored value of the winning field, or null when none recognized. */
  stage: string | null;
  /** The winner classified via `normalizeVpdStage`; "unknown" only when
   * `stage` is null. */
  normalizedStage: VpdStage;
  /** Which field supplied the winning stage. "grow" also covers ties. */
  source: "grow" | "tent" | null;
}

function asRawStage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveAlertContextStage(
  input: ResolveAlertContextStageInput,
): ResolvedAlertContextStage {
  const growRaw = asRawStage(input.growStage);
  const growNormalized = growRaw ? normalizeVpdStage(growRaw) : "unknown";
  const growKnown = growNormalized !== "unknown";

  // Tent CONSENSUS candidate: all recognized tent stages must normalize to
  // the same stage; disagreement means the tents abstain (rule 3).
  let tentRaw: string | null = null;
  let tentNormalized: VpdStage = "unknown";
  for (const candidate of input.tentStages ?? []) {
    const raw = asRawStage(candidate);
    if (!raw) continue;
    const normalized = normalizeVpdStage(raw);
    if (normalized === "unknown") continue;
    if (tentNormalized === "unknown") {
      tentRaw = raw;
      tentNormalized = normalized;
    } else if (normalized !== tentNormalized) {
      tentRaw = null;
      tentNormalized = "unknown";
      break;
    }
  }

  // HARVEST CAP (rule 4): a leftover harvest/cure tent must not switch an
  // actively-staged grow's alerting off.
  if (tentNormalized === "harvest" && growKnown && growNormalized !== "harvest") {
    tentRaw = null;
    tentNormalized = "unknown";
  }

  // Most advanced wins; grow wins ties (rule 5). An unknown grow ranks
  // below every recognized stage, so a lone tent consensus stands.
  if (
    tentRaw !== null &&
    progressionRank(tentNormalized) > (growKnown ? progressionRank(growNormalized) : -1)
  ) {
    return { stage: tentRaw, normalizedStage: tentNormalized, source: "tent" };
  }
  if (growKnown) {
    return { stage: growRaw, normalizedStage: growNormalized, source: "grow" };
  }
  return { stage: null, normalizedStage: "unknown", source: null };
}
