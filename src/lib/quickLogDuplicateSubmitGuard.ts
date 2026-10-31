/**
 * Stops a second Quick Log or note save from creating another diary row.
 *
 * One logical submission is the payload with the idempotency key and
 * occurrence time removed. Those two fields are restamped on every tap, so
 * a fresh `newQuickLogSaveKey()` would otherwise look like a new entry.
 * The key itself still comes from `quickLogIdempotencyKey.ts`; this module
 * only decides whether that key is allowed to be sent again.
 *
 * Pure aside from the guard object's own memory. No React, no clock, no I/O.
 * `execute` is injected. Never throws on a null payload.
 */

import {
  buildQuickLogPhotoIdentity,
  buildQuickLogSaveSignature,
} from "@/lib/quickLogSaveKeyPolicy";
import type { QuickLogPhotoIdentity } from "@/lib/quickLogSaveKeyPolicy";

const VOLATILE_KEYS = new Set([
  "occurred_at",
  "p_occurred_at",
  "occurredAt",
  "createdAt",
  "p_idempotency_key",
  "idempotencyKey",
  "idempotency_key",
]);

function withoutVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileFields);
  if (value === null || typeof value !== "object") return value;
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (VOLATILE_KEYS.has(key)) continue;
    rest[key] = withoutVolatileFields((value as Record<string, unknown>)[key]);
  }
  return rest;
}

export function fingerprintQuickLogSubmission(payload: unknown): string {
  if (payload === null || payload === undefined) return buildQuickLogSaveSignature(null);
  return buildQuickLogSaveSignature(withoutVolatileFields(payload));
}

export interface QuickLogSheetSubmissionSnapshotInput {
  action?: string | null;
  selectedKey?: string | null;
  note?: string | null;
  volumeMl?: string | null;
  temperatureC?: string | null;
  humidityPct?: string | null;
  vpdKpa?: string | null;
  watering?: unknown;
  feeding?: unknown;
  maturity?: unknown;
  photo?: QuickLogPhotoIdentity | null;
  video?: QuickLogPhotoIdentity | null;
}

/** Form snapshot used before a payload exists. Photo identity, not the upload path. */
export function buildQuickLogSheetSubmissionSnapshot(
  input: QuickLogSheetSubmissionSnapshotInput | null | undefined,
): Record<string, unknown> {
  const source = input ?? {};
  return {
    action: source.action ?? null,
    selectedKey: source.selectedKey ?? null,
    note: source.note ?? null,
    volumeMl: source.volumeMl ?? null,
    temperatureC: source.temperatureC ?? null,
    humidityPct: source.humidityPct ?? null,
    vpdKpa: source.vpdKpa ?? null,
    watering: source.watering ?? null,
    feeding: source.feeding ?? null,
    maturity: source.maturity ?? null,
    photo: buildQuickLogPhotoIdentity(source.photo),
    video: buildQuickLogPhotoIdentity(source.video),
  };
}

/*
 * In-flight only (Main FIX REQUEST #2647 P1 / P2-1). Nothing is remembered
 * after a save settles, so a later deliberate save of the same payload always
 * writes. Only a tap whose fingerprint matches the save still in flight joins
 * it; a different payload during flight is refused, never given the first
 * save's result.
 */
export type QuickLogSubmitPhase = "idle" | "in_flight";

export interface QuickLogSubmitGuardState {
  phase: QuickLogSubmitPhase;
  /** Fingerprint of the save currently in flight, when phase is in_flight. */
  fingerprint: string | null;
}

export type QuickLogSubmitDecision =
  | { kind: "begin"; fingerprint: string }
  /** Identical payload while that payload is still in flight. */
  | { kind: "in_flight"; fingerprint: string }
  /** A different payload while another save is still in flight. */
  | { kind: "busy"; fingerprint: string };

export function createQuickLogSubmitGuardState(): QuickLogSubmitGuardState {
  return { phase: "idle", fingerprint: null };
}

export function decideQuickLogSubmit(
  state: QuickLogSubmitGuardState | null | undefined,
  payload: unknown,
): QuickLogSubmitDecision {
  const fingerprint = fingerprintQuickLogSubmission(payload);
  if (state?.phase === "in_flight") {
    return state.fingerprint === fingerprint
      ? { kind: "in_flight", fingerprint }
      : { kind: "busy", fingerprint };
  }
  return { kind: "begin", fingerprint };
}

export function beginQuickLogSubmit(
  _state: QuickLogSubmitGuardState | null | undefined,
  fingerprint: string | null | undefined,
): QuickLogSubmitGuardState {
  return {
    phase: "in_flight",
    fingerprint: typeof fingerprint === "string" ? fingerprint : "",
  };
}

/** Settle (success, failure or throw): always back to idle for that flight. */
export function finishQuickLogSubmit(
  state: QuickLogSubmitGuardState | null | undefined,
  fingerprint: string | null | undefined,
): QuickLogSubmitGuardState {
  const current = state ?? createQuickLogSubmitGuardState();
  const key = typeof fingerprint === "string" ? fingerprint : "";
  if (current.phase === "in_flight" && current.fingerprint !== key) return current;
  return createQuickLogSubmitGuardState();
}

export interface QuickLogSaveBusyInput {
  saving?: boolean | null;
  feedingSaving?: boolean | null;
  wateringSaving?: boolean | null;
  attemptLocked?: boolean | null;
}

/** True while any Quick Log save the grower started is still in flight. */
export function isQuickLogSaveBusy(input: QuickLogSaveBusyInput | null | undefined): boolean {
  if (input == null) return false;
  return Boolean(
    input.saving || input.feedingSaving || input.wateringSaving || input.attemptLocked,
  );
}

export interface QuickLogSubmitGuardController<T extends { ok: boolean }> {
  readonly state: QuickLogSubmitGuardState;
  run(payload: unknown, execute: () => Promise<T>): Promise<T>;
}

interface QuickLogSubmitFlight<T> {
  fingerprint: string;
  promise: Promise<T>;
}

/**
 * Holds one in-flight save for this caller. A second tap with the identical
 * payload joins that promise; a different payload gets `blocked()`. When the
 * save settles (success, failure or throw) the guard is idle again, so the
 * same payload saved later is a new write.
 */
export function createQuickLogSubmitGuard<T extends { ok: boolean }>(
  blocked: () => T,
): QuickLogSubmitGuardController<T> {
  let state = createQuickLogSubmitGuardState();
  let flight: QuickLogSubmitFlight<T> | null = null;
  const fallback = { ok: false } as T;
  const refuse = typeof blocked === "function" ? blocked : () => fallback;

  return {
    get state() {
      return state;
    },
    run(payload, execute) {
      const decision = decideQuickLogSubmit(state, payload);
      if (decision.kind === "in_flight" && flight?.fingerprint === decision.fingerprint) {
        return flight.promise;
      }
      if (decision.kind !== "begin") return Promise.resolve(refuse());
      const fingerprint = decision.fingerprint;
      state = beginQuickLogSubmit(state, fingerprint);
      const promise = (async () => {
        try {
          return await execute();
        } finally {
          state = finishQuickLogSubmit(state, fingerprint);
          if (flight?.fingerprint === fingerprint) flight = null;
        }
      })();
      flight = { fingerprint, promise };
      return promise;
    },
  };
}
