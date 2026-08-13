/**
 * Settings Subscription tile — staff operator note.
 *
 * Staff is an operator flag, not a billing plan. The note must never advertise
 * a credit cap that contradicts PLAN_CATALOG for the displayed plan:
 * Founder Lifetime and Pro are 100 AI credits per UTC month; Craft is 300.
 *
 * Staff-on-Free is lifted to a Pro display identity. That path keeps the
 * historical operator-meter copy (10,000). Paid Founder/Craft keep catalog
 * caps even when `isStaff` is true — see applyStaffLift().
 *
 * Pure. No React, no Supabase, no fetch. Spend stays server-side.
 */

import { PLAN_CATALOG } from "./planCatalog";
import type { PlanId } from "./types";

export interface StaffSubscriptionNoteInput {
  isStaff: boolean;
  displayPlanId: PlanId;
}

/** Operator-meter copy for staff whose displayed plan is Free-lifted or Pro. */
export const STAFF_OPERATOR_METER_NOTE =
  "Internal staff — Pro capabilities, 10,000 AI credits/month.";

function catalogMonthlyCreditsLabel(planId: PlanId): string {
  return PLAN_CATALOG[planId].aiMonthlyCredits.toLocaleString("en-US");
}

export function staffSubscriptionNote(
  input: StaffSubscriptionNoteInput | null | undefined,
): string | null {
  if (!input?.isStaff) return null;

  switch (input.displayPlanId) {
    case "founder_lifetime":
      return `Internal staff — operator access. Founder Lifetime AI credits stay at ${catalogMonthlyCreditsLabel("founder_lifetime")} per UTC month.`;
    case "craft_monthly":
    case "craft_annual":
      return `Internal staff — operator access. This plan's AI credits stay at ${catalogMonthlyCreditsLabel(input.displayPlanId)} per UTC month.`;
    case "free":
    case "pro_monthly":
    case "pro_annual":
      return STAFF_OPERATOR_METER_NOTE;
    default: {
      const _exhaustive: never = input.displayPlanId;
      return _exhaustive;
    }
  }
}
