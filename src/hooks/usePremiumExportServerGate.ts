/**
 * usePremiumExportServerGate
 *
 * Server-side authoritative entitlement preflight for premium CSV / report
 * exporters (AI Doctor PDF / Evidence CSV / Report Package, and any future
 * premium export surface). Calls the `premium-export-entitlement` edge
 * function which re-resolves entitlement from `billing_subscriptions`
 * server-side (never trusts the client).
 *
 * Reusable API:
 *   - `checkPremiumExportEntitlement(feature, scope?)` — imperative, returns
 *     a typed `PremiumExportGateResult`.
 *   - `requirePremiumExportAccess(feature, scope?)` — same call, hoisted as
 *     the canonical name used by new premium export buttons.
 *   - `usePremiumExportServerGate()` — hook wrapper that also exposes
 *     `paywallCopy` and `PAYWALL_HEADLINE` for consistent denial UI.
 *
 * Hard constraints:
 *  - Never authoritative on the client. The server's response is the gate.
 *  - No service_role, no fetch of secrets, no plan/founder claims sent.
 *  - No DB writes, no sensor ingest, no automation, no device control.
 *  - Fail closed: any error / non-200 response denies the export.
 */
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";


export type PremiumExportFeature =
  | "ai_doctor_report"
  | "ai_doctor_evidence_csv"
  | "ai_doctor_report_package"
  | "diary_range_report"
  | "post_grow_report";

export type PremiumExportGateState =
  | "allowed"
  | "denied"
  | "invalid_request"
  | "network_error";

export interface PremiumExportScope {
  growId?: string | null;
  tentId?: string | null;
  plantId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface PremiumExportGateResult {
  /** Convenience boolean. `true` only when state === "allowed". */
  ok: boolean;
  state: PremiumExportGateState;
  reason: string | null;
  displayPlanId: string | null;
}

export const PAYWALL_HEADLINE = "Premium exports are a Pro feature.";
export const PAYWALL_UPGRADE_COPY =
  "Upgrade required to export this report.";
export const PREMIUM_EXPORT_PAYWALL_COPY = `${PAYWALL_HEADLINE} ${PAYWALL_UPGRADE_COPY}`;

function classifyDenial(reason: string | null): PremiumExportGateState {
  if (reason === "invalid_request" || reason === "invalid_json") {
    return "invalid_request";
  }
  if (reason === "network_error") return "network_error";
  return "denied";
}

export async function checkPremiumExportEntitlement(
  feature: PremiumExportFeature,
  scope: PremiumExportScope = {},
): Promise<PremiumExportGateResult> {
  try {
    const body: Record<string, unknown> = { feature };
    if (scope.growId) body.grow_id = scope.growId;
    if (scope.tentId) body.tent_id = scope.tentId;
    if (scope.plantId) body.plant_id = scope.plantId;
    if (scope.startDate) body.start_date = scope.startDate;
    if (scope.endDate) body.end_date = scope.endDate;
    // Phase 2b: pass the client-derived billing environment so the server
    // union resolver ignores mismatched Lovable Paddle rows.
    // billing_env is derived server-side; never sent from the client.

    const { data, error } = await supabase.functions.invoke(
      "premium-export-entitlement",
      { body },
    );
    const ok =
      !error &&
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).ok === true;
    if (ok) {
      const d = data as Record<string, unknown>;
      return {
        ok: true,
        state: "allowed",
        reason: null,
        displayPlanId:
          typeof d.display_plan_id === "string" ? d.display_plan_id : null,
      };
    }
    const denial = (data ?? null) as Record<string, unknown> | null;
    const reason =
      (denial && typeof denial.reason === "string"
        ? denial.reason
        : null) ?? "upgrade_required";
    const displayPlanId =
      denial && typeof denial.display_plan_id === "string"
        ? denial.display_plan_id
        : null;
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

/**
 * Canonical name for new callers. Identical behavior to
 * `checkPremiumExportEntitlement`; the rename clarifies intent
 * ("require access before generating bytes").
 */
export const requirePremiumExportAccess = checkPremiumExportEntitlement;

export function usePremiumExportServerGate() {
  const check = useCallback(
    (feature: PremiumExportFeature, scope?: PremiumExportScope) =>
      checkPremiumExportEntitlement(feature, scope),
    [],
  );
  return {
    check,
    require: check,
    paywallCopy: PREMIUM_EXPORT_PAYWALL_COPY,
    paywallHeadline: PAYWALL_HEADLINE,
    paywallUpgradeCopy: PAYWALL_UPGRADE_COPY,
  };
}
