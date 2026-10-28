import {
  CRITICAL_READ_DEADLINE_MS,
  CriticalReadDeadlineError,
  withCriticalReadDeadline,
} from "@/lib/boundedReadRules";

/**
 * Two short waits after the first attempt. The first attempt keeps the full
 * page deadline; later attempts use only the time left in GROW_READ_BUDGET_MS.
 */
export const GROW_READ_RETRY_DELAYS_MS = [200, 400] as const;

/**
 * Whole retry sequence, including the 8s first attempt and backoff.
 * A healthy read that finishes inside CRITICAL_READ_DEADLINE_MS still succeeds.
 */
export const GROW_READ_BUDGET_MS = 12_000;

/** Do not start another attempt when less than this much budget remains. */
export const GROW_READ_MIN_RETRY_MS = 1_000;

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
  // Expired or invalid JWT. This is the post-sign-in race, so it is retried.
  if (code === "PGRST301") return false;
  // Request timeout and rate limit can clear on a short retry.
  if (code === "408" || code === "429") return false;
  if (/^4\d\d$/.test(code)) return true;
  if (code.startsWith("42")) return true;
  if (/^PGRST[123]\d*/.test(code)) return true;
  if (code.startsWith("28")) return true;
  return false;
}

/** First attempt keeps the 8s page deadline. Retries get only the budget that remains. */
export function growReadAttemptDeadlineMs(attempt: number, remainingMs: number): number {
  if (remainingMs <= 0) return 0;
  if (attempt === 0) return Math.min(CRITICAL_READ_DEADLINE_MS, remainingMs);
  return remainingMs;
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

/** Grows-store error value when the JWT is still rejected after every retry. */
export const GROWS_READ_SESSION_EXPIRED = "session_expired";

/**
 * The grows store's `error` value for a failed read. An expired or invalid JWT
 * that outlasts the retries gets its own value so pages can send the grower to
 * sign in instead of offering a retry that cannot work.
 */
export function growsReadErrorValue(failure: GrowReadFailure): string {
  if (failure.kind === "timeout") return "critical_read_deadline";
  if (failure.code === "PGRST301") return GROWS_READ_SESSION_EXPIRED;
  return "Unable to load grows";
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
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectTimeout: (error: Error) => void = () => {};
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new CriticalReadDeadlineError());
    }, timeoutMs);
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
    const timer = setTimeout(resolve, ms);
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
    if (budgetMs - elapsed < GROW_READ_MIN_RETRY_MS) break;
    if (elapsed + delay >= budgetMs) break;
    if (controls.sleep) await controls.sleep(delay);
    else await defaultSleep(delay, controls.onDelay);
    if (controls.shouldStop?.()) return { ok: false, failure, stopped: true };
  }
  return { ok: false, failure };
}

/**
 * Run one critical read, then the short backoff sequence, and return the
 * first success. A non-retryable failure stops immediately. The last failure
 * is rethrown so callers still record a failed read.
 */
export async function readTransientValue<T>(
  read: () => Promise<T>,
  controls: GrowRetryControls = {},
): Promise<T> {
  const budgetMs = controls.budgetMs ?? GROW_READ_BUDGET_MS;
  const now = controls.now ?? Date.now;
  const startedAt = now();
  let attempt = 0;
  let lastError: unknown = new Error("grow_read_failed");
  const outcome = await readWithGrowRetry(async () => {
    const remaining = budgetMs - (now() - startedAt);
    const deadline = growReadAttemptDeadlineMs(attempt, remaining);
    attempt += 1;
    if (deadline <= 0) {
      lastError = new CriticalReadDeadlineError();
      return { ok: false as const, failure: classifyGrowReadFailure(lastError) };
    }
    try {
      return { ok: true as const, value: await withCriticalReadDeadline(read(), deadline) };
    } catch (caught) {
      lastError = caught;
      return { ok: false as const, failure: classifyGrowReadFailure(caught) };
    }
  }, controls);
  if (outcome.ok) return outcome.value;
  throw lastError;
}
