import { Link } from "react-router-dom";
import { Wrench, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * LineageRepairCta — grower-facing dashboard/archive CTA that surfaces
 * the `/grow-lineage` repair tool. Visible to every authenticated user
 * (the route itself is `access: "auth"` and owner-scoped via RLS).
 *
 * Intentionally:
 *  - Does NOT trigger any mutation or automation; it's a navigation card.
 *  - Does NOT show operator/internal copy.
 *  - Does NOT render raw IDs or debug detail.
 */
export default function LineageRepairCta({ className }: { className?: string }) {
  return (
    <section
      data-testid="lineage-repair-cta"
      aria-labelledby="lineage-repair-cta-heading"
      className={
        "glass rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 " +
        (className ?? "")
      }
    >
      <div className="h-10 w-10 rounded-xl bg-secondary/40 flex items-center justify-center text-primary shrink-0">
        <Wrench className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3
          id="lineage-repair-cta-heading"
          className="font-display font-semibold text-sm"
        >
          Lineage Repair
        </h3>
        <p
          className="text-xs text-muted-foreground"
          data-testid="lineage-repair-cta-body"
        >
          Fix tents or plants that need to be reconnected to the right grow.
          Changes only happen when you approve them.
        </p>
      </div>
      <Button asChild size="sm" variant="outline" data-testid="lineage-repair-cta-link">
        <Link to="/grow-lineage" aria-label="Open Lineage Repair">
          Open Lineage Repair <ArrowRight className="h-3 w-3 ml-1" />
        </Link>
      </Button>
    </section>
  );
}
