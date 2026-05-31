import { Link } from "react-router-dom";
import { Box, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tentsPath } from "@/lib/routes";

/**
 * Dashboard empty state shown when the authenticated user has no tents.
 *
 * Replaces the environment chart + environment strip block so first-run
 * users do not see "Unknown" metric cards, blank monitoring panels, or
 * anything that could read like fake-live data. Keeps the surrounding
 * onboarding pill / checklist and other honest empty states visible.
 *
 * Pure presenter: no Supabase, no hooks, no writes.
 */
export default function DashboardZeroTentEmptyState() {
  return (
    <section
      data-testid="dashboard-zero-tent-empty-state"
      aria-label="Set up your first tent"
      className="mb-6 rounded-2xl border border-primary/30 bg-primary/5 p-6 md:p-8 text-center"
    >
      <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Box className="h-6 w-6" />
      </div>
      <h2 className="font-display text-xl md:text-2xl font-semibold">
        Set up your first tent
      </h2>
      <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
        Your dashboard starts with a real grow space. Add a tent first,
        then Verdant can organize plants, logs, manual readings, alerts,
        and your grow timeline.
      </p>
      <p
        className="mt-3 text-xs text-muted-foreground"
        data-testid="dashboard-zero-tent-expectation-reset"
      >
        This is your real workspace — demo data stays in <code>/demo</code>.
      </p>
      <div className="mt-5 flex justify-center">
        <Link to={tentsPath()}>
          <Button
            size="lg"
            data-testid="dashboard-zero-tent-create-cta"
            className="gradient-leaf text-primary-foreground"
          >
            Create Tent
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}
