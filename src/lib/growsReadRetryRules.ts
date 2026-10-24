import { CriticalReadDeadlineError } from "@/lib/boundedReadRules";

/** Two short waits after the first attempt, then the error state is shown. */
export const GROW_READ_RETRY_DELAYS_MS = [250, 750] as const;

export type GrowReadFailureKind = "timeout" | "network" | "db";

export interface GrowReadFailure {
  readonly kind: GrowReadFailureKind;
  /** Stable machine code. Never a message, token, or email. */
  readonly code: string;
}

const SAFE_FAILURE_CODE = /^[A-Za-z0-9_]{1,40}$/;

function readCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  if (name === "TypeError" || name === "NetworkError") return true;
  const code = readCode(error);
  return code === "network" || code === "ECONNRESET" || code === "ETIMEDOUT";
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
  if (code && SAFE_FAILURE_CODE.test(code)) return { kind: "db", code };
  return { kind: "db", code: "unknown" };
}

export async function readWithGrowRetry<T>(
  read: () => Promise<{ ok: true; value: T } | { ok: false; failure: GrowReadFailure }>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  delays: readonly number[] = GROW_READ_RETRY_DELAYS_MS,
): Promise<{ ok: true; value: T } | { ok: false; failure: GrowReadFailure }> {
  let failure: GrowReadFailure = { kind: "db", code: "unknown" };
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const result = await read();
    if (result.ok) return result;
    failure = result.failure;
    const delay = delays[attempt];
    if (delay === undefined) break;
    await sleep(delay);
  }
  return { ok: false, failure };
}
