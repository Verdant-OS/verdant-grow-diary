import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, GitMerge, Info } from "lucide-react";
import { toast } from "sonner";
import { useGrowPlants } from "@/hooks/useGrowData";
import {
  buildPlantMergePreview,
  summarizePlantMergePlan,
  validatePlantMerge,
  type PlantForMerge,
} from "@/lib/plantMergeRules";
import { buildArchivePlantPayload } from "@/lib/plantTentRelationshipRules";

interface Props {
  source: PlantForMerge;
  trigger?: React.ReactNode;
}

/**
 * Safe duplicate-plant merge workflow.
 *
 * v1 is preview-only for any data type that needs a multi-table update.
 * If the source plant has no linked history, the grower can archive it as
 * a duplicate of the target. History is never deleted; the source plant
 * is never hard-deleted.
 */
export default function PlantMergeDialog({ source, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: allPlants = [] } = useGrowPlants(undefined, source.grow_id ?? undefined);
  const candidates = useMemo(
    () =>
      (allPlants as unknown as Array<{
        id: string;
        name: string;
        strain?: string | null;
        growId?: string | null;
        tentId?: string | null;
        startedAt?: string | null;
      }>)
        .filter((p) => p.id !== source.id)
        .map<PlantForMerge>((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
          grow_id: p.growId ?? null,
          tent_id: p.tentId ?? null,
          started_at: p.startedAt ?? null,
        })),
    [allPlants, source.id],
  );

  const target = candidates.find((p) => p.id === targetId);

  // Counts: only diary_entries + grow_events are queried; others stay "blocked".
  const counts = useQuery({
    queryKey: ["plant-merge-counts", source.id],
    enabled: open && !!user,
    queryFn: async () => {
      const [diary, events] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id", { count: "exact", head: true })
          .eq("plant_id", source.id),
        supabase
          .from("grow_events")
          .select("id", { count: "exact", head: true })
          .eq("plant_id", source.id),
      ]);
      return {
        diaryEntries: diary.count ?? 0,
        growEvents: events.count ?? 0,
      };
    },
  });

  useEffect(() => {
    if (!open) {
      setTargetId("");
      setConfirmArchive(false);
    }
  }, [open]);

  const preview = useMemo(() => {
    if (!target) return null;
    return buildPlantMergePreview(source, target, counts.data ?? {});
  }, [source, target, counts.data]);

  const validation = validatePlantMerge(source, target ?? null);

  async function archiveSourceAfterReview() {
    if (!user || !target) return;
    setBusy(true);
    const { error } = await supabase
      .from("plants")
      .update(buildArchivePlantPayload(source.id) as never)
      .eq("id", source.id);
    setBusy(false);
    setConfirmArchive(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Archived "${source.name}" as a duplicate of "${target.name}"`);
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", source.id] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            data-testid="merge-duplicate-trigger"
          >
            <GitMerge className="h-4 w-4" /> Merge Duplicate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-lg"
        data-testid="plant-merge-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display">Merge duplicate plant</DialogTitle>
          <DialogDescription>
            Choose the plant to keep. We show what would move before any change.
            The source plant is never hard-deleted and logs/photos are never deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="rounded-md border border-border/50 p-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Source (duplicate)
            </div>
            <div className="font-medium">{source.name}</div>
            <div className="text-xs text-muted-foreground">
              {source.strain || "—"}
            </div>
          </div>

          <div>
            <Label>Target plant to keep</Label>
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger data-testid="plant-merge-target-select">
                <SelectValue placeholder="Pick a plant in this grow" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Same grow</SelectLabel>
                  {candidates.length === 0 && (
                    <SelectItem value="__none__" disabled>
                      No other plants in this grow
                    </SelectItem>
                  )}
                  {candidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.strain ? ` · ${p.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {!validation.ok && targetId && (
              <p
                className="text-xs text-destructive mt-1 flex items-center gap-1"
                data-testid="plant-merge-validation-error"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> {validation.reason}
              </p>
            )}
          </div>

          {preview && validation.ok && (
            <div
              className="rounded-md border border-border/50 p-3 space-y-2"
              data-testid="plant-merge-preview"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Merge preview
                </div>
                <Badge variant="secondary" data-testid="plant-merge-preview-only-badge">
                  Preview-only
                </Badge>
              </div>
              <p className="text-sm" data-testid="plant-merge-summary">
                {summarizePlantMergePlan(preview)}
              </p>
              <ul className="text-xs space-y-1">
                {preview.lines
                  .filter((l) => l.sourceCount > 0 || l.mergeable)
                  .map((l) => (
                    <li
                      key={l.key}
                      className="flex items-center justify-between gap-2"
                      data-testid={`plant-merge-line-${l.key}`}
                    >
                      <span>
                        {l.label} — {l.sourceCount}
                      </span>
                      <span
                        className={
                          l.mergeable
                            ? "text-[hsl(var(--success))]"
                            : "text-muted-foreground"
                        }
                      >
                        {l.mergeable ? "Will move" : "Not merged yet"}
                      </span>
                    </li>
                  ))}
              </ul>
              <p
                className="text-[11px] text-muted-foreground flex items-start gap-1"
                data-testid="plant-merge-execution-blocked-note"
              >
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                Merge execution needs a safe transaction/RPC before moving data.
                Source plant will not be hard-deleted and no history will be deleted.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              data-testid="plant-merge-cancel"
            >
              Close
            </Button>
            <Button
              disabled={
                !preview ||
                !validation.ok ||
                preview.recommendedAction !== "archive_source_after_review"
              }
              onClick={() => setConfirmArchive(true)}
              data-testid="plant-merge-archive-source"
              title={
                preview && preview.recommendedAction !== "archive_source_after_review"
                  ? "Source has linked history — safe merge execution not available yet."
                  : undefined
              }
            >
              Archive source as duplicate
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
          <AlertDialogContent data-testid="confirm-merge-archive">
            <AlertDialogHeader>
              <AlertDialogTitle>Archive source plant?</AlertDialogTitle>
              <AlertDialogDescription>
                {target ? (
                  <>
                    "{source.name}" will be archived as a duplicate of{" "}
                    <Link
                      className="underline"
                      to={`/plants/${target.id}`}
                    >
                      {target.name}
                    </Link>
                    . It is not hard-deleted. You can restore it later.
                  </>
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={archiveSourceAfterReview}
                data-testid="confirm-merge-archive-submit"
              >
                Archive duplicate
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
