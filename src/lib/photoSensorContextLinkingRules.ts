/**
 * photoSensorContextLinkingRules — pure, deterministic resolver that
 * links a Quick Log Photo event to the closest already-loaded sensor
 * snapshot, WITHOUT implying diagnosis or causation.
 *
 * Hard constraints:
 *   - Pure. No I/O, no fetch, no React, no Supabase, no Action Queue,
 *     no AI / model calls, no device control, no automation.
 *   - Never mutates inputs.
 *   - Never fabricates snapshots. Untrusted/empty input → { kind: "none" }.
 *   - Never re-classifies sources. CSV stays "csv". Manual stays "manual".
 *     Stale/invalid/demo/unknown is surfaced through the existing
 *     `sensorSnapshotFreshnessRules` resolver at the presenter boundary —
 *     this helper just picks the candidate.
 *   - Never asserts causation between the photo and the chosen snapshot.
 *   - Tie-breaker: equal absolute distance → earlier captured_at wins.
 *
 * Inputs:
 *   - photo: { id, capturedAtIso, attachedSnapshot? }
 *   - candidates: already-loaded sensor snapshots (each must have a
 *     parseable `captured_at` / `capturedAtIso`). No fetch is performed.
 *   - options: { maxWindowMs }
 *
 * Output (discriminated union):
 *   - { kind: "attached", snapshot, source: "attached" }
 *   - { kind: "nearest", snapshot, deltaMs, direction: "before"|"after"|"same",
 *       source: "nearest" }
 *   - { kind: "none", reason }
 */

/** Photo log badge labels. Never claim diagnosis or AI inference. */
export const PHOTO_LOG_BADGE_LABEL = "Photo log" as const;
export const PHOTO_LOG_BADGE_SUBLABEL = "Visual record only" as const;
export const PHOTO_LOG_NON_AI_BADGE_LABEL = "Non-AI evidence" as const;

/** Section heading for the linked sensor context. */
export const NEAREST_CONTEXT_HEADING = "Nearest sensor context" as const;

/** Non-diagnostic guard copy rendered alongside any linked context. */
export const NEAREST_CONTEXT_NON_DIAGNOSTIC_COPY =
  "Context only — not a diagnosis. Do not infer cause from photo alone." as const;

/** Empty-state copy when no nearby snapshot is available. */
export const NO_NEAREBY_CONTEXT_COPY =
  "No nearby sensor snapshot available for this photo." as const;
export const FUTURE_LOGS_HINT_COPY =
  "Future logs will show source, captured_at, age, and redacted metrics when a snapshot is attached." as const;

/** Default search window: 6 hours either side of the photo timestamp. */
export const DEFAULT_NEAREST_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Minimal snapshot shape this helper needs. We deliberately do NOT type
 * `raw_payload` or any secret-bearing fields — presenters route the
 * winner through `resolveSensorSnapshotDisplay` which performs the
 * redaction.
 */
export interface PhotoContextCandidateSnapshot {
  /** Stable id for tie-breakers and React keys. */
  id?: string | null;
  captured_at?: string | number | null;
  capturedAtIso?: string | null;
  source?: string | null;
  // Arbitrary additional metric fields are tolerated and passed through
  // untouched. Presenters MUST redact before rendering.
  [key: string]: unknown;
}

export interface PhotoEventForContext {
  id: string;
  /** ISO timestamp the photo was logged. */
  capturedAtIso: string;
  /** Optional pre-attached snapshot from the diary entry itself. */
  attachedSnapshot?: PhotoContextCandidateSnapshot | null;
}

export interface PhotoSensorContextOptions {
  /** Maximum absolute distance to consider a candidate. */
  maxWindowMs?: number;
}

export type PhotoSensorContextResult =
  | {
      kind: "attached";
      snapshot: PhotoContextCandidateSnapshot;
      source: "attached";
    }
  | {
      kind: "nearest";
      snapshot: PhotoContextCandidateSnapshot;
      deltaMs: number;
      direction: "before" | "after" | "same";
      source: "nearest";
    }
  | {
      kind: "none";
      reason: "no_photo_time" | "no_candidates" | "out_of_window";
    };

function parseTime(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function snapshotTime(snap: PhotoContextCandidateSnapshot): number | null {
  return (
    parseTime(snap.capturedAtIso) ??
    parseTime(snap.captured_at)
  );
}

/**
 * Resolve the safest sensor context for a photo event.
 *
 * Selection rules:
 *   1. If `photo.attachedSnapshot` is present, use it. Attached wins
 *      regardless of distance — the grower explicitly attached it.
 *   2. Otherwise scan candidates for the smallest |delta| within
 *      `maxWindowMs`. Tie → earlier captured_at wins.
 *   3. If no candidate qualifies, return `{ kind: "none" }`.
 */
export function resolvePhotoSensorContext(
  photo: PhotoEventForContext | null | undefined,
  candidates: readonly PhotoContextCandidateSnapshot[] | null | undefined,
  options: PhotoSensorContextOptions = {},
): PhotoSensorContextResult {
  if (!photo || typeof photo !== "object") {
    return { kind: "none", reason: "no_photo_time" };
  }
  const photoTime = parseTime(photo.capturedAtIso);
  if (photoTime === null) {
    // Even with an attached snapshot, without a photo time we can't
    // verify safety distances. We still expose the attachment because
    // the grower's explicit attachment is its own signal of intent.
    if (photo.attachedSnapshot) {
      return {
        kind: "attached",
        snapshot: photo.attachedSnapshot,
        source: "attached",
      };
    }
    return { kind: "none", reason: "no_photo_time" };
  }

  if (photo.attachedSnapshot) {
    return {
      kind: "attached",
      snapshot: photo.attachedSnapshot,
      source: "attached",
    };
  }

  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) {
    return { kind: "none", reason: "no_candidates" };
  }

  const windowMs =
    typeof options.maxWindowMs === "number" && options.maxWindowMs > 0
      ? options.maxWindowMs
      : DEFAULT_NEAREST_WINDOW_MS;

  let best: {
    snapshot: PhotoContextCandidateSnapshot;
    time: number;
    deltaAbs: number;
  } | null = null;

  for (const cand of list) {
    if (!cand || typeof cand !== "object") continue;
    const t = snapshotTime(cand);
    if (t === null) continue;
    const deltaAbs = Math.abs(t - photoTime);
    if (deltaAbs > windowMs) continue;
    if (best === null) {
      best = { snapshot: cand, time: t, deltaAbs };
      continue;
    }
    if (deltaAbs < best.deltaAbs) {
      best = { snapshot: cand, time: t, deltaAbs };
      continue;
    }
    // Tie-breaker: equal distance → earlier captured_at wins.
    if (deltaAbs === best.deltaAbs && t < best.time) {
      best = { snapshot: cand, time: t, deltaAbs };
    }
  }

  if (best === null) {
    return { kind: "none", reason: "out_of_window" };
  }

  const signedDelta = best.time - photoTime;
  const direction: "before" | "after" | "same" =
    signedDelta < 0 ? "before" : signedDelta > 0 ? "after" : "same";

  return {
    kind: "nearest",
    snapshot: best.snapshot,
    deltaMs: best.deltaAbs,
    direction,
    source: "nearest",
  };
}

/**
 * Human-friendly delta label, e.g. "12m before photo", "1h 5m after photo",
 * "at photo time". Never speculates beyond the numeric distance.
 */
export function formatPhotoContextDeltaLabel(
  deltaMs: number,
  direction: "before" | "after" | "same",
): string {
  if (direction === "same" || deltaMs < 1000) return "at photo time";
  const totalSec = Math.round(deltaMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) parts.push(`${totalSec}s`);
  return `${parts.join(" ")} ${direction} photo`;
}
