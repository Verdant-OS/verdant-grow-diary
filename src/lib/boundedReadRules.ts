/**
 * Upper bound for a page-critical read. Past it the caller must leave its
 * loading state and show an error. A paused offline query never calls this.
 */
export const CRITICAL_READ_DEADLINE_MS = 8_000;

export class CriticalReadDeadlineError extends Error {
  readonly code = "critical_read_deadline";

  constructor() {
    super("critical_read_deadline");
    this.name = "CriticalReadDeadlineError";
  }
}

export function withCriticalReadDeadline<T>(
  work: PromiseLike<T>,
  timeoutMs: number = CRITICAL_READ_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CriticalReadDeadlineError()), timeoutMs);
  });
  return Promise.race([Promise.resolve(work), timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
