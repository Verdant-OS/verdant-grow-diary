/**
 * LegacyBillingRedirect — presenter-only redirect from `/billing/:plan` to
 * the canonical `/pricing` page (the sole user-facing checkout entry) with
 * a preserved plan preselect and safe `returnTo`.
 *
 * No Paddle calls, no auth reads, no entitlement mutation. Never
 * auto-opens checkout — the grower must explicitly click a Pricing CTA.
 * Pure delegation to `buildLegacyBillingRedirect`.
 */

import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { buildLegacyBillingRedirect } from "@/lib/legacyCheckoutRedirect";

export default function LegacyBillingRedirect() {
  const { plan } = useParams<{ plan: string }>();
  const [searchParams] = useSearchParams();
  const target = buildLegacyBillingRedirect({
    planSlug: plan,
    search: searchParams,
  });
  return <Navigate to={target} replace />;
}
