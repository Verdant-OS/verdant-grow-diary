import { useEffect, useRef, useState } from "react";

export const GGS_OPERATOR_EVALUATION_INTERVAL_MS = 30_000;

export interface GgsOperatorEvaluationClockOptions {
  enabled: boolean;
  intervalMs?: number;
  now?: () => number;
}

/**
 * Read-only clock for the operator GGS Sentinel evaluation. It advances even
 * when TanStack Query structurally shares an unchanged row array, and it owns
 * no timer while the underlying query is disabled.
 */
export function useGgsOperatorEvaluationClock({
  enabled,
  intervalMs = GGS_OPERATOR_EVALUATION_INTERVAL_MS,
  now = Date.now,
}: GgsOperatorEvaluationClockOptions): number {
  const nowRef = useRef(now);
  nowRef.current = now;
  const [nowMs, setNowMs] = useState(() => now());

  useEffect(() => {
    if (!enabled) return;
    setNowMs(nowRef.current());
    const intervalId = window.setInterval(() => {
      setNowMs(nowRef.current());
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs]);

  return nowMs;
}
