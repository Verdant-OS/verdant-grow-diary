/**
 * Debounced Retry for create-dialog grow/tent re-fetch.
 * Pure gate lives in createDialogRetryRules; this only holds clock + inFlight.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CREATE_BINDING_RETRY_COOLDOWN_MS,
  evaluateCreateBindingRetryGate,
  recordCreateBindingRetryAttempt,
} from "@/lib/createDialogRetryRules";

export function useCreateBindingRetry(
  run: () => undefined | Promise<unknown>,
  options?: { cooldownMs?: number },
) {
  const cooldownMs = options?.cooldownMs ?? CREATE_BINDING_RETRY_COOLDOWN_MS;
  const [lastAttemptAtMs, setLastAttemptAtMs] = useState<number | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const gate = evaluateCreateBindingRetryGate({
    lastAttemptAtMs,
    nowMs,
    inFlight,
    cooldownMs,
  });

  // Tick only while cooling down so the button re-enables without a click.
  useEffect(() => {
    if (gate.reason !== "cooldown") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [gate.reason]);

  const attempt = useCallback(async () => {
    const now = Date.now();
    const next = evaluateCreateBindingRetryGate({
      lastAttemptAtMs,
      nowMs: now,
      inFlight,
      cooldownMs,
    });
    if (!next.allowed) return false;

    setLastAttemptAtMs(recordCreateBindingRetryAttempt(now));
    setNowMs(now);
    setInFlight(true);
    try {
      await run();
      return true;
    } finally {
      setInFlight(false);
      setNowMs(Date.now());
    }
  }, [lastAttemptAtMs, inFlight, cooldownMs, run]);

  return {
    attempt,
    gate,
    inFlight,
    cooldownMs,
  };
}
