import { Link, useNavigate, useSearchParams } from "@/lib/react-router-compat";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreedingLogContainer } from "@/components/genetics/BreedingLogContainer";
import { logsPath } from "@/lib/routes";
import { useBreedingLogContext } from "@/hooks/useBreedingLogContext";

/**
 * /breeding/log/new — log a breeding crossing-workflow event scoped to a grow.
 * Mirrors PhenoHuntNew: loads the grow + its plants, then renders the
 * BreedingLogContainer. The container saves via the breeding_log_save_event
 * RPC; approval-required Action Queue follow-ups are a separate grower opt-in.
 */
export default function BreedingLogNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const growId = params.get("growId");
  const tentId = params.get("tentId");

  const context = useBreedingLogContext(growId, tentId);

  if (context.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading breeding context"
        className="flex items-center justify-center py-20 text-muted-foreground"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (context.status === "unavailable") {
    return (
      <div className="max-w-xl mx-auto p-4">
        <BackLink to={growId ? `/grows/${growId}` : "/grows"} />
        <section role="alert" className="glass rounded-2xl p-6 text-center space-y-3">
          <h1 className="text-lg font-semibold">Breeding context unavailable</h1>
          <p className="text-sm text-muted-foreground">
            We could not confirm this grow and its plants. Retry before logging an event.
          </p>
          <Button onClick={context.retry}>Retry</Button>
        </section>
      </div>
    );
  }

  const { grow, plants } = context.context;

  if (!growId || !grow) {
    return (
      <div className="max-w-xl mx-auto p-4">
        <BackLink to="/grows" />
        <div className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Grow not found</h1>
          <p className="text-sm text-muted-foreground">
            Log a breeding event from a grow or tent detail page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <BackLink to={`/grows/${growId}`} />

      <header className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-display font-bold">Log Breeding Event</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Record a crossing-workflow event in <span className="font-medium">{grow.name}</span>
          {tentId ? " (this tent)" : ""}. Action Queue follow-up suggestions are optional and
          created only when you select them. Every suggestion is approval-required; Verdant never
          controls devices.
        </p>
      </header>

      {plants.length === 0 ? (
        <section className="glass rounded-2xl p-4">
          <div
            className="rounded-lg border border-dashed p-6 text-center space-y-3"
            data-testid="breeding-empty"
          >
            <h3 className="text-sm font-semibold">No plants in this grow yet</h3>
            <p className="text-xs text-muted-foreground">
              Add a plant before logging a breeding event.
            </p>
            <Button asChild size="sm" data-testid="breeding-empty-cta">
              <Link to={`/grows/${growId}`}>Go to grow to add a plant</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="glass rounded-2xl p-4">
          <BreedingLogContainer
            activeGrowId={growId}
            plants={plants}
            onCreated={() => navigate(logsPath(growId))}
            onCancel={() => navigate(`/grows/${growId}`)}
          />
        </section>
      )}
    </div>
  );
}

function BackLink({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
    >
      <ArrowLeft className="h-4 w-4" />
      Back
    </Link>
  );
}
