import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

/**
 * False during SSR and during React's hydration render, true afterwards.
 *
 * `useSyncExternalStore` returns the server snapshot (false) for the
 * hydration pass, so a component gating on this value renders identical
 * output on the server and on the first client render — the requirement for
 * React not to discard the SSR tree — and then re-renders once hydrated.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
