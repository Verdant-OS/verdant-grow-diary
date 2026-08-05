/**
 * Test utilities: fluent Supabase builders must accept .abortSignal(signal)
 * identity-preserving so production PostgREST wiring does not break mocks.
 */

/** Attach identity-preserving abortSignal to an existing chain object. */
export function addAbortSignalPassthrough<T extends Record<string, unknown>>(
  chain: T,
): T & { abortSignal: (signal?: AbortSignal) => T } {
  const withAbort = chain as T & { abortSignal: (signal?: AbortSignal) => T };
  withAbort.abortSignal = (_signal?: AbortSignal) => chain;
  return withAbort;
}

/**
 * Terminal fluent result: supports .abortSignal() then await (thenable),
 * matching PostgREST builders that end with .limit().abortSignal(signal).
 */
export function thenableQueryResult<T extends { data: unknown; error: unknown }>(
  result: T,
  captureSignal?: (signal: AbortSignal) => void,
): {
  abortSignal: (signal?: AbortSignal) => ReturnType<typeof thenableQueryResult<T>>;
  then: (
    onFulfilled: (value: T) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
} {
  const chain = {
    abortSignal(signal?: AbortSignal) {
      if (signal && captureSignal) captureSignal(signal);
      return chain;
    },
    then(onFulfilled: (value: T) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

/** Common method names for identity passthrough mocks (includes abortSignal). */
export const SUPABASE_READ_PASSTHROUGH_METHODS = [
  "select",
  "eq",
  "in",
  "order",
  "limit",
  "range",
  "not",
  "gte",
  "or",
  "abortSignal",
] as const;
