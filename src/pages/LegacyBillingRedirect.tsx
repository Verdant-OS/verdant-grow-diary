/**
 * LegacyBillingRedirect — presenter-only redirect from `/billing/:plan` to
 * the canonical `/upgrade` page with a preserved plan preselect and safe
 * `returnTo`. Slice E of the checkout-flow correction.
 *
 * No Paddle calls, no auth reads, no entitlement mutation. Pure delegation
 * to `buildLegacyBillingRedirect`.
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
