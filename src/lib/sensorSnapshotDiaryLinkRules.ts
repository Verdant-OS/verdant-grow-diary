/**
 * sensorSnapshotDiaryLinkRules — pure helper that links a SensorSnapshot
 * to already-supplied diary/timeline candidate items.
 *
 * Hard constraints:
 *   - No fetch. No Supabase. No I/O.
 *   - Match priority:
 *       1) exact sensor_snapshot_id match
 *       2) deterministic (tent_id + optional plant_id + occurredAt
 *          within tolerance) match
 *   - Ambiguous matches (>1 candidate after key filtering) yield NO
 *     link for that bucket — never guess.
 *   - Caller passes in candidates from already-loaded view models.
 */

export const DIARY_LINK_TOLERANCE_MS = 60 * 1000;
export const DIARY_LINK_EMPTY_LABEL =
  "No matching diary or timeline items found." as const;
export const DIARY_LINK_ATTEMPTED_FIELDS_LABEL =
  "Attempted match fields: snapshot_id, tent/plant, captured_at." as const;

export type DiaryLinkKind = "diary" | "timeline";

export interface DiaryTimelineCandidate {
  id: string;
  kind: DiaryLinkKind;
  href: string;
  tentId?: string | null;
  plantId?: string | null;
  occurredAt?: string | null;
  sensorSnapshotId?: string | null;
}

export interface SensorSnapshotLinkKey {
  snapshotId: string;
  tentId?: string | null;
  plantId?: string | null;
  capturedAt?: string | null;
}

export interface MatchedDiaryTimelineLink {
  id: string;
  kind: DiaryLinkKind;
  href: string;
  label: string;
  matchKind: "exact_id" | "deterministic_keys";
}

export interface MatchSnapshotDiaryLinksInput {
  snapshot: SensorSnapshotLinkKey;
  candidates: DiaryTimelineCandidate[];
  toleranceMs?: number;
}

export interface SnapshotDiaryLinkAttemptSummary {
  attemptedFields: readonly ["snapshot_id", "tent/plant", "captured_at"];
  attemptedFieldsLabel: typeof DIARY_LINK_ATTEMPTED_FIELDS_LABEL;
}

export function describeSnapshotDiaryLinkAttempt(): SnapshotDiaryLinkAttemptSummary {
  return {
    attemptedFields: ["snapshot_id", "tent/plant", "captured_at"],
    attemptedFieldsLabel: DIARY_LINK_ATTEMPTED_FIELDS_LABEL,
  };
}

function labelFor(kind: DiaryLinkKind): string {
  return kind === "diary" ? "View diary entry" : "View timeline item";
}

export function matchSnapshotDiaryLinks(
  input: MatchSnapshotDiaryLinksInput,
): MatchedDiaryTimelineLink[] {
  const { snapshot, candidates } = input;
  const tolerance = input.toleranceMs ?? DIARY_LINK_TOLERANCE_MS;

  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const out: MatchedDiaryTimelineLink[] = [];
  const byKind = new Map<DiaryLinkKind, DiaryTimelineCandidate[]>();
  for (const c of candidates) {
    if (!c || typeof c !== "object" || !c.id || !c.href || !c.kind) continue;
    const list = byKind.get(c.kind) ?? [];
    list.push(c);
    byKind.set(c.kind, list);
  }

  for (const [kind, list] of byKind) {
    // 1) exact id
    const exact = list.filter((c) => c.sensorSnapshotId === snapshot.snapshotId);
    if (exact.length === 1) {
      out.push({
        id: exact[0].id,
        kind,
        href: exact[0].href,
        label: labelFor(kind),
        matchKind: "exact_id",
      });
      continue;
    }
    if (exact.length > 1) continue; // ambiguous

    // 2) deterministic keys
    if (!snapshot.tentId || !snapshot.capturedAt) continue;
    const tEntry = Date.parse(snapshot.capturedAt);
    if (!Number.isFinite(tEntry)) continue;

    const matches = list.filter((c) => {
      if (!c.tentId || c.tentId !== snapshot.tentId) return false;
      if (snapshot.plantId && c.plantId && c.plantId !== snapshot.plantId) return false;
      if (!c.occurredAt) return false;
      const t = Date.parse(c.occurredAt);
      if (!Number.isFinite(t)) return false;
      return Math.abs(t - tEntry) <= tolerance;
    });

    if (matches.length === 1) {
      out.push({
        id: matches[0].id,
        kind,
        href: matches[0].href,
        label: labelFor(kind),
        matchKind: "deterministic_keys",
      });
    }
    // 0 or >1 → no link for this bucket
  }

  return out;
}
