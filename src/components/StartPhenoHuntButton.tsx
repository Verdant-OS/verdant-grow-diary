import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import { canUseFeature } from "@/lib/featureEntitlements";

interface Props {
  growId: string;
  tentId?: string | null;
  className?: string;
}

/**
 * Deep-link to /pheno-hunts/new pre-scoped to the current grow (and tent
 * when present). Only rendered for authenticated users.
 *
 * Pheno Tracker is a Pro feature: non-entitled users see the same CTA but
 * are routed to /upgrade instead of a page that will show the upgrade gate.
 * Presenter only — the authoritative check lives at the route gate and in
 * the write handler.
 */
export default function StartPhenoHuntButton({ growId, tentId, className }: Props) {
  const { user } = useAuth();
  const { entitlement, loading } = useMyEntitlements();
  if (!user || !growId) return null;

  const entitled = !loading && canUseFeature(entitlement, "pheno_tracker");

  const params = new URLSearchParams({ growId });
  if (tentId) params.set("tentId", tentId);
  const href = entitled ? `/pheno-hunts/new?${params.toString()}` : "/upgrade";
  const label = entitled ? "Start Pheno Hunt" : "Start Pheno Hunt (Pro)";

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={className}
      data-testid="start-pheno-hunt-btn"
      data-entitled={entitled ? "true" : "false"}
    >
      <Link to={href}>
        <Sprout className="h-4 w-4 mr-1.5" />
        {label}
      </Link>
    </Button>
  );
}
