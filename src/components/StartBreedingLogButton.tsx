import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { breedingLogNewPath } from "@/lib/routes";
import { useAuth } from "@/store/auth";

interface Props {
  growId: string;
  tentId?: string | null;
  className?: string;
}

/**
 * Deep-link to /breeding/log/new pre-scoped to the current grow (and tent when
 * present). Only rendered for authenticated users. Mirrors StartPhenoHuntButton.
 */
export default function StartBreedingLogButton({ growId, tentId, className }: Props) {
  const { user } = useAuth();
  if (!user || !growId) return null;

  const href = breedingLogNewPath(growId, tentId);

  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className={className}
      data-testid="start-breeding-log-btn"
    >
      <Link to={href}>
        <FlaskConical className="h-4 w-4 mr-1.5" />
        Log Breeding Event
      </Link>
    </Button>
  );
}
