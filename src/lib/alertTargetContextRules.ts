/**
 * Pure helper that derives grower-facing tent/plant target copy for an alert.
 *
 * Strict constraints:
 *   - No I/O. No Supabase. No React. No AI. No automation. No device control.
 *   - No alert writes. No Action Queue writes.
 *   - Never returns a raw UUID as a visible label.
 *   - Missing tent/plant is fail-closed copy, never a silent blank.
 *
 * Id resolution (read-path only, never a SQL backfill):
 *   1. alert.tent_id / plant_id when present
 *   2. unambiguous linked diary / sensor_snapshot tent/plant fields
 *   3. optional sole-tent grow fallback (exactly one tent — same rule as
 *      Grow Detail's One-Tent Loop handoff). Never a sole-plant guess.
 */
import { looksLikeUuid } from "@/lib/growDisplayLabel";
import { pickSoleLoadedId } from "@/lib/oneTentLoopHandoffIds";
import type { OriginatingTimelineEventRef } from "@/lib/originatingTimelineEventRules";

export const ALERT_TARGET_PREFIX = "Target:";

export const ALERT_TARGET_UNAVAILABLE_TEXT = "Target tent and plant unavailable for this alert.";

export const ALERT_TARGET_LOADING_TEXT = "Loading tent and plant names…";

export const ALERT_TARGET_NAME_UNAVAILABLE_LABEL = "Name unavailable";

export type AlertTargetKind = "located" | "unavailable" | "names_unavailable" | "loading";

export interface AlertTargetContext {
  kind: AlertTargetKind;
  tentId: string | null;
  plantId: string | null;
  tentLabel: string | null;
  plantLabel: string | null;
  /** Compact one-line copy, never empty. */
  text: string;
}

function trimId(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Visible entity label. Blank, missing, and UUID-shaped strings collapse to
 * null so growers never see an internal id as the "name".
 */
export function sanitizeAlertTargetLabel(name: string | null | undefined): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (looksLikeUuid(trimmed)) return null;
  return trimmed;
}

function fieldLabel(kind: "Tent" | "Plant", name: string | null): string {
  return `${kind}: ${name ?? ALERT_TARGET_NAME_UNAVAILABLE_LABEL}`;
}

export interface LinkedAlertTargetEvidence {
  tentId?: string | null;
  plantId?: string | null;
}

export type AlertTargetIdSource = "alert" | "linked_evidence" | "single_tent" | "none";

export interface ResolvedAlertTargetIds {
  tentId: string | null;
  plantId: string | null;
  tentSource: AlertTargetIdSource;
  plantSource: AlertTargetIdSource;
}

/**
 * Linked evidence types that may contribute tent/plant ids. Other
 * originating-ref types are ignored so a photo or action id cannot
 * impersonate a snapshot row.
 */
const LINKED_EVIDENCE_LOOKUP_TYPES = new Set([
  "sensor_snapshot",
  "diary_entry",
  "manual_sensor_snapshot",
]);

export function trimAlertTargetId(id: string | null | undefined): string | null {
  return trimId(id);
}

/**
 * Resolve grower-facing tent/plant ids without writing the alert row.
 *
 * Conflicting linked tent (or plant) ids fail closed for that field —
 * never pick a winner. Sole-tent fallback is tent-only.
 */
export function resolveAlertTargetIds(input: {
  tentId?: string | null;
  plantId?: string | null;
  linkedEvidence?: readonly LinkedAlertTargetEvidence[] | null;
  singleTentId?: string | null;
}): ResolvedAlertTargetIds {
  const alertTent = trimId(input.tentId);
  const alertPlant = trimId(input.plantId);
  const evidence = Array.isArray(input.linkedEvidence) ? input.linkedEvidence : [];
  const evidenceTent = pickSoleLoadedId(evidence.map((row) => row.tentId));
  const evidencePlant = pickSoleLoadedId(evidence.map((row) => row.plantId));
  const hasAmbiguousEvidenceTent = evidence.some((row) => trimId(row.tentId)) && !evidenceTent;
  const soleTent = hasAmbiguousEvidenceTent ? null : trimId(input.singleTentId);

  const tentId = alertTent ?? evidenceTent ?? soleTent;
  const plantId = alertPlant ?? evidencePlant;

  return {
    tentId,
    plantId,
    tentSource: alertTent
      ? "alert"
      : evidenceTent
        ? "linked_evidence"
        : tentId && soleTent
          ? "single_tent"
          : "none",
    plantSource: alertPlant ? "alert" : evidencePlant ? "linked_evidence" : "none",
  };
}

/** Ids from originating timeline refs that may be looked up on read. */
export function linkedEvidenceLookupIds(
  refs: readonly OriginatingTimelineEventRef[] | null | undefined,
): string[] {
  if (!Array.isArray(refs)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const type = typeof ref.type === "string" ? ref.type.trim().toLowerCase() : "";
    if (!LINKED_EVIDENCE_LOOKUP_TYPES.has(type)) continue;
    const id = trimId(ref.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function linkedEvidenceForRefIds(
  lookupIds: readonly string[],
  rowsById: ReadonlyMap<string, LinkedAlertTargetEvidence>,
): LinkedAlertTargetEvidence[] {
  const out: LinkedAlertTargetEvidence[] = [];
  for (const id of lookupIds) {
    const row = rowsById.get(id);
    if (!row) continue;
    out.push({ tentId: trimId(row.tentId), plantId: trimId(row.plantId) });
  }
  return out;
}

export interface AlertTargetContextInput {
  tentId?: string | null;
  plantId?: string | null;
  tentName?: string | null;
  plantName?: string | null;
  namesLoading?: boolean;
  /** True while linked snapshot/diary ids are still being read. */
  idsLoading?: boolean;
  linkedEvidence?: readonly LinkedAlertTargetEvidence[] | null;
  /** Exactly-one-tent grow fallback. Ignored when more than one tent exists. */
  singleTentId?: string | null;
}

/**
 * Derive tent/plant target context for list and detail surfaces.
 *
 * - No tent_id and no plant_id (after evidence/sole-tent resolution) →
 *   unavailable copy.
 * - Column ids missing while linked evidence is still loading → loading
 *   copy (not a false unavailable flash, and not a premature sole-tent).
 * - Ids present while names are still loading → loading copy.
 * - Ids present with resolved names → "Tent: … · Plant: …".
 * - Ids present but names missing/UUID → per-field "Name unavailable".
 */
export function deriveAlertTargetContext(input: AlertTargetContextInput): AlertTargetContext {
  const columnTent = trimId(input.tentId);
  const columnPlant = trimId(input.plantId);
  if (!columnTent && !columnPlant && input.idsLoading) {
    return {
      kind: "loading",
      tentId: null,
      plantId: null,
      tentLabel: null,
      plantLabel: null,
      text: ALERT_TARGET_LOADING_TEXT,
    };
  }

  const resolved = resolveAlertTargetIds(input);
  const tentId = resolved.tentId;
  const plantId = resolved.plantId;
  const tentLabel = tentId ? sanitizeAlertTargetLabel(input.tentName) : null;
  const plantLabel = plantId ? sanitizeAlertTargetLabel(input.plantName) : null;

  if (!tentId && !plantId) {
    return {
      kind: "unavailable",
      tentId: null,
      plantId: null,
      tentLabel: null,
      plantLabel: null,
      text: ALERT_TARGET_UNAVAILABLE_TEXT,
    };
  }

  if (input.namesLoading && !tentLabel && !plantLabel) {
    return {
      kind: "loading",
      tentId,
      plantId,
      tentLabel: null,
      plantLabel: null,
      text: ALERT_TARGET_LOADING_TEXT,
    };
  }

  const parts: string[] = [];
  if (tentId) parts.push(fieldLabel("Tent", tentLabel));
  if (plantId) parts.push(fieldLabel("Plant", plantLabel));
  const anyNamed = Boolean(tentLabel || plantLabel);

  return {
    kind: anyNamed ? "located" : "names_unavailable",
    tentId,
    plantId,
    tentLabel,
    plantLabel,
    text: parts.join(" · "),
  };
}

export function mergeLinkedEvidenceLookupRow(
  current: LinkedAlertTargetEvidence | undefined,
  next: LinkedAlertTargetEvidence,
): LinkedAlertTargetEvidence {
  const tentId = pickSoleLoadedId([current?.tentId, next.tentId]);
  const plantId = pickSoleLoadedId([current?.plantId, next.plantId]);
  return { tentId, plantId };
}

export function buildAlertTargetPresenterInput(input: {
  tentId?: string | null;
  plantId?: string | null;
  growId?: string | null;
  tentNameById: ReadonlyMap<string, string>;
  plantNameById: ReadonlyMap<string, string>;
  linkedEvidence?: readonly LinkedAlertTargetEvidence[] | null;
  singleTentIdByGrowId?: ReadonlyMap<string, string>;
  namesLoading?: boolean;
  idsLoading?: boolean;
}): AlertTargetContextInput {
  const growId = trimId(input.growId);
  const singleTentId = growId ? (input.singleTentIdByGrowId?.get(growId) ?? null) : null;
  const idsLoading = Boolean(input.idsLoading);
  const resolved = resolveAlertTargetIds({
    tentId: input.tentId,
    plantId: input.plantId,
    linkedEvidence: idsLoading ? [] : input.linkedEvidence,
    singleTentId: idsLoading ? null : singleTentId,
  });
  return {
    tentId: resolved.tentId ?? input.tentId,
    plantId: resolved.plantId ?? input.plantId,
    tentName: resolved.tentId ? (input.tentNameById.get(resolved.tentId) ?? null) : null,
    plantName: resolved.plantId ? (input.plantNameById.get(resolved.plantId) ?? null) : null,
    namesLoading: input.namesLoading,
    idsLoading,
    linkedEvidence: idsLoading ? [] : input.linkedEvidence,
    singleTentId: idsLoading ? null : singleTentId,
  };
}
