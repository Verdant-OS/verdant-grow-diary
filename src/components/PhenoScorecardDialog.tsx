/**
 * PhenoScorecardDialog — quick per-candidate 1-5 trait scoring for a Pro Pheno
 * Comparison. Records the grower's subjective ratings into
 * pheno_candidate_scores; on save the comparison refetches and the candidate's
 * "Not recorded" cells become real ratings.
 *
 * Presentation + one upsert only. Verdant never ranks candidates or picks a
 * keeper — this records what the grower entered, nothing more.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  PHENO_SCORECARD_TRAITS,
  PHENO_SCORE_MAX,
  PHENO_SCORE_MIN,
  normalizeScoreTraits,
  type PhenoScoreTraits,
} from "@/lib/phenoScorecardRules";
import { useSaveCandidateScore } from "@/hooks/useSaveCandidateScore";
import type { PhenoScorecardCandidate } from "@/hooks/useGrowPhenoComparison";

interface Props {
  huntId: string;
  candidates: PhenoScorecardCandidate[];
  /** plant_id → stored traits jsonb for prefill. */
  scoreTraitsByPlant: Record<string, unknown>;
  trigger?: React.ReactNode;
}

const RATINGS = Array.from(
  { length: PHENO_SCORE_MAX - PHENO_SCORE_MIN + 1 },
  (_, i) => PHENO_SCORE_MIN + i,
);

export default function PhenoScorecardDialog({
  huntId,
  candidates,
  scoreTraitsByPlant,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [plantId, setPlantId] = useState<string>(candidates[0]?.plantId ?? "");
  const [traits, setTraits] = useState<PhenoScoreTraits>({});
  const save = useSaveCandidateScore();

  // Prefill from stored scores whenever the selected candidate changes (or the
  // dialog opens) so editing an existing scorecard shows current values.
  useEffect(() => {
    if (!open) return;
    setTraits(normalizeScoreTraits(scoreTraitsByPlant[plantId]));
  }, [open, plantId, scoreTraitsByPlant]);

  const ratedCount = useMemo(
    () => PHENO_SCORECARD_TRAITS.filter((t) => typeof traits[t.key] === "number").length,
    [traits],
  );

  function setRating(key: (typeof PHENO_SCORECARD_TRAITS)[number]["key"], value: number) {
    setTraits((prev) => ({
      ...prev,
      // Toggle off when tapping the current value — lets a grower clear a trait.
      [key]: prev[key] === value ? null : value,
    }));
  }

  async function onSave() {
    if (!plantId) return;
    try {
      await save.mutateAsync({ huntId, plantId, traits });
      toast.success("Scorecard saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save scorecard");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" data-testid="pheno-scorecard-open">
            Score candidates
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-lg" data-testid="pheno-scorecard-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Score candidate</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Your own 1–5 read on each trait. Optional — rate what you can; blanks
          stay "Not recorded". Verdant records your call and never picks a keeper.
        </p>

        <div className="grid gap-3">
          <div>
            <Label>Candidate</Label>
            <Select value={plantId} onValueChange={setPlantId}>
              <SelectTrigger data-testid="pheno-scorecard-candidate-select">
                <SelectValue placeholder="Pick a candidate" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.plantId} value={c.plantId}>
                    {c.candidateLabel}
                    {c.plantName ? ` · ${c.plantName}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className="max-h-[46vh] overflow-y-auto pr-1 grid gap-2"
            data-testid="pheno-scorecard-traits"
          >
            {PHENO_SCORECARD_TRAITS.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-between gap-2"
                data-testid={`pheno-scorecard-trait-${t.key}`}
              >
                <span className="text-sm">{t.label}</span>
                <div className="inline-flex gap-1" role="group" aria-label={t.label}>
                  {RATINGS.map((r) => {
                    const active = traits[t.key] === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={active}
                        data-testid={`pheno-scorecard-${t.key}-${r}`}
                        onClick={() => setRating(t.key, r)}
                        className={cn(
                          "h-7 w-7 rounded-md border text-xs font-medium transition",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
                        )}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground" data-testid="pheno-scorecard-rated-count">
              {ratedCount} of {PHENO_SCORECARD_TRAITS.length} traits rated
            </span>
            <Button
              onClick={onSave}
              disabled={save.isPending || !plantId}
              className="gradient-leaf text-primary-foreground"
              data-testid="pheno-scorecard-save"
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save scorecard"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
