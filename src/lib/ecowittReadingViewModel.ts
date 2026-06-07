/**
 * ecowittReadingViewModel — pure presenter that picks the newest valid
 * EcoWitt reading from a candidate list and resolves its display label.
 *
 * Hard constraints (stop-ship if violated):
 *  - Pure, deterministic. No I/O, no React, no timers, no auth.
 *  - Uses the existing `sensorSourceLabelRules` resolver. Does not
 *    invent its own "Live / EcoWitt" branding. The vendor lineage tag
 *    only re-labels readings whose canonical source is already "live";
 *    manual / stale / invalid readings keep their canonical label.
 *  - Read-only: never writes to alerts, action_queue, or device control.
 *  - Does not duplicate VPD formula — VPD is derived in
 *    `ecowittPayloadRules.normalizeEcowittPayload` from temp + RH.
 */
import {
  normalizeEcowittPayload,
  type EcowittFreshness,
  type EcowittNormalizedReading,
  type EcowittNormalizedSnapshot,
  type NormalizeEcowittOptions,
} from "@/lib/ecowittPayloadRules";
import {
  resolveSensorSourceLabel,
  type ResolvedSourceLabel,
} from "@/lib/sensorSourceLabelRules";
import type { SensorReadingSource } from "@/mock";

export interface EcowittCandidate {
  /** Raw EcoWitt payload as received by the listener. */
  payload: unknown;
  /** Canonical source of this candidate. "live" only when received via
   *  the EcoWitt listener and not yet aged out; "manual" for hand-typed
   *  EcoWitt entries; never trust a payload-supplied source. */
  source: SensorReadingSource;
  /** When this reading was received by the listener (server time). Used
   *  as a fallback for freshness when the payload date is missing. */
  receivedAt?: string;
}

export interface EcowittSnapshotViewModel {
  /** True when at least one valid EcoWitt reading is present. */
  hasReading: boolean;
  /** Empty-state copy when `hasReading === false`. */
  emptyStateMessage: string | null;
  /** Newest valid normalized snapshot, or null when none. */
  snapshot: EcowittNormalizedSnapshot | null;
  /** Resolved canonical source for the chosen snapshot. */
  source: SensorReadingSource | null;
  /** Resolved display label — never promotes manual/stale to "Live". */
  sourceLabel: ResolvedSourceLabel | null;
  /** Convenience: freshness derived from snapshot. */
  freshness: EcowittFreshness | null;
  /** Convenience: derived VPD in kPa. Always labelled "Derived VPD" in UI. */
  derivedVpdKpa: number | null;
  /** Convenience: per-metric quick-access map for presenter. */
  metrics: Partial<Record<EcowittNormalizedReading["metric"], number>>;
  /** True if the chosen snapshot was flagged invalid by suspicion rules. */
  invalid: boolean;
  /** Calm copy describing why the snapshot is unavailable, or null. */
  unavailableReason: string | null;
}


const EMPTY_STATE_MESSAGE =
  "No EcoWitt readings yet. Send a local test payload to verify the integration.";

/**
 * Demote a "live" source to "stale" when the snapshot has aged past the
 * fresh window. Manual / stale / invalid candidates are never promoted.
 */
function effectiveSource(
  candidateSource: SensorReadingSource,
  freshness: EcowittFreshness,
): SensorReadingSource {
  if (candidateSource === "live" && freshness !== "fresh") return "stale";
  return candidateSource;
}

function capturedAtMs(snap: EcowittNormalizedSnapshot): number {
  if (!snap.capturedAt) return -Infinity;
  const t = Date.parse(snap.capturedAt);
  return Number.isFinite(t) ? t : -Infinity;
}

export interface BuildEcowittSnapshotOptions {
  /** Wall-clock — injected for determinism. */
  now?: Date;
  /** Forwarded to the adapter (tent/plant binding, channel mapping...). */
  adapter?: Omit<NormalizeEcowittOptions, "now">;
}

/**
 * Pick the newest valid EcoWitt reading and build a presenter snapshot.
 *
 * Selection rules:
 *  - Discard candidates whose payload normalizes to zero readings.
 *  - Among the rest, pick the one with the newest `capturedAt`. Ties
 *    fall back to the order received.
 *  - Empty input or all-invalid input → empty-state view-model.
 */
export function buildEcowittSnapshotViewModel(
  candidates: readonly EcowittCandidate[] | null | undefined,
  options: BuildEcowittSnapshotOptions = {},
): EcowittSnapshotViewModel {
  const now = options.now ?? new Date();
  const list = Array.isArray(candidates) ? candidates : [];

  type Entry = {
    snap: EcowittNormalizedSnapshot;
    source: SensorReadingSource;
  };

  const entries: Entry[] = [];
  for (const c of list) {
    const snap = normalizeEcowittPayload(c.payload, {
      ...(options.adapter ?? {}),
      now,
      serverReceivedAt: c.receivedAt,
      allowServerReceivedAtFallback:
        options.adapter?.allowServerReceivedAtFallback ?? !!c.receivedAt,
    });
    // Keep invalid/suspicious snapshots so the UI can render an honest
    // "unavailable" state. Only drop payloads that produced zero readings
    // at all (nothing to show, not even an invalid value).
    if (snap.readings.length === 0) continue;
    entries.push({ snap, source: c.source });
  }

  if (entries.length === 0) {
    return {
      hasReading: false,
      emptyStateMessage: EMPTY_STATE_MESSAGE,
      snapshot: null,
      source: null,
      sourceLabel: null,
      freshness: null,
      derivedVpdKpa: null,
      metrics: {},
      invalid: false,
      unavailableReason: null,
    };
  }

  entries.sort((a, b) => capturedAtMs(b.snap) - capturedAtMs(a.snap));
  const chosen = entries[0];
  const effective: SensorReadingSource = chosen.snap.invalid
    ? "invalid"
    : effectiveSource(chosen.source, chosen.snap.freshness);
  const label = resolveSensorSourceLabel({
    source: effective,
    vendor: "ecowitt",
  });

  const metrics: EcowittSnapshotViewModel["metrics"] = {};
  for (const r of chosen.snap.readings) metrics[r.metric] = r.value;

  return {
    hasReading: true,
    emptyStateMessage: null,
    snapshot: chosen.snap,
    source: effective,
    sourceLabel: label,
    freshness: chosen.snap.freshness,
    derivedVpdKpa: chosen.snap.derivedVpdKpa,
    metrics,
    invalid: chosen.snap.invalid,
    unavailableReason: chosen.snap.invalid
      ? (chosen.snap.suspicion.find((f) => f.severity === "invalid")?.message ??
        "Reading marked unavailable.")
      : null,
  };
}


export const ECOWITT_EMPTY_STATE_MESSAGE = EMPTY_STATE_MESSAGE;
export const ECOWITT_DERIVED_VPD_LABEL = "Derived VPD";
