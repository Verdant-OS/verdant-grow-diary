/**
 * useEvidenceCoverage — read-only loader for the Evidence Coverage Panel.
 *
 * Strict safety envelope:
 *  - Authenticated user only; RLS enforces ownership.
 *  - Read-only: no .insert/.update/.delete/.upsert/.rpc.
 *  - Selects only the columns needed to classify coverage; never selects
 *    raw_payload, tokens, prompts, completions, or any debug JSON.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  buildEvidenceCoverageViewModel,
  EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL,
  type EvidenceCoverageViewModel,
} from "@/lib/evidenceCoverageViewModel";

export type EvidenceCoverageStatus = "idle" | "loading" | "ok" | "unavailable";

export interface UseEvidenceCoverageState {
  status: EvidenceCoverageStatus;
  viewModel: EvidenceCoverageViewModel;
  error: string | null;
}

export function useEvidenceCoverage(): UseEvidenceCoverageState {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<EvidenceCoverageStatus>("idle");
  const [viewModel, setViewModel] = useState<EvidenceCoverageViewModel>(
    EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const [alertsResp, actionsResp] = await Promise.all([
          supabase.from("alerts").select("id,originating_timeline_events").limit(1000),
          supabase
            .from("action_queue")
            .select("id,originating_timeline_events")
            .limit(1000),
        ]);
        if (alertsResp.error) throw alertsResp.error;
        if (actionsResp.error) throw actionsResp.error;
        if (cancelled) return;
        setViewModel(
          buildEvidenceCoverageViewModel({
            alerts: (alertsResp.data ?? []) as { originating_timeline_events?: unknown }[],
            actions: (actionsResp.data ?? []) as { originating_timeline_events?: unknown }[],
          }),
        );
        setStatus("ok");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setViewModel(EMPTY_EVIDENCE_COVERAGE_VIEW_MODEL);
        setStatus("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user]);

  return { status, viewModel, error };
}

export default useEvidenceCoverage;
