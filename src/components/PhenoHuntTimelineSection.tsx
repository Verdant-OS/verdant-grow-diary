import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sprout, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deletePhenoHunt, PhenoHuntError } from "@/lib/phenoHuntService";
import { plantDetailPath } from "@/lib/routes";
import { toast } from "sonner";

interface PhenoHuntRow {
  id: string;
  name: string;
}

interface CandidateRow {
  id: string;
  name: string;
  strain: string | null;
  candidate_label: string | null;
  tent_id: string | null;
}

interface Props {
  growId: string | null | undefined;
}

/**
 * Read-only Pheno Hunt timeline section.
 *
 * Lists tagged candidate plants as links to plant detail. Adds an
 * owner-initiated, two-step delete that untags linked plants and then
 * removes the hunt row. Editing is intentionally out of scope.
 */
export default function PhenoHuntTimelineSection({ growId }: Props) {
  const [hunt, setHunt] = useState<PhenoHuntRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);

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
        .select("id,name,strain,candidate_label,tent_id")
        .eq("pheno_hunt_id", huntRow.id)
        .order("candidate_label", { ascending: true });

      if (cancelled) return;
      setCandidates(
        (plantRows ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
          candidate_label: p.candidate_label ?? null,
          tent_id: p.tent_id ?? null,
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId]);

  if (loading || !hunt || removed) return null;

  const onConfirmDelete = async () => {
    if (!hunt) return;
    setDeleting(true);
    try {
      await deletePhenoHunt({ huntId: hunt.id });
      toast.success("Pheno Hunt deleted. Linked plants were untagged.");
      setRemoved(true);
    } catch (err) {
      const msg =
        err instanceof PhenoHuntError
          ? "Could not delete Pheno Hunt. No plant records were deleted."
          : "Could not delete Pheno Hunt. No plant records were deleted.";
      toast.error(msg);
      setDeleting(false);
      setConfirming(false);
    }
  };

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
        {!confirming && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setConfirming(true)}
            data-testid="pheno-hunt-delete-btn"
            aria-label="Delete Pheno Hunt"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        )}
      </div>

      {confirming && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 mb-3"
          data-testid="pheno-hunt-delete-confirm"
          role="alertdialog"
          aria-label="Delete this Pheno Hunt?"
        >
          <p className="text-sm font-medium mb-1">Delete this Pheno Hunt?</p>
          <p className="text-xs text-muted-foreground mb-3">
            This removes the Pheno Hunt record and untags linked plants. It
            will not delete plants, logs, photos, or timeline history.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={deleting}
              data-testid="pheno-hunt-delete-confirm-btn"
            >
              {deleting ? "Deleting…" : "Delete Pheno Hunt"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              data-testid="pheno-hunt-delete-cancel-btn"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

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
              <Link
                to={plantDetailPath(c.id, { tentId: c.tent_id })}
                className="font-medium truncate hover:underline"
                data-testid={`pheno-hunt-candidate-link-${c.id}`}
              >
                {c.candidate_label ? `${c.candidate_label} — ${c.name}` : c.name}
              </Link>
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
