import { CriticalReadDeadlineError } from "@/lib/boundedReadRules";

/**
 * Two short waits after the first attempt. Combined with the per-attempt
 * deadline, a failing read leaves the loading state inside GROW_READ_BUDGET_MS.
 */
export const GROW_READ_RETRY_DELAYS_MS = [200, 400] as const;

/** Whole retry sequence, including backoff. About 10s, under the 12s review cap. */
export const GROW_READ_BUDGET_MS = 10_000;

/** Each attempt is shorter than the 8s page deadline so three attempts fit the budget. */
export const GROW_READ_ATTEMPT_DEADLINE_MS = 3_000;

/** How long the first grows read waits for the post-sign-in session check. */
export const AUTH_SETTLE_WAIT_MS = 2_000;

export type GrowReadFailureKind = "timeout" | "network" | "db";

export interface GrowReadFailure {
  readonly kind: GrowReadFailureKind;
  /** Stable machine code. Never a message, token, or email. */
  readonly code: string;
}

const SAFE_FAILURE_CODE = /^[A-Za-z0-9_]{1,40}$/;

/**
 * Postgres privilege/syntax classes, PostgREST client errors, and HTTP 4xx.
 * These do not recover by reading the same query again.
 */
const NON_RETRYABLE_CODES = new Set(["42501", "42P01", "PGRST116", "type_error"]);

function readCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function readMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/**
 * Network failures only. A TypeError from a code bug is not a transport error
 * and must not be retried.
 */
function isNetworkFailure(error: unknown): boolean {
  const code = readCode(error);
  if (code === "network" || code === "ECONNRESET" || code === "ETIMEDOUT") return true;
  const name =
    error && typeof error === "object" && "name" in error && typeof error.name === "string"
      ? error.name
      : "";
  if (name === "NetworkError") return true;
  return /failed to fetch|networkerror|load failed|network request failed/i.test(
    readMessage(error),
  );
}

function isClientOrPermissionCode(code: string): boolean {
  if (NON_RETRYABLE_CODES.has(code)) return true;
  if (/^4\d\d$/.test(code)) return true;
  if (code.startsWith("42")) return true;
  if (/^PGRST[123]\d*/.test(code)) return true;
  if (code.startsWith("28")) return true;
  return false;
}

/**
 * Classifies a grows-list failure for retry and Sentry. The returned code is
 * allowlisted; query text and PostgREST messages stay out.
 */
export function classifyGrowReadFailure(error: unknown): GrowReadFailure {
  if (error instanceof CriticalReadDeadlineError) {
    return { kind: "timeout", code: "critical_read_deadline" };
  }
  const code = readCode(error);
  if (code === "critical_read_deadline") {
    return { kind: "timeout", code: "critical_read_deadline" };
  }
  if (isNetworkFailure(error)) return { kind: "network", code: "network" };
  if (error instanceof TypeError) return { kind: "db", code: "type_error" };
  if (code && SAFE_FAILURE_CODE.test(code)) return { kind: "db", code };
  return { kind: "db", code: "unknown" };
}

export function isRetryableGrowReadFailure(failure: GrowReadFailure): boolean {
  if (failure.kind === "timeout" || failure.kind === "network") return true;
  if (failure.code === "unknown") return true;
  return !isClientOrPermissionCode(failure.code);
}

export interface GrowRetryControls {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly delays?: readonly number[];
  readonly budgetMs?: number;
  readonly now?: () => number;
  readonly shouldStop?: () => boolean;
  /** Registers the active backoff timer so unmount can clear it. */
  readonly onDelay?: (cancel: () => void) => void;
}

export class GrowReadCancelledError extends Error {
  readonly code = "cancelled";

  constructor() {
    super("cancelled");
    this.name = "GrowReadCancelledError";
  }
}

/** Deadline whose timer can be cleared on unmount. Clearing rejects with GrowReadCancelledError. */
export function withTrackedDeadline<T>(
  work: PromiseLike<T>,
  timeoutMs: number,
  track: (cancel: () => void) => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: (error: Error) => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
    timer = setTimeout(() => reject(new CriticalReadDeadlineError()), timeoutMs);
  });
  track(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    rejectTimeout(new GrowReadCancelledError());
  });
  return Promise.race([Promise.resolve(work), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

function defaultSleep(ms: number, onDelay?: (cancel: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      onDelay?.(() => {});
      resolve();
    }, ms);
    onDelay?.(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function readWithGrowRetry<T>(
  read: () => Promise<{ ok: true; value: T } | { ok: false; failure: GrowReadFailure }>,
  sleepOrControls: ((ms: number) => Promise<void>) | GrowRetryControls = {},
  delaysArg?: readonly number[],
): Promise<{ ok: true; value: T } | { ok: false; failure: GrowReadFailure; stopped?: boolean }> {
  const controls: GrowRetryControls =
    typeof sleepOrControls === "function"
      ? { sleep: sleepOrControls, delays: delaysArg }
      : sleepOrControls;
  const delays = controls.delays ?? GROW_READ_RETRY_DELAYS_MS;
  const budgetMs = controls.budgetMs ?? GROW_READ_BUDGET_MS;
  const now = controls.now ?? Date.now;
  const startedAt = now();
  let failure: GrowReadFailure = { kind: "db", code: "unknown" };

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    if (controls.shouldStop?.()) return { ok: false, failure, stopped: true };
    if (now() - startedAt >= budgetMs) return { ok: false, failure };
    const result = await read();
    if (result.ok) return result;
    if (controls.shouldStop?.()) return { ok: false, failure: result.failure, stopped: true };
    failure = result.failure;
    if (!isRetryableGrowReadFailure(failure)) break;
    const delay = delays[attempt];
    if (delay === undefined) break;
    const elapsed = now() - startedAt;
    if (elapsed + delay >= budgetMs) break;
    if (controls.sleep) await controls.sleep(delay);
    else await defaultSleep(delay, controls.onDelay);
    if (controls.shouldStop?.()) return { ok: false, failure, stopped: true };
  }
  return { ok: false, failure };
}
