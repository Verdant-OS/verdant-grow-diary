import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BreedingLogContainer } from "@/components/genetics/BreedingLogContainer";
import { logsPath } from "@/lib/routes";

interface PlantOption {
  id: string;
  name: string;
  tent_id: string | null;
}

interface GrowInfo {
  id: string;
  name: string;
}

/**
 * /breeding/new — log a breeding crossing-workflow event scoped to a grow.
 * Mirrors PhenoHuntNew: loads the grow + its plants, then renders the
 * BreedingLogContainer. The container saves via the breeding_log_save_event
 * RPC and requests approval-required follow-ups in the Action Queue.
 */
export default function BreedingLogNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const growId = params.get("growId");
  const tentId = params.get("tentId");

  const [grow, setGrow] = useState<GrowInfo | null>(null);
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!growId) {
        setLoading(false);
        return;
      }
      const [{ data: growRow }, { data: plantRows }] = await Promise.all([
        supabase.from("grows").select("id,name").eq("id", growId).maybeSingle(),
        (() => {
          let q = supabase
            .from("plants")
            .select("id,name,tent_id")
            .eq("grow_id", growId)
            .eq("is_archived", false);
          if (tentId) q = q.eq("tent_id", tentId);
          return q;
        })(),
      ]);
      if (cancelled) return;
      if (growRow) setGrow({ id: growRow.id, name: growRow.name });
      setPlants(
        (plantRows ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          tent_id: p.tent_id ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId, tentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

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
          Record a crossing-workflow event in{" "}
          <span className="font-medium">{grow.name}</span>
          {tentId ? " (this tent)" : ""}. Verdant will suggest approval-required
          follow-ups in your Action Queue.
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
