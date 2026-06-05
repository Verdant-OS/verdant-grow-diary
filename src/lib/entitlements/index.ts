/**
 * Entitlements public surface — pure logic only.
 *
 * Importers from this barrel must remain free of React, Supabase, and fetch.
 * The client read hook lives at src/hooks/useMyEntitlements.ts.
 */
export type {
  BillingProvider,
  BillingSubscriptionRow,
  Capabilities,
  PlanId,
  ResolvedEntitlement,
  SubscriptionStatus,
} from "./types";
export { FREE_CAPABILITIES } from "./capabilities";
export { PLAN_CATALOG, KNOWN_PLAN_IDS, isKnownPlanId } from "./planCatalog";
export { resolveEntitlements } from "./resolveEntitlements";
