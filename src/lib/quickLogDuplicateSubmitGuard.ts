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

export type QuickLogSubmitPhase = "idle" | "in_flight" | "completed";

export interface QuickLogSubmitGuardState<T> {
  phase: QuickLogSubmitPhase;
  /** Fingerprint of the save currently in flight, when phase is in_flight. */
  fingerprint: string | null;
  /** Every payload that already committed, keyed by fingerprint. */
  completed: Record<string, T>;
}

export type QuickLogSubmitDecision<T> =
  | { kind: "begin"; fingerprint: string }
  | { kind: "in_flight"; fingerprint: string }
  | { kind: "duplicate"; fingerprint: string; result: T };

export function createQuickLogSubmitGuardState<T>(): QuickLogSubmitGuardState<T> {
  return { phase: "idle", fingerprint: null, completed: {} };
}

export function decideQuickLogSubmit<T>(
  state: QuickLogSubmitGuardState<T> | null | undefined,
  payload: unknown,
): QuickLogSubmitDecision<T> {
  const fingerprint = fingerprintQuickLogSubmission(payload);
  const completed = state?.completed?.[fingerprint];
  if (state?.phase === "in_flight") {
    return { kind: "in_flight", fingerprint: state.fingerprint ?? fingerprint };
  }
  if (completed != null) return { kind: "duplicate", fingerprint, result: completed };
  return { kind: "begin", fingerprint };
}

export function beginQuickLogSubmit<T>(
  state: QuickLogSubmitGuardState<T> | null | undefined,
  fingerprint: string | null | undefined,
): QuickLogSubmitGuardState<T> {
  const current = state ?? createQuickLogSubmitGuardState<T>();
  return {
    phase: "in_flight",
    fingerprint: typeof fingerprint === "string" ? fingerprint : "",
    completed: current.completed ?? {},
  };
}

export function finishQuickLogSubmit<T>(
  state: QuickLogSubmitGuardState<T> | null | undefined,
  fingerprint: string | null | undefined,
  result: T | null,
  committed: boolean,
): QuickLogSubmitGuardState<T> {
  const current = state ?? createQuickLogSubmitGuardState<T>();
  const key = typeof fingerprint === "string" ? fingerprint : "";
  if (current.phase === "in_flight" && current.fingerprint !== key) return current;
  const completed = current.completed ?? {};
  if (!committed || result == null) {
    return { phase: "idle", fingerprint: null, completed };
  }
  return {
    phase: "idle",
    fingerprint: null,
    completed: { ...completed, [key]: result },
  };
}

export function reuseQuickLogSubmitResult<T extends { reused?: boolean }>(result: T): T {
  if (result == null || typeof result !== "object") return result;
  return { ...result, reused: true };
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

export interface QuickLogSubmitGuardController<T extends { ok: boolean; reused?: boolean }> {
  readonly state: QuickLogSubmitGuardState<T>;
  run(payload: unknown, execute: () => Promise<T>): Promise<T>;
}

interface QuickLogSubmitFlight<T> {
  fingerprint: string;
  promise: Promise<T>;
}

/**
 * Remembers one in-flight save and every completed payload for this caller.
 * A second tap joins the in-flight promise. The same payload after success
 * returns that result with `reused: true` and does not call `execute`.
 * A failed attempt is forgotten so Retry can send it again.
 */
export function createQuickLogSubmitGuard<T extends { ok: boolean; reused?: boolean }>(
  blocked: () => T,
  options?: { rememberCompleted?: boolean },
): QuickLogSubmitGuardController<T> {
  let state = createQuickLogSubmitGuardState<T>();
  let flight: QuickLogSubmitFlight<T> | null = null;
  const rememberCompleted = options?.rememberCompleted !== false;
  const fallback = { ok: false } as T;
  const refuse = typeof blocked === "function" ? blocked : () => fallback;

  return {
    get state() {
      return state;
    },
    run(payload, execute) {
      const decision = decideQuickLogSubmit(state, payload);
      if (decision.kind === "duplicate") {
        return Promise.resolve(reuseQuickLogSubmitResult(decision.result));
      }
      if (decision.kind === "in_flight") {
        if (flight) return flight.promise;
        return Promise.resolve(refuse());
      }
      const fingerprint = decision.fingerprint;
      state = beginQuickLogSubmit(state, fingerprint);
      const promise = (async () => {
        try {
          const result = await execute();
          const committed = rememberCompleted && result != null && result.ok === true;
          state = finishQuickLogSubmit(state, fingerprint, result ?? null, committed);
          return result;
        } catch (error) {
          state = finishQuickLogSubmit(state, fingerprint, null, false);
          throw error;
        } finally {
          if (flight?.fingerprint === fingerprint) flight = null;
        }
      })();
      flight = { fingerprint, promise };
      return promise;
    },
  };
}
