/**
 * quickLogTimelineDiaryDetailsMerge — pure read-only enrichment helpers.
 *
 * Attaches saved AI Doctor Phase 1 evidence details from `diary_entries`
 * onto the matching `grow_events`-derived `QuickLogActionEvent`, so the
 * timeline presenter can render the read-only Phase 1 evidence card.
 *
 * Matching is deterministic and narrow:
 *   - `details.kind === "ai_doctor_phase1_evidence"` (discriminator)
 *   - same `plant_id` (nullable, compared as string-or-empty)
 *   - same `tent_id` (nullable, compared as string-or-empty)
 *   - same normalized ISO timestamp (`entry_at` ↔ `occurredAt`)
 *
 * The `quicklog_save_manual` RPC writes both rows in the same transaction
 * with `v_occurred = COALESCE(p_occurred_at, now())`, so the timestamp
 * tuple is the natural insert-time key. Non-matching diary entries are
 * ignored. Malformed details are ignored. Action events are NOT mutated.
 *
 * Hard constraints:
 *  - Pure. No I/O, no Supabase, no React, no globals.
 *  - Never invents an evidence attachment for non-Phase-1 notes.
 *  - Never duplicates rows. Never re-orders rows.
 */
import type { QuickLogActionEvent } from "@/lib/quickLogTimelineGroupingViewModel";
import { AI_DOCTOR_PHASE1_TIMELINE_KIND } from "@/lib/aiDoctorPhase1TimelineDraft";

export interface RawDiaryEntryRow {
  id: string;
  plant_id: string | null;
  tent_id: string | null;
  grow_id: string | null;
  entry_at: string;
  details: unknown;
}

export interface AiDoctorPhase1DiaryEvidenceEntry {
  diaryEntryId: string;
  entryAt: string;
  plantId: string | null;
  tentId: string | null;
  growId: string | null;
  details: unknown;
}

export type AiDoctorPhase1EvidenceIndex = ReadonlyMap<
  string,
  AiDoctorPhase1DiaryEvidenceEntry
>;

function normalizeIso(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function indexKey(
  plantId: string | null | undefined,
  tentId: string | null | undefined,
  iso: string,
): string {
  return `${plantId ?? ""}|${tentId ?? ""}|${iso}`;
}

function isPhase1Details(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    (value as Record<string, unknown>).kind === AI_DOCTOR_PHASE1_TIMELINE_KIND
  );
}

/**
 * Pure: builds a deterministic Map keyed by `plant_id|tent_id|isoUTC`
 * containing only diary_entries whose `details.kind` matches the AI
 * Doctor Phase 1 discriminator. All other rows are filtered out. If
 * multiple rows collide on the same key, the first encountered wins
 * (input ordering is preserved by the caller).
 */
export function buildAiDoctorPhase1EvidenceIndex(
  diaryRows: ReadonlyArray<RawDiaryEntryRow> | null | undefined,
): AiDoctorPhase1EvidenceIndex {
  const map = new Map<string, AiDoctorPhase1DiaryEvidenceEntry>();
  if (!diaryRows) return map;
  for (const row of diaryRows) {
    if (!row || typeof row.id !== "string" || row.id.length === 0) continue;
    if (!isPhase1Details(row.details)) continue;
    const iso = normalizeIso(row.entry_at);
    if (!iso) continue;
    const key = indexKey(row.plant_id, row.tent_id, iso);
    if (map.has(key)) continue;
    map.set(key, {
      diaryEntryId: row.id,
      entryAt: iso,
      plantId: row.plant_id ?? null,
      tentId: row.tent_id ?? null,
      growId: row.grow_id ?? null,
      details: row.details,
    });
  }
  return map;
}

/**
 * Pure: returns a NEW array of action events with `aiDoctorPhase1Evidence`
 * attached on each event that matches an index entry. Input array and
 * input events are NOT mutated. Non-matching events are returned
 * unchanged (same object identity preserved when nothing is attached).
 * Ordering and length are preserved.
 */
export function attachAiDoctorPhase1EvidenceToActionEvents(
  actions: ReadonlyArray<QuickLogActionEvent>,
  index: AiDoctorPhase1EvidenceIndex,
): QuickLogActionEvent[] {
  if (!actions || actions.length === 0) return [];
  if (index.size === 0) return [...actions];
  const out: QuickLogActionEvent[] = [];
  for (const action of actions) {
    // Only `note` actions are eligible (Phase 1 evidence saves as a note).
    if (action.kind !== "note") {
      out.push(action);
      continue;
    }
    const iso = normalizeIso(action.occurredAt);
    if (!iso) {
      out.push(action);
      continue;
    }
    const match = index.get(indexKey(action.plantId, action.tentId, iso));
    if (!match) {
      out.push(action);
      continue;
    }
    out.push({
      ...action,
      aiDoctorPhase1Evidence: {
        diaryEntryId: match.diaryEntryId,
        entryAt: match.entryAt,
        plantId: match.plantId,
        tentId: match.tentId,
        growId: match.growId,
        details: match.details,
      },
    });
  }
  return out;
}
