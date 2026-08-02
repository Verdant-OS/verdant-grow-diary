import { Navigate, useLocation, useParams } from "@/lib/react-router-compat";
import { buildLegacyStrainSlugAliasTarget } from "@/lib/routeAliasRules";

/**
 * Legacy `/strains/:slug` → canonical `/cultivars/:slug` alias.
 *
 * Preserves the decoded slug as one encoded path segment plus the incoming
 * query and hash. Extracted from the Classic `App.tsx` unchanged during the
 * TanStack Start migration — behaviour is identical.
 */
export default function LegacyStrainSlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  return (
    <Navigate
      to={buildLegacyStrainSlugAliasTarget(slug ?? "", location.search, location.hash)}
      replace
    />
  );
}
