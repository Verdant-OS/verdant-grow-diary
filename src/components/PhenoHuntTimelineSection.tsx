import { useEffect, useState } from "react";
import { Link } from "@/lib/react-router-compat";
import { Sprout, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deletePhenoHunt, PhenoHuntError } from "@/lib/phenoHuntService";
import { usePhenoHuntActivity } from "@/hooks/usePhenoHuntActivity";
import PhenoTimelineEntries from "@/components/PhenoTimelineEntries";
import { phenoHuntWorkspacePath, plantDetailPath } from "@/lib/routes";
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
 * Lists every hunt on the grow (#568 — not only the newest). Each hunt shows
 * tagged candidates and optional pheno activity. Owner-initiated two-step
 * delete untags linked plants then removes that hunt row.
 */
export default function PhenoHuntTimelineSection({ growId }: Props) {
  const [hunts, setHunts] = useState<PhenoHuntRow[]>([]);
  const [candidatesByHunt, setCandidatesByHunt] = useState<Record<string, CandidateRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!growId) {
        setLoading(false);
        return;
      }
      const { data: huntRows } = await supabase
        .from("pheno_hunts")
        .select("id,name")
        .eq("grow_id", growId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      const list = (huntRows ?? []).map((h) => ({ id: h.id, name: h.name }));
      if (list.length === 0) {
        setHunts([]);
        setCandidatesByHunt({});
        setLoading(false);
        return;
      }
      setHunts(list);

      // Load candidates per hunt in parallel (bounded by hunt count per grow).
      const pairs = await Promise.all(
        list.map(async (h) => {
          const { data: plantRows } = await supabase
            .from("plants")
            .select("id,name,strain,candidate_label,tent_id")
            .eq("pheno_hunt_id", h.id)
            .order("candidate_label", { ascending: true });
          const candidates = (plantRows ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            strain: p.strain ?? null,
            candidate_label: p.candidate_label ?? null,
            tent_id: p.tent_id ?? null,
          }));
          return [h.id, candidates] as const;
        }),
      );
      if (cancelled) return;
      const map: Record<string, CandidateRow[]> = {};
      for (const [id, rows] of pairs) map[id] = rows;
      setCandidatesByHunt(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [growId]);

  const visible = hunts.filter((h) => !removedIds.has(h.id));
  if (loading || visible.length === 0) return null;

  return (
    <section
      className="space-y-4 mt-4"
      aria-label="Pheno Hunts"
      data-testid="pheno-hunt-timeline-section"
      data-hunt-count={visible.length}
    >
      {visible.map((hunt) => (
        <PhenoHuntTimelineHuntCard
          key={hunt.id}
          hunt={hunt}
          candidates={candidatesByHunt[hunt.id] ?? []}
          multi={visible.length > 1}
          onRemoved={(id) => setRemovedIds((prev) => new Set([...prev, id]))}
        />
      ))}
    </section>
  );
}

function PhenoHuntTimelineHuntCard({
  hunt,
  candidates,
  multi,
  onRemoved,
}: {
  hunt: PhenoHuntRow;
  candidates: CandidateRow[];
  multi: boolean;
  onRemoved: (huntId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const activity = usePhenoHuntActivity(hunt.id);

  const onConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deletePhenoHunt({ huntId: hunt.id });
      toast.success("Pheno Hunt deleted. Linked plants were untagged.");
      onRemoved(hunt.id);
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
    <div
      className="glass rounded-2xl p-4"
      aria-label={multi ? `Pheno Hunt: ${hunt.name}` : "Pheno Hunt"}
      data-testid={`pheno-hunt-timeline-hunt-${hunt.id}`}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Sprout className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pheno Hunt
        </h2>
        <Badge variant="outline" className="text-[10px]" data-testid={`pheno-hunt-name-${hunt.id}`}>
          {hunt.name}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {candidates.length} candidates
        </Badge>
        <Link
          to={phenoHuntWorkspacePath(hunt.id)}
          className="text-xs font-medium text-primary hover:underline"
          data-testid={`pheno-hunt-workspace-link-${hunt.id}`}
        >
          Open workspace
        </Link>
        {!confirming && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive ml-auto"
            onClick={() => setConfirming(true)}
            data-testid={`pheno-hunt-delete-btn-${hunt.id}`}
            aria-label={`Delete Pheno Hunt ${hunt.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        )}
      </div>

      {confirming && (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 mb-3"
          data-testid={`pheno-hunt-delete-confirm-${hunt.id}`}
          role="alertdialog"
          aria-label="Delete this Pheno Hunt?"
        >
          <p className="text-sm font-medium mb-1">Delete this Pheno Hunt?</p>
          <p className="text-xs text-muted-foreground mb-3">
            This removes the Pheno Hunt record and untags linked plants. It will not delete plants,
            logs, photos, or timeline history.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={deleting}
              data-testid={`pheno-hunt-delete-confirm-btn-${hunt.id}`}
            >
              {deleting ? "Deleting…" : "Delete Pheno Hunt"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              data-testid={`pheno-hunt-delete-cancel-btn-${hunt.id}`}
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

      {activity.entries.length > 0 && (
        <div
          className="mt-4 border-t border-border/40 pt-3"
          data-testid={`pheno-hunt-activity-${hunt.id}`}
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Pheno activity
          </h3>
          <PhenoTimelineEntries entries={activity.entries} />
        </div>
      )}
    </div>
  );
}
