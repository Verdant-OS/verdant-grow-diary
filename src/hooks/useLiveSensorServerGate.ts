/**
 * useLiveSensorServerGate
 *
 * Server-authoritative entitlement preflight scaffold for FUTURE premium
 * live-sensor surfaces. Mirrors `usePremiumExportServerGate` exactly so
 * any future caller has a single, typed gate to reach for.
 *
 * As of this slice no premium live-sensor surface ships; this hook exists
 * so future surfaces MUST route through it instead of reading
 * `capabilities.liveSensors` directly from the client.
 *
 * Hard constraints:
 *  - Never authoritative on the client. The server's response is the gate.
 *  - No service_role, no fetch of secrets, no plan/founder claims sent.
 *  - No DB writes, no sensor ingest, no automation, no device control.
 *  - Fail closed: any error / non-200 response denies access.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LiveSensorSurface = "live_sensor_stream" | "live_sensor_dashboard_widget";

export type LiveSensorGateState =
  "loading" | "allowed" | "denied" | "invalid_request" | "network_error";

export interface LiveSensorScope {
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
}

export interface LiveSensorGateResult {
  /** Convenience boolean. `true` only when state === "allowed". */
  ok: boolean;
  state: Exclude<LiveSensorGateState, "loading">;
  reason: string | null;
  displayPlanId: string | null;
}

export const LIVE_SENSOR_PAYWALL_HEADLINE = "Live sensor streaming is a Pro feature.";
export const LIVE_SENSOR_PAYWALL_UPGRADE_COPY = "Upgrade required to use live sensor surfaces.";
export const LIVE_SENSOR_PAYWALL_COPY = `${LIVE_SENSOR_PAYWALL_HEADLINE} ${LIVE_SENSOR_PAYWALL_UPGRADE_COPY}`;

function classifyDenial(
  reason: string | null,
): Exclude<LiveSensorGateState, "loading" | "allowed"> {
  if (reason === "invalid_request" || reason === "invalid_json") {
    return "invalid_request";
  }
  if (reason === "network_error") return "network_error";
  return "denied";
}

export async function checkLiveSensorEntitlement(
  surface: LiveSensorSurface,
  scope: LiveSensorScope = {},
): Promise<LiveSensorGateResult> {
  try {
    const body: Record<string, unknown> = { surface };
    if (scope.growId) body.grow_id = scope.growId;
    if (scope.tentId) body.tent_id = scope.tentId;
    if (scope.plantId) body.plant_id = scope.plantId;
    // billing_env is derived server-side; never sent from the client.

    const { data, error } = await supabase.functions.invoke("live-sensor-entitlement", { body });
    const ok =
      !error && data && typeof data === "object" && (data as Record<string, unknown>).ok === true;
    if (ok) {
      const d = data as Record<string, unknown>;
      return {
        ok: true,
        state: "allowed",
        reason: null,
        displayPlanId: typeof d.display_plan_id === "string" ? d.display_plan_id : null,
      };
    }
    const denial = (data ?? null) as Record<string, unknown> | null;
    const reason =
      (denial && typeof denial.reason === "string" ? denial.reason : null) ?? "upgrade_required";
    const displayPlanId =
      denial && typeof denial.display_plan_id === "string" ? denial.display_plan_id : null;
    return {
      ok: false,
      state: classifyDenial(reason),
      reason,
      displayPlanId,
    };
  } catch {
    return {
      ok: false,
      state: "network_error",
      reason: "network_error",
      displayPlanId: null,
    };
  }
}

export const requireLiveSensorAccess = checkLiveSensorEntitlement;

/**
 * React hook variant. Triggers a preflight on mount + when scope changes;
 * exposes `{ state, result }` with a `"loading"` state during the call.
 *
 * Each decision is bound to the scope it was evaluated for. Until the
 * preflight for the CURRENT scope settles, `state` is "loading" and
 * `result` is null — including the first render after a scope change,
 * before the effect runs. Completions of superseded requests are ignored
 * (request-local cancellation), so a late response for an earlier scope can
 * never overwrite the current decision. Every scope transition discards the
 * stored decision, so revisiting a scope (A -> B -> A) never reuses the
 * earlier visit's result; only the fresh preflight for this visit counts.
 * `evaluatedTentId` is the tent the returned decision was evaluated for
 * (null when unscoped or pending).
 */
export function useLiveSensorServerGate(surface: LiveSensorSurface, scope: LiveSensorScope = {}) {
  const scopeKey = `${surface}|${scope.growId ?? ""}|${scope.tentId ?? ""}|${scope.plantId ?? ""}`;
  const [decision, setDecision] = useState<{
    key: string;
    tentId: string | null;
    result: LiveSensorGateResult;
  } | null>(null);
  // Scope-visit identity: on any transition, drop the previous decision during
  // render (React re-renders before committing), so no render of the new
  // visit can see a decision from an earlier visit of the same scope.
  const [visitKey, setVisitKey] = useState(scopeKey);
  if (visitKey !== scopeKey) {
    setVisitKey(scopeKey);
    setDecision(null);
  }

  useEffect(() => {
    let cancelled = false;
    const tentId = scope.tentId ?? null;
    void checkLiveSensorEntitlement(surface, scope).then((r) => {
      if (cancelled) return;
      setDecision({ key: scopeKey, tentId, result: r });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, scopeKey]);

  const current = decision !== null && decision.key === scopeKey ? decision : null;
  const state: LiveSensorGateState = current ? current.result.state : "loading";
  const result: LiveSensorGateResult | null = current ? current.result : null;
  const evaluatedTentId: string | null = current ? current.tentId : null;

  const recheck = useCallback(
    () => checkLiveSensorEntitlement(surface, scope),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surface, scopeKey],
  );

  return {
    state,
    result,
    evaluatedTentId,
    recheck,
    require: checkLiveSensorEntitlement,
    paywallCopy: LIVE_SENSOR_PAYWALL_COPY,
    paywallHeadline: LIVE_SENSOR_PAYWALL_HEADLINE,
    paywallUpgradeCopy: LIVE_SENSOR_PAYWALL_UPGRADE_COPY,
  };
}
