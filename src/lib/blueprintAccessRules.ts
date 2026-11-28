/**
 * Server-authoritative Blueprint access decision.
 *
 * Pure: no React, no Supabase, no clock. The caller passes the subscription
 * rows it read for the verified user and `now`. Only Craft (monthly/annual)
 * and existing Founder Lifetime rows carry the `blueprint` capability
 * (planCatalog). Free and Pro are denied. A failed read is denied.
 *
 * Environment rule (AGENTS.md §7): live rows always count; sandbox rows count
 * only when the server resolved the payments environment to sandbox.
 */
import { canUseCapability } from "@/lib/entitlements/capabilityAccess";
import type { LovableSubscriptionRow } from "@/lib/entitlements/lovablePaddleAdapter";
import {
  lovableRowEntitles,
  pickEntitlingLovableRow,
  resolveUnionEntitlements,
} from "@/lib/entitlements/unionEntitlements";

export type BlueprintAccessReason =
  | "allowed"
  | "no_blueprint_plan"
  | "lookup_failed"
  | "signed_out";

export interface BlueprintAccessDecision {
  allowed: boolean;
  reason: BlueprintAccessReason;
}

export interface BlueprintAccessInput {
  liveRows: ReadonlyArray<LovableSubscriptionRow> | null;
  sandboxRows: ReadonlyArray<LovableSubscriptionRow> | null;
  /** True only when the server resolved PAYMENTS_ENVIRONMENT to "sandbox". */
  serverAllowsSandbox: boolean;
  lookupFailed: boolean;
  now: Date;
}

export function decideBlueprintAccess(input: BlueprintAccessInput): BlueprintAccessDecision {
  const { now } = input;
  const liveRow = pickEntitlingLovableRow([...(input.liveRows ?? [])], "live", now);
  if (liveRow && lovableRowEntitles(liveRow, "live", now)) {
    return fromRow(liveRow, "live", now);
  }
  if (input.serverAllowsSandbox) {
    const sandboxRow = pickEntitlingLovableRow([...(input.sandboxRows ?? [])], "sandbox", now);
    if (sandboxRow && lovableRowEntitles(sandboxRow, "sandbox", now)) {
      return fromRow(sandboxRow, "sandbox", now);
    }
  }
  if (input.lookupFailed) return { allowed: false, reason: "lookup_failed" };
  return { allowed: false, reason: "no_blueprint_plan" };
}

function fromRow(
  row: LovableSubscriptionRow,
  environment: "live" | "sandbox",
  now: Date,
): BlueprintAccessDecision {
  const entitlement = resolveUnionEntitlements({
    byoRow: null,
    lovableRow: row,
    expectedBillingEnvironment: environment,
    now,
  });
  return canUseCapability(entitlement, "blueprint")
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "no_blueprint_plan" };
}

/** Exact "sandbox" only; anything else (unset, typo) fails closed to live. */
export function serverAllowsSandboxFromEnv(value: string | undefined): boolean {
  return value?.trim() === "sandbox";
}
