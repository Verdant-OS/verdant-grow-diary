/**
 * diaryEntryEvidenceRefRules — Environment Check → Alert Evidence Ref
 * Population (#603).
 *
 * Pure helper. No I/O, no React, no Supabase, no fetch.
 *
 * Builds a safe `OriginatingTimelineEventRef[]` from an EXPLICIT
 * `diary_entries.id` that already lives on `SensorSnapshot.diary_evidence_ref`.
 * NEVER infers refs from:
 *  - alert timestamps
 *  - "nearest" diary rows
 *  - tent_id / plant_id / grow_id
 *  - metric names alone
 *  - alert reason text or any free prose
 *  - the alert id itself
 *
 * Distinct from {@link buildSensorSnapshotEvidenceRefs}: the resulting
 * ref uses `type: "diary_entry"` so diary ids never masquerade as
 * `sensor_readings` / `sensor_snapshot` rows. Never stores raw_payload,
 * note body, details JSON, tokens, or device-control fields.
 */
import {
  normalizeOriginatingTimelineEvents,
  type OriginatingTimelineEventRef,
} from "@/lib/originatingTimelineEventRules";
import { FORBIDDEN_REF_FIELDS } from "@/lib/originatingTimelineEventAdapter";

/** Narrow shape accepted by the helper. Extra fields are tolerated but the
 * presence of any {@link FORBIDDEN_REF_FIELDS} key rejects the entry. */
export interface DiaryEntryEvidenceInput {
  id?: unknown;
  entry_at?: unknown;
  /** Truth-bearing source label (env checks are `"manual"`). */
  source?: unknown;
}

/** Honest, deterministic label. No diagnosis. No certainty. */
export function buildDiaryEntryEvidenceLabel(): string {
  return "Environment check diary entry";
}

/** `unavailable`, empty, missing → not a truth-bearing source for a ref. */
const NON_TRUTH_SOURCES = new Set<string>(["unavailable", ""]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasForbiddenField(obj: Record<string, unknown>): boolean {
  for (const k of FORBIDDEN_REF_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

/**
 * Build at most one diary_entry ref from an EXPLICIT input. Returns `[]`
 * (never throws) when the input lacks a usable id/entry_at, carries a
 * forbidden field, or has no truth-bearing source.
 */
export function buildDiaryEntryEvidenceRefs(
  input: DiaryEntryEvidenceInput | null | undefined,
): OriginatingTimelineEventRef[] {
  try {
    if (!isPlainObject(input)) return [];
    if (hasForbiddenField(input as Record<string, unknown>)) return [];

    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!id) return [];

    const occurred_at = typeof input.entry_at === "string" ? input.entry_at.trim() : "";
    if (!occurred_at) return [];

    const rawSource = typeof input.source === "string" ? input.source.trim().toLowerCase() : "";
    if (NON_TRUTH_SOURCES.has(rawSource)) return [];

    // Route through the shared normalizer so source labels and sort/dedupe
    // semantics stay in lock-step with the persistence/adapter layer.
    // type is deliberately "diary_entry" — never "sensor_snapshot".
    return normalizeOriginatingTimelineEvents([
      {
        id,
        type: "diary_entry",
        occurred_at,
        source: rawSource,
      },
    ]);
  } catch {
    return [];
  }
}
