import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface PhenoHuntRow {
  id: string;
  name: string;
}

interface CandidateRow {
  id: string;
  name: string;
  strain: string | null;
  candidate_label: string | null;
}

interface Props {
  growId: string | null | undefined;
}

/**
 * Read-only Pheno Hunt section. Renders only when a pheno_hunts row exists
 * for this grow. Lists tagged candidate plants (name + label + strain).
 * No editing surface.
 */
export default function PhenoHuntTimelineSection({ growId }: Props) {
  const [hunt, setHunt] = useState<PhenoHuntRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!growId) {
        setLoading(false);
        return;
      }
      const { data: huntRow } = await supabase
        .from("pheno_hunts")
        .select("id,name")
        .eq("grow_id", growId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (!huntRow) {
        setHunt(null);
        setCandidates([]);
        setLoading(false);
        return;
      }
      setHunt({ id: huntRow.id, name: huntRow.name });

      const { data: plantRows } = await supabase
        .from("plants")
        .select("id,name,strain,candidate_label")
        .eq("pheno_hunt_id", huntRow.id)
        .order("candidate_label", { ascending: true });

      if (cancelled) return;
      setCandidates(
        (plantRows ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
          candidate_label: p.candidate_label ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId]);

  if (loading || !hunt) return null;

  return (
    <section
      className="glass rounded-2xl p-4 mt-4"
      aria-label="Pheno Hunt"
      data-testid="pheno-hunt-timeline-section"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sprout className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pheno Hunt
        </h2>
        <Badge variant="outline" className="text-[10px] ml-1">
          {hunt.name}
        </Badge>
        <Badge variant="outline" className="text-[10px] ml-auto">
          {candidates.length} candidates
        </Badge>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidates tagged yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-md border border-border/40 bg-secondary/20 p-2 text-sm"
            >
              <Badge variant="secondary" className="text-[10px]">
                {c.candidate_label ?? "—"}
              </Badge>
              <span className="font-medium truncate">{c.name}</span>
              <span className="ml-auto text-xs text-muted-foreground truncate">
                {c.strain ?? "Unknown strain"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
