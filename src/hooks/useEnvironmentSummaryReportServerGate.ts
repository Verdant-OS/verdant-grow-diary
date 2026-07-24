/**
 * useEnvironmentSummaryReportServerGate
 *
 * Server-side authoritative entitlement gate for the Environment Summary
 * Report page. Calls the `environment-summary-report-entitlement` edge
 * function which re-resolves entitlement from canonical `public.subscriptions`
 * server-side (never trusts the client).
 *
 * Status semantics:
 *  - "loading"  — request in flight; render a neutral placeholder.
 *  - "allowed"  — server returned 200 ok=true; report rendering permitted.
 *  - "denied"   — server verified that an upgrade is required.
 *  - "error"    — lookup/network/runtime error; treat as NOT allowed and
 *                 never present it as a verified plan denial.
 *
 * Hard constraints:
 *  - Never authoritative on the client. The server's response is the gate.
 *  - No service_role, no fetch of secrets, no plan claims sent in the body.
 *  - No DB writes, no sensor ingest, no automation, no device control.
 */
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type EnvironmentSummaryReportGateStatus =
  | "loading"
  | "allowed"
  | "denied"
  | "error";

export interface EnvironmentSummaryReportGateState {
  status: EnvironmentSummaryReportGateStatus;
  reason: string | null;
  displayPlanId: string | null;
}

export interface EnvironmentSummaryReportGateResult
  extends EnvironmentSummaryReportGateState {
  retry: () => void;
}

export function useEnvironmentSummaryReportServerGate(): EnvironmentSummaryReportGateResult {
  const [state, setState] = useState<EnvironmentSummaryReportGateState>({
    status: "loading",
    reason: null,
    displayPlanId: null,
  });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading", reason: null, displayPlanId: null });
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "environment-summary-report-entitlement",
          { body: {} },
        );
        if (cancelled) return;
        // supabase-js surfaces non-2xx as `error` with a status; treat any
        // explicit denial/error as not-allowed. Fail closed.
        const ok =
          !error &&
          data &&
          typeof data === "object" &&
          (data as Record<string, unknown>).ok === true;
        if (ok) {
          const d = data as Record<string, unknown>;
          setState({
            status: "allowed",
            reason: null,
            displayPlanId:
              typeof d.display_plan_id === "string" ? d.display_plan_id : null,
          });
          return;
        }
        // Inspect denial vs unexpected error. supabase-js puts status info on
        // the FunctionsHttpError; on 403 we treat it as denied; everything
        // else is "error" but still NOT allowed.
        const errAny = error as { context?: { status?: number } } | null;
        const status = errAny?.context?.status;
        const denialData = data as Record<string, unknown> | null;
        const denialReason =
          (denialData && typeof denialData.reason === "string"
            ? denialData.reason
            : null) ?? null;
        const denialPlan =
          denialData && typeof denialData.display_plan_id === "string"
            ? denialData.display_plan_id
            : null;
        if (denialReason === "entitlement_lookup_failed") {
          setState({
            status: "error",
            reason: denialReason,
            displayPlanId: null,
          });
          return;
        }
        if (status === 403 || denialReason === "upgrade_required") {
          setState({
            status: "denied",
            reason: denialReason ?? "upgrade_required",
            displayPlanId: denialPlan,
          });
          return;
        }
        setState({
          status: "error",
          reason: denialReason ?? "unexpected_error",
          displayPlanId: denialPlan,
        });
      } catch {
        if (cancelled) return;
        setState({
          status: "error",
          reason: "network_error",
          displayPlanId: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { ...state, retry };
}
