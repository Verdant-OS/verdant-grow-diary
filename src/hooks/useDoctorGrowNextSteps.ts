import { useCallback, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { adaptCreditedAiResponse } from "@/lib/aiCreditedResponseAdapter";
import {
  classifyDoctorNextStepsResponse,
  type DoctorNextStepsOutcome,
} from "@/lib/doctorGrowNextStepsRules";

/**
 * Explicit, click-only grow-level next steps. Never runs on mount.
 * Credits, model tier and model are decided by the `ai-coach` edge function;
 * the client sends only the mode, the grow and an idempotency key.
 */
export function useDoctorGrowNextSteps() {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<DoctorNextStepsOutcome | null>(null);
  // A pending result keeps its key so a retry reuses the same request.
  const pendingRef = useRef<{ growId: string; key: string } | null>(null);

  const run = useCallback(async (growId: string) => {
    const pending = pendingRef.current;
    const key = pending?.growId === growId ? pending.key : crypto.randomUUID();
    pendingRef.current = { growId, key };
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-coach", {
        body: { mode: "next_steps", growId, idempotencyKey: key },
      });
      // A transport error leaves the server outcome unknown (it may have
      // finished and spent a credit), so the key is kept for the retry, as
      // Coach does once an invocation has started, and the grower is told the
      // outcome is unconfirmed rather than that nothing changed.
      if (error) {
        setOutcome({ kind: "uncertain" });
        return;
      }
      const next = classifyDoctorNextStepsResponse(adaptCreditedAiResponse(data));
      if (next.kind !== "pending") pendingRef.current = null;
      setOutcome(next);
    } catch {
      setOutcome({ kind: "uncertain" });
    } finally {
      setRunning(false);
    }
  }, []);

  return { running, outcome, run };
}
