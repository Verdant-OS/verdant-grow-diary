/**
 * useNowTick — shared minute-tick clock for freshness-sensitive presenters.
 *
 * Freshness is time-relative: a card rendered once must not keep a fresh
 * label after the stale boundary passes on an open tab (SENSOR TRUTH).
 * Returns a ms timestamp that re-evaluates every `intervalMs` (default
 * 60s — well inside the 30-minute stale window).
 *
 * Read-only; no fetch, no Supabase, no side effects beyond the timer.
 */
import { useEffect, useState } from "react";

export function useNowTick(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
