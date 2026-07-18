/**
 * Plant Memory Episode adapter — pure mapping from already-fetched rows to
 * episode inputs. No Supabase imports; no Date calls (callers inject now).
 *
 * Sensor truth: every sensor evidence item preserves source / captured_at /
 * tent / status / confidence. Historical readings are presented as time
 * windows ("recorded before/after the action"), never as current readings
 * and never as causal comparisons.
 *  - unknown provenance → status needs_review, never usable
 *  - demo → labeled demo, never usable evidence
 *  - future captured_at → invalid
 *  - cross-tent rows are handled (excluded + surfaced) by the rules layer
 */
import {
  buildPlantMemoryEpisode,
  classifyEvidenceWindow,
  comparePlantMemoryEpisodes,
  parseEpochMs,
  FUTURE_TIMESTAMP_SKEW_MS,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type EpisodePhotoEvidence,
  type EpisodeSensorEvidence,
  type PlantMemoryEpisode,
} from "@/lib/plantMemoryEpisodeRules";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";

/** Provenance labels this feature may show (existing project vocabulary). */
export const EPISODE_SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;

const KNOWN_REAL_SOURCES = new Set(["live", "manual", "csv"]);

export interface EpisodeSensorRowInput {
  readonly id: string;
  readonly tent_id: string | null;
  readonly plant_id?: string | null;
  readonly metric?: string | null;
  readonly source: string | null;
  readonly quality?: string | null;
  readonly captured_at: string | null;
  /** Opaque provenance envelope; inspected only by the shared diagnostic fence. */
  readonly raw_payload?: unknown;
}

/**
 * Classify one sensor row into episode evidence. Returns null when the row
 * falls outside every evidence window (excluded, not guessed).
 */
export function classifyEpisodeSensorRow(
  row: EpisodeSensorRowInput,
  args: { completedAtMs: number; nowMs: number },
): EpisodeSensorEvidence | null {
  const capturedMs = parseEpochMs(row.captured_at);
  if (capturedMs === null) return null;
  const window = classifyEvidenceWindow(capturedMs, args.completedAtMs);
  if (window === null) return null;

  const rawSource = (row.source ?? "").trim().toLowerCase();
  let source: string;
  let status: string;
  let usable: boolean;

  if (capturedMs > args.nowMs + FUTURE_TIMESTAMP_SKEW_MS) {
    source = "invalid";
    status = "invalid";
    usable = false;
  } else if (isDiagnosticSensorProvenanceRow(row)) {
    // Accepted transport is not the same as physical sensor evidence. Keep
    // Windows diagnostics visible only as demo-backed, non-usable context.
    source = "demo";
    status = "needs_review";
    usable = false;
  } else if (rawSource === "demo") {
    source = "demo";
    status = "needs_review";
    usable = false;
  } else if (KNOWN_REAL_SOURCES.has(rawSource)) {
    source = rawSource;
    status = "usable";
    usable = true;
  } else {
    // Unknown provenance is never presented as live.
    source = rawSource === "" ? "invalid" : rawSource;
    status = "needs_review";
    usable = false;
  }

  return {
    snapshotId: row.id,
    capturedAt: row.captured_at as string,
    tentId: row.tent_id,
    plantId: row.plant_id ?? null,
    source,
    status,
    confidence: row.quality ?? null,
    window,
    usable,
  };
}

/** Photo evidence from quicklog photo diary rows within the windows. */
export const EPISODE_PHOTO_EVENT_TYPE = "quicklog_photo_attachment" as const;

export function classifyEpisodePhotoRow(
  row: EpisodeDiaryRowInput,
  args: { completedAtMs: number },
): EpisodePhotoEvidence | null {
  if ((row.details?.event_type as string | undefined) !== EPISODE_PHOTO_EVENT_TYPE) return null;
  const capturedMs = parseEpochMs(row.entry_at);
  if (capturedMs === null) return null;
  const window = classifyEvidenceWindow(capturedMs, args.completedAtMs);
  if (window === null) return null;
  return { entryId: row.id, capturedAt: row.entry_at as string, window };
}

export interface BuildEpisodesArgs {
  readonly actions: readonly EpisodeActionInput[];
  readonly diaryRows: readonly EpisodeDiaryRowInput[];
  readonly sensorRows?: readonly EpisodeSensorRowInput[];
  /** Injected clock (ISO string or epoch ms). */
  readonly now: string | number;
}

/**
 * Build sorted episodes for a set of completed actions. Diary rows are
 * indexed once (no per-action scans); evidence is bucketed per action window.
 */
export function buildPlantMemoryEpisodes(args: BuildEpisodesArgs): PlantMemoryEpisode[] {
  const nowMs = typeof args.now === "number" ? args.now : (parseEpochMs(args.now) ?? 0);

  // Index linked rows by their explicit action reference once.
  const rowsByAction = new Map<string, EpisodeDiaryRowInput[]>();
  const photoRows: EpisodeDiaryRowInput[] = [];
  for (const row of args.diaryRows) {
    const eventType = row.details?.event_type;
    if (eventType === EPISODE_PHOTO_EVENT_TYPE) {
      photoRows.push(row);
      continue;
    }
    const actionId = row.details?.action_queue_id;
    if (typeof actionId !== "string" || actionId === "") continue;
    const bucket = rowsByAction.get(actionId);
    if (bucket) bucket.push(row);
    else rowsByAction.set(actionId, [row]);
  }

  const episodes: PlantMemoryEpisode[] = [];
  for (const action of args.actions) {
    const completedAtMs = parseEpochMs(action.completed_at);
    const sensorEvidence: EpisodeSensorEvidence[] = [];
    const photoEvidence: EpisodePhotoEvidence[] = [];
    if (completedAtMs !== null) {
      for (const row of args.sensorRows ?? []) {
        const item = classifyEpisodeSensorRow(row, { completedAtMs, nowMs });
        if (item) sensorEvidence.push(item);
      }
      for (const row of photoRows) {
        // Photos must belong to the same plant/tent scope when scoped rows exist.
        if (row.plant_id && action.plant_id && row.plant_id !== action.plant_id) continue;
        if (row.tent_id && action.tent_id && row.tent_id !== action.tent_id) continue;
        const item = classifyEpisodePhotoRow(row, { completedAtMs });
        if (item) photoEvidence.push(item);
      }
    }
    const episode = buildPlantMemoryEpisode({
      action,
      linkedRows: rowsByAction.get(action.id) ?? [],
      sensorEvidence,
      photoEvidence,
      now: args.now,
    });
    if (episode) episodes.push(episode);
  }
  episodes.sort(comparePlantMemoryEpisodes);
  return episodes;
}
