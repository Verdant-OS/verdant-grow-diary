import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PHENO_HUNT_ADD_CANDIDATES_COPY,
  PHENO_HUNT_ADD_CANDIDATES_UI_COPY as COPY,
  orderPickedPhenoPlantIds,
  phenoHuntAddedSummary,
  selectEligiblePhenoHuntPlants,
  type PhenoHuntAddCandidatePlant,
} from "@/lib/phenoHuntAddCandidatesRules";
import {
  addPhenoHuntCandidates,
  listPhenoHuntGrowPlants,
} from "@/lib/phenoHuntAddCandidatesService";

interface Props {
  huntId: string;
  growId: string;
  /** Called after at least one plant was added, so the workspace can reload. */
  onAdded: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; plants: PhenoHuntAddCandidatePlant[] };

/**
 * Workspace "Add candidates": lists plants of the hunt's grow that are not
 * candidates of any hunt and adds the picked ones with the next numbers.
 * Presenter only — eligibility and numbering live in the rules/service.
 */
export default function PhenoHuntAddCandidatesDialog({ huntId, growId, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    setPicked([]);
    setMessages([]);
    void listPhenoHuntGrowPlants(growId).then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { status: "ready", plants: result.plants } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [open, growId]);

  const eligible = useMemo(
    () =>
      load.status === "ready"
        ? selectEligiblePhenoHuntPlants(load.plants, { grow_id: growId })
        : [],
    [load, growId],
  );

  async function submit() {
    const plantIds = orderPickedPhenoPlantIds(picked, eligible);
    if (plantIds.length === 0) {
      setMessages([PHENO_HUNT_ADD_CANDIDATES_COPY.invalid]);
      return;
    }
    setSaving(true);
    const result = await addPhenoHuntCandidates({ huntId, plantIds });
    setSaving(false);
    const nameOf = (id: string) => eligible.find((p) => p.id === id)?.name ?? "Plant";
    const lines = result.failed.map(
      (f) => `${nameOf(f.plantId)}: ${PHENO_HUNT_ADD_CANDIDATES_COPY[f.reason]}`,
    );
    if (result.added.length > 0) {
      lines.unshift(phenoHuntAddedSummary(result.added.map((a) => a.candidateLabel)));
      const addedIds = new Set(result.added.map((a) => a.plantId));
      setLoad((prev) =>
        prev.status === "ready"
          ? {
              status: "ready",
              plants: prev.plants.map((p) =>
                addedIds.has(p.id) ? { ...p, pheno_hunt_id: huntId } : p,
              ),
            }
          : prev,
      );
      setPicked([]);
      onAdded();
    }
    setMessages(lines);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="pheno-add-candidates-open"
      >
        {COPY.trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="pheno-add-candidates-dialog">
          <DialogHeader>
            <DialogTitle>{COPY.title}</DialogTitle>
            <DialogDescription>{COPY.description}</DialogDescription>
          </DialogHeader>
          {load.status === "loading" ? (
            <p className="text-sm text-muted-foreground">{COPY.loading}</p>
          ) : load.status === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              {COPY.loadError}
            </p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="pheno-add-candidates-empty">
              {COPY.empty}
            </p>
          ) : (
            <ul
              className="max-h-72 space-y-2 overflow-y-auto"
              data-testid="pheno-add-candidates-list"
            >
              {eligible.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={picked.includes(p.id)}
                      disabled={saving}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                        )
                      }
                    />
                    {p.name ?? "Unnamed plant"}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {messages.length > 0 ? (
            <div
              role="status"
              className="space-y-1 text-sm"
              data-testid="pheno-add-candidates-result"
            >
              {messages.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={saving || picked.length === 0}
              data-testid="pheno-add-candidates-submit"
            >
              {saving ? COPY.saving : COPY.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
