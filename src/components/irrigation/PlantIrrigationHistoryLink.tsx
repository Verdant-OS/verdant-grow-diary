/**
 * PlantIrrigationHistoryLink — drop-in seam for a plant surface.
 *
 * A self-contained affordance that opens the plant's irrigation history. This
 * branch mounts nothing; the integrator wires `onOpen` to reveal a
 * <TentIrrigationHistoryPanel tentId={...} plantId={plantId} /> (the plant's
 * tent, filtered to the plant). Presenter-only; no data access.
 */
import { Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PlantIrrigationHistoryLinkProps {
  plantId: string;
  /** Wire this to reveal the tent ledger filtered to this plant. */
  onOpen?: (plantId: string) => void;
  className?: string;
}

export function PlantIrrigationHistoryLink({ plantId, onOpen, className }: PlantIrrigationHistoryLinkProps) {
  if (!plantId) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("min-h-11", className)}
      data-testid="plant-irrigation-history-link"
      onClick={() => onOpen?.(plantId)}
    >
      <Droplets className="h-4 w-4 mr-1.5" aria-hidden /> Irrigation history
    </Button>
  );
}

export default PlantIrrigationHistoryLink;
