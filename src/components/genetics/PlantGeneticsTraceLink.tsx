/**
 * CODEX HANDOFF SEAM.
 *
 * This branch deliberately does NOT edit src/pages/PlantDetail.tsx. Drop this
 * self-contained, typed control into Plant Detail (or any plant surface) to link
 * a plant to its Genetics traceability and screening/quarantine history. It is
 * owner-scoped and presenter-only — no data access of its own.
 *
 * Example:
 *   <PlantGeneticsTraceLink plantId={plant.id} />
 */
import { Link } from "react-router-dom";
import { GitBranch, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { geneticsTracePath, geneticsHealthHistoryPath } from "@/lib/routes";

export interface PlantGeneticsTraceLinkProps {
  plantId: string;
  className?: string;
}

export function PlantGeneticsTraceLink({ plantId, className }: PlantGeneticsTraceLinkProps) {
  if (!plantId) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 min-w-0", className)}>
      <Button asChild variant="outline" size="sm" className="min-h-11">
        <Link to={geneticsTracePath("plant", plantId)}>
          <GitBranch className="h-4 w-4 mr-1.5" aria-hidden /> Genetics trace
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className="min-h-11">
        <Link to={geneticsHealthHistoryPath("plant", plantId)}>
          <ShieldAlert className="h-4 w-4 mr-1.5" aria-hidden /> Screening
        </Link>
      </Button>
    </div>
  );
}

export default PlantGeneticsTraceLink;
