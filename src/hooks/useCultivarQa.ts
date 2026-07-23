/**
 * Client hook for the Pro "Ask about this cultivar" Q&A.
 *
 * Calls the ai-cultivar-qa edge function, which re-checks the caller's paid
 * entitlement server-side and answers strictly from the supplied public
 * cultivar context (see cultivarQaGrounding). This hook never fabricates an
 * answer and surfaces a failure rather than presenting an empty state as fact.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import {
  buildCultivarQaContext,
  validateCultivarQuestion,
} from "@/lib/cultivarQaGrounding";

export type CultivarQaStatus = "idle" | "loading" | "answered" | "error";

export interface CultivarQaState {
  status: CultivarQaStatus;
  answer: string | null;
  /** Machine-readable failure reason for UX copy; never shown as an answer. */
  reason: string | null;
}

export interface UseCultivarQaReturn extends CultivarQaState {
  ask: (cultivar: VerdantCultivarProfile, question: string) => Promise<void>;
  reset: () => void;
}

const IDLE: CultivarQaState = { status: "idle", answer: null, reason: null };

export function useCultivarQa(): UseCultivarQaReturn {
  const [state, setState] = useState<CultivarQaState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const ask = useCallback(
    async (cultivar: VerdantCultivarProfile, question: string) => {
      const validation = validateCultivarQuestion(question);
      if (!validation.ok) {
        setState({ status: "error", answer: null, reason: validation.reason ?? "invalid" });
        return;
      }
      setState({ status: "loading", answer: null, reason: null });
      try {
        const { data, error } = await supabase.functions.invoke("ai-cultivar-qa", {
          body: {
            cultivarSlug: cultivar.slug,
            question: question.trim(),
            context: buildCultivarQaContext(cultivar),
          },
        });
        if (error) {
          setState({ status: "error", answer: null, reason: "request_failed" });
          return;
        }
        const payload = data as { ok?: boolean; answer?: string; reason?: string } | null;
        if (!payload?.ok || typeof payload.answer !== "string" || !payload.answer.trim()) {
          setState({
            status: "error",
            answer: null,
            reason: payload?.reason ?? "no_answer",
          });
          return;
        }
        setState({ status: "answered", answer: payload.answer.trim(), reason: null });
      } catch {
        setState({ status: "error", answer: null, reason: "request_failed" });
      }
    },
    [],
  );

  return { ...state, ask, reset };
}
