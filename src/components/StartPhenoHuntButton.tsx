import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";

interface Props {
  growId: string;
  tentId?: string | null;
  className?: string;
}

/**
 * Deep-link to /pheno-hunts/new pre-scoped to the current grow (and tent
 * when present). Only rendered for authenticated users.
 */
export default function StartPhenoHuntButton({ growId, tentId, className }: Props) {
  const { user } = useAuth();
  if (!user || !growId) return null;

  const params = new URLSearchParams({ growId });
  if (tentId) params.set("tentId", tentId);
  const href = `/pheno-hunts/new?${params.toString()}`;

  return (
    <Button asChild size="sm" variant="outline" className={className} data-testid="start-pheno-hunt-btn">
      <Link to={href}>
        <Sprout className="h-4 w-4 mr-1.5" />
        Start Pheno Hunt
      </Link>
    </Button>
  );
}
