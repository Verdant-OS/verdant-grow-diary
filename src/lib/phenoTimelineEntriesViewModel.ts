/**
 * phenoTimelineEntriesViewModel — pure view-model that renders pheno-hunt
 * records (sex observations, keeper decisions, reversals, crosses) as
 * timeline entries for a selected plant or hunt.
 *
 * Pure: no React, no Supabase, no I/O. Deterministic and null-safe.
 *
 * Hard rules (mirrors the rest of the pheno surface):
 *  - Grower-recorded only. Nothing here infers sex, decisions, or lineage.
 *  - Read-only presentation. No writes, no alerts, no Action Queue, no device.
 *  - A selfing / null-male cross renders "Self", never blank (via B4's
 *    crossDonorLabel + lineage badge).
 */
import { crossDonorLabel, crossLineageBadge } from "@/lib/phenoCrossFormViewModel";
import { reversalMethodLabel } from "@/lib/genetics/breedingReproductionRules";
import { keeperDecisionLabel, normalizeKeeperDecision } from "@/lib/phenoKeeperDecisionModel";

export type PhenoTimelineKind = "sex_observation" | "keeper_decision" | "reversal" | "cross";

export interface PhenoTimelineEntry {
  /** Stable id (the source row id), prefixed by kind to avoid collisions. */
  readonly id: string;
  readonly kind: PhenoTimelineKind;
  /** ISO timestamp the event occurred (grower-recorded), or null if unknown. */
  readonly occurredAt: string | null;
  readonly title: string;
  readonly detail: string | null;
  /** Short badge label (e.g. "Herm", "Keep", "STS", "S1 / Selfed"). */
  readonly badge: string | null;
}

/**
 * Minimal input row shapes — a subset of the service Row types. Each carries an
 * optional `createdAt`: the grower's explicit date (observed/decided/applied/
 * crossed_at) may be null, but the row always has a created_at, so a recorded
 * event still lands at its creation time on the timeline instead of "undated".
 */
export interface SexObservationInput {
  readonly id: string;
  readonly sex: string;
  readonly hermObserved?: boolean | null;
  /** Candidate this observation is for — disambiguates multi-candidate hunts. */
  readonly candidateLabel?: string | null;
  readonly note?: string | null;
  readonly observedAt?: string | null;
  readonly createdAt?: string | null;
}
export interface KeeperDecisionInput {
  readonly id: string;
  readonly decision: string;
  readonly candidateLabel?: string | null;
  readonly note?: string | null;
  readonly decidedAt?: string | null;
  readonly createdAt?: string | null;
}
export interface ReversalInput {
  readonly id: string;
  readonly keeperId: string;
  readonly method: string;
  readonly note?: string | null;
  readonly appliedAt?: string | null;
  readonly createdAt?: string | null;
}
export interface CrossInput {
  readonly id: string;
  readonly femaleKeeperId: string;
  readonly maleKeeperId: string | null;
  readonly crossType: string;
  /** F#/S#/BX# generation, when the way carries one — badge is wrong without it. */
  readonly generation?: number | null;
  /** Pollen route — a reversal channel on filial/backcross means feminized seed. */
  readonly channel?: string | null;
  readonly crossName?: string | null;
  readonly crossedAt?: string | null;
  readonly createdAt?: string | null;
}

export interface PhenoTimelineInput {
  readonly sexObservations?: ReadonlyArray<SexObservationInput>;
  readonly keeperDecisions?: ReadonlyArray<KeeperDecisionInput>;
  readonly reversals?: ReadonlyArray<ReversalInput>;
  readonly crosses?: ReadonlyArray<CrossInput>;
  /** Resolve a keeper id → display name (falls back to a safe placeholder). */
  readonly keeperName?: (keeperId: string) => string | null | undefined;
}

const SEX_LABEL: Record<string, string> = {
  female: "Female",
  male: "Male",
  hermaphrodite: "Hermaphrodite",
  unknown: "Unknown",
};

/** Resolved keeper name, or null when unknown/blank. */
function rawKeeperName(input: PhenoTimelineInput, id: string): string | null {
  const n = input.keeperName?.(id);
  return n && n.trim() !== "" ? n : null;
}
/** Keeper name with the standard placeholder (matches crossDonorLabel). */
function keeperNameOf(input: PhenoTimelineInput, id: string): string {
  return rawKeeperName(input, id) ?? "unknown keeper";
}

function sexEntry(o: SexObservationInput): PhenoTimelineEntry {
  const herm = o.hermObserved === true || o.sex === "hermaphrodite";
  const sexLabel = SEX_LABEL[o.sex] ?? o.sex ?? "Unknown";
  const who = o.candidateLabel && o.candidateLabel.trim() !== "" ? o.candidateLabel : null;
  const base = herm ? "Hermaphrodite traits observed" : `Sex recorded: ${sexLabel}`;
  return {
    id: `sex:${o.id}`,
    kind: "sex_observation",
    occurredAt: o.observedAt ?? o.createdAt ?? null,
    // Prefix with the candidate label so multi-candidate hunts aren't ambiguous.
    title: who ? `${who} — ${base}` : base,
    detail: o.note ?? null,
    badge: herm ? "Herm" : sexLabel,
  };
}

function decisionEntry(d: KeeperDecisionInput): PhenoTimelineEntry {
  // Canonical labels (incl. "Undecided") from the shared decision model.
  const label = keeperDecisionLabel(normalizeKeeperDecision(d.decision));
  const who = d.candidateLabel && d.candidateLabel.trim() !== "" ? d.candidateLabel : null;
  return {
    id: `decision:${d.id}`,
    kind: "keeper_decision",
    occurredAt: d.decidedAt ?? d.createdAt ?? null,
    title: who ? `Keeper decision — ${who}: ${label}` : `Keeper decision: ${label}`,
    detail: d.note ?? null,
    badge: label,
  };
}

function reversalEntry(input: PhenoTimelineInput, r: ReversalInput): PhenoTimelineEntry {
  return {
    id: `reversal:${r.id}`,
    kind: "reversal",
    occurredAt: r.appliedAt ?? r.createdAt ?? null,
    title: `Reversal applied — ${keeperNameOf(input, r.keeperId)}`,
    detail: r.note ?? null,
    badge: reversalMethodLabel(r.method),
  };
}

function crossEntry(input: PhenoTimelineInput, x: CrossInput): PhenoTimelineEntry {
  const female = keeperNameOf(input, x.femaleKeeperId);
  // Pass the RAW (nullable) donor name so crossDonorLabel applies its own
  // "unknown keeper" fallback — no double placeholder.
  const donor = crossDonorLabel(
    { maleKeeperId: x.maleKeeperId, crossType: x.crossType },
    x.maleKeeperId ? rawKeeperName(input, x.maleKeeperId) : null,
  );
  const name = x.crossName && x.crossName.trim() !== "" ? x.crossName : `${female} × ${donor}`;
  return {
    id: `cross:${x.id}`,
    kind: "cross",
    occurredAt: x.crossedAt ?? x.createdAt ?? null,
    title: `Cross recorded — ${name}`,
    detail: `♀ ${female} × ${donor}`,
    badge: crossLineageBadge(x.crossType, x.generation, x.channel),
  };
}

/**
 * Build the pheno timeline entries, most-recent first. Entries with a null
 * date sort to the end (undated), keeping a stable order otherwise.
 */
export function buildPhenoTimelineEntries(input: PhenoTimelineInput): PhenoTimelineEntry[] {
  const entries: PhenoTimelineEntry[] = [
    ...(input.sexObservations ?? []).map(sexEntry),
    ...(input.keeperDecisions ?? []).map(decisionEntry),
    ...(input.reversals ?? []).map((r) => reversalEntry(input, r)),
    ...(input.crosses ?? []).map((x) => crossEntry(input, x)),
  ];

  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const at = a.e.occurredAt;
      const bt = b.e.occurredAt;
      if (at && bt) {
        if (at !== bt) return at < bt ? 1 : -1; // ISO strings compare lexically; desc
        return a.i - b.i; // stable
      }
      if (at) return -1; // dated before undated
      if (bt) return 1;
      return a.i - b.i; // both undated → stable
    })
    .map(({ e }) => e);
}
