/**
 * Compatibility redirect for old `/upgrade` bookmarks and campaign links.
 * `/pricing` is the only public plan and checkout surface.
 */

import { Navigate, useSearchParams } from "react-router-dom";

import { buildLegacyUpgradeRedirect } from "@/lib/legacyCheckoutRedirect";

export default function LegacyUpgradeRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate to={buildLegacyUpgradeRedirect({ search: searchParams })} replace />;
}
