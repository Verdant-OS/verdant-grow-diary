/**
 * usePremiumExportServerGate
 *
 * Server-side authoritative entitlement preflight for premium CSV / report
 * exporters (AI Doctor PDF / Evidence CSV / Report Package, and any future
 * premium export surface). Calls the `premium-export-entitlement` edge
 * function which re-resolves entitlement from `billing_subscriptions`
 * server-side (never trusts the client).
 *
 * Imperative usage: components call `checkPremiumExportEntitlement(feature)`
 * immediately before generating/downloading a premium export. The export
 * MUST NOT proceed unless `{ ok: true }` is returned.
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
  | "ai_doctor_report_package";

export interface PremiumExportGateResult {
  ok: boolean;
  reason: string | null;
  displayPlanId: string | null;
}

export const PREMIUM_EXPORT_PAYWALL_COPY =
  "Premium exports are a Pro feature. Upgrade required to export this report.";

export async function checkPremiumExportEntitlement(
  feature: PremiumExportFeature,
): Promise<PremiumExportGateResult> {
  try {
    const { data, error } = await supabase.functions.invoke(
      "premium-export-entitlement",
      { body: { feature } },
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
    return { ok: false, reason, displayPlanId };
  } catch {
    return { ok: false, reason: "network_error", displayPlanId: null };
  }
}

export function usePremiumExportServerGate() {
  const check = useCallback(
    (feature: PremiumExportFeature) =>
      checkPremiumExportEntitlement(feature),
    [],
  );
  return { check, paywallCopy: PREMIUM_EXPORT_PAYWALL_COPY };
}
