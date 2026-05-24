/**
 * plantTentMovementDisplayRules — pure helpers for surfacing the most
 * recent plant→tent movement event in Plant Detail.
 *
 * Source of truth: existing `diary_entries` rows tagged with
 * `details.kind === "plant_tent_move"` (see plantTentMovementRules.ts).
 * Falls back to a deterministic note prefix when older entries lack the
 * discriminator.
 *
 * Display-only. No I/O. No React. No new tables. Past entries are never
 * rewritten. No sensor_readings, alerts, or action_queue access.
 */
import { PLANT_TENT_MOVE_KIND } from "@/lib/plantTentMovementRules";

export interface PlantTentMovementDisplayRow {
  id: string;
  occurredAt: string | null;
  previousTentName: string | null;
  nextTentName: string | null;
  nextTentId: string | null;
  /** Deterministic, human-readable summary. */
  summary: string;
}

const MOVE_NOTE_PREFIX = /^Moved plant from /i;
const ASSIGN_NOTE_PREFIX = /^Assigned plant to /i;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function parseDetails(raw: unknown): Record<string, unknown> | null {
  const direct = asRecord(raw);
  if (direct) return direct;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * True when a diary row represents a plant→tent movement event.
 * Uses the structured discriminator first, then falls back to the
 * deterministic note prefix produced by formatPlantTentMovementNote.
 */
export function isPlantTentMovementEntry(raw: unknown): boolean {
  const row = asRecord(raw);
  if (!row) return false;
  const details = parseDetails(row.details);
  if (details && safeString(details.kind) === PLANT_TENT_MOVE_KIND) return true;
  const note = safeString(row.note);
  if (note && (MOVE_NOTE_PREFIX.test(note) || ASSIGN_NOTE_PREFIX.test(note))) {
    return true;
  }
  return false;
}

function pickOccurredAt(row: Record<string, unknown>): string | null {
  return (
    safeString(row.entry_at) ??
    safeString(row.created_at) ??
    safeString(row.inserted_at) ??
    null
  );
}

function toRow(raw: unknown): PlantTentMovementDisplayRow | null {
  const row = asRecord(raw);
  if (!row) return null;
  if (!isPlantTentMovementEntry(row)) return null;
  const details = parseDetails(row.details) ?? {};
  const previousTentName =
    safeString(details.previous_tent_name) ??
    safeString((details as Record<string, unknown>).previousTentName);
  const nextTentName =
    safeString(details.next_tent_name) ??
    safeString((details as Record<string, unknown>).nextTentName);
  const nextTentId =
    safeString(details.next_tent_id) ??
    safeString((details as Record<string, unknown>).nextTentId) ??
    safeString(row.tent_id);
  const id = safeString(row.id) ?? "";
  return {
    id,
    occurredAt: pickOccurredAt(row),
    previousTentName,
    nextTentName,
    nextTentId,
    summary: formatMovementSummary({
      previousTentName,
      nextTentName,
      noteFallback: safeString(row.note),
    }),
  };
}

export function formatMovementSummary(args: {
  previousTentName: string | null;
  nextTentName: string | null;
  noteFallback?: string | null;
}): string {
  const next = args.nextTentName?.trim();
  const prev = args.previousTentName?.trim();
  if (next && prev) return `Moved from ${prev} to ${next}`;
  if (next && !prev) return `Assigned to ${next}`;
  // Last resort: use the original note (already deterministic from the writer).
  const fallback = args.noteFallback?.trim();
  if (fallback) return fallback.replace(/\.$/, "");
  return "Plant moved";
}

/**
 * Returns the most recent plant→tent movement event from raw diary rows,
 * or null if none exist. Caller is responsible for scoping rows to the
 * target plant.
 */
export function findLatestPlantTentMovement(
  rawRows: readonly unknown[] | null | undefined,
): PlantTentMovementDisplayRow | null {
  if (!rawRows || rawRows.length === 0) return null;
  let best: PlantTentMovementDisplayRow | null = null;
  let bestEpoch = -Infinity;
  for (const r of rawRows) {
    const row = toRow(r);
    if (!row) continue;
    const epoch = row.occurredAt ? Date.parse(row.occurredAt) : NaN;
    const score = Number.isFinite(epoch) ? epoch : -Infinity;
    if (best === null || score > bestEpoch) {
      best = row;
      bestEpoch = score;
    }
  }
  return best;
}
