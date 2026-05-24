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
import { AlertTriangle, GitMerge, Info, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useGrowPlants } from "@/hooks/useGrowData";
import { useTents } from "@/hooks/use-tents";
import {
  buildPlantMergePreview,
  summarizePlantMergePlan,
  mapMergeRpcError,
  parseMergeRpcSummary,
  type MergeRpcSummary,
  type PlantForMerge,
} from "@/lib/plantMergeRules";
import { buildArchivePlantPayload } from "@/lib/plantTentRelationshipRules";
import {
  getEffectivePlantGrowId,
  validatePlantGrowContextForMerge,
  buildPlantGrowContextRepairPayload,
  canRepairPlantGrowContextFromTent,
  type TentGrowLink,
} from "@/lib/plantGrowContextRules";
import { summarizePlantDropdown } from "@/lib/plantDropdownEligibilityRules";
import {
  formatPlantDropdownEmptyState,
  getPlantDropdownHelperText,
} from "@/lib/plantDropdownReasonRules";

interface Props {
  source: PlantForMerge;
  trigger?: React.ReactNode;
}

/**
 * Safe duplicate-plant merge workflow.
 *
 * Execution path: the server-side RPC `merge_duplicate_plant` runs the
 * whole merge as one transaction. The client only ever calls
 * `supabase.rpc("merge_duplicate_plant", { source_plant_id, target_plant_id })`.
 * No direct multi-table update from the client. Source plant is archived,
 * never hard-deleted; history is never deleted.
 */
export default function PlantMergeDialog({ source, trigger }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [confirmExecute, setConfirmExecute] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MergeRpcSummary | null>(null);

  const { data: allTentsRaw = [] } = useTents();
  const tentLinks = useMemo<TentGrowLink[]>(
    () =>
      (allTentsRaw as Array<{ id: string; grow_id?: string | null }>).map((t) => ({
        id: t.id,
        grow_id: t.grow_id ?? null,
      })),
    [allTentsRaw],
  );

  const sourceEffectiveGrowId = useMemo(
    () => getEffectivePlantGrowId(source, tentLinks),
    [source, tentLinks],
  );
  const sourceCanRepair = useMemo(
    () => canRepairPlantGrowContextFromTent(source, tentLinks),
    [source, tentLinks],
  );

  // Load ALL non-archived plants the user can see and filter to the
  // source's effective grow id client-side. This fixes the "2 of 3
  // plants" bug: a database-level `grow_id = X` filter would drop a
  // candidate whose `grow_id` is null even when its assigned tent
  // belongs to the same grow.
  const { data: allPlants = [] } = useGrowPlants(undefined, undefined);

  const candidates = useMemo(
    () =>
      (allPlants as unknown as Array<{
        id: string;
        name: string;
        strain?: string | null;
        growId?: string | null;
        tentId?: string | null;
        startedAt?: string | null;
        isArchived?: boolean | null;
        lastNote?: string | null;
      }>)
        .filter((p) => p.id !== source.id)
        // Hide archived/merged plants from the target picker. Default
        // queries already exclude them; this is a belt-and-suspenders
        // guard so a stale cache or fallback can never offer one.
        .filter((p) => !p.isArchived)
        .map<PlantForMerge>((p) => ({
          id: p.id,
          name: p.name,
          strain: p.strain ?? null,
          grow_id: p.growId ?? null,
          tent_id: p.tentId ?? null,
          started_at: p.startedAt ?? null,
          is_archived: p.isArchived ?? false,
        }))
        // Same effective grow id only. Cross-grow targets are excluded
        // even if the user briefly held a stale grow_id.
        .filter((p) => {
          if (!sourceEffectiveGrowId) return false;
          const eff = getEffectivePlantGrowId(p, tentLinks);
          return eff === sourceEffectiveGrowId;
        }),
    [allPlants, source.id, sourceEffectiveGrowId, tentLinks],
  );

  const target = candidates.find((p) => p.id === targetId);

  // Counts: queried for preview; the actual merge runs server-side.
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
      setConfirmExecute(false);
      setConfirmArchive(false);
      setResult(null);
      setBusy(false);
    }
  }, [open]);

  const preview = useMemo(() => {
    if (!target) return null;
    return buildPlantMergePreview(source, target, counts.data ?? {});
  }, [source, target, counts.data]);

  const validation = validatePlantGrowContextForMerge(source, target ?? null, tentLinks);

  const canExecuteRpc =
    !!preview && validation.ok && preview.recommendedAction === "execute_via_rpc";
  const canArchiveOnly =
    !!preview &&
    validation.ok &&
    preview.recommendedAction === "archive_source_after_review";

  function invalidateAfterMerge(targetPlantId: string | null) {
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", source.id] });
    if (targetPlantId) {
      qc.invalidateQueries({ queryKey: ["grow", "plant", targetPlantId] });
    }
    qc.invalidateQueries({ queryKey: ["tent"] });
    qc.invalidateQueries({ queryKey: ["grow-events"] });
    qc.invalidateQueries({ queryKey: ["diary"] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
  }

  async function executeMergeViaRpc() {
    if (busy) return; // double-submit guard
    if (!user || !target) return;
    if (!canExecuteRpc) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("merge_duplicate_plant", {
      source_plant_id: source.id,
      target_plant_id: target.id,
    } as never);
    setBusy(false);
    setConfirmExecute(false);
    if (error) {
      const mapped = mapMergeRpcError(error);
      toast.error(mapped.message);
      return;
    }
    const parsed = parseMergeRpcSummary(data);
    if (!parsed) {
      toast.error("Merge succeeded but the summary was not readable.");
      invalidateAfterMerge(target.id);
      return;
    }
    setResult(parsed);
    toast.success(`Merged into "${target.name}".`);
    invalidateAfterMerge(target.id);
  }

  async function archiveSourceAfterReview() {
    if (busy) return;
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
    invalidateAfterMerge(target.id);
    setOpen(false);
  }

  async function repairSourceGrowContext() {
    if (busy) return;
    if (!user) return;
    const payload = buildPlantGrowContextRepairPayload(source, tentLinks);
    if (!payload) return;
    setBusy(true);
    // ONLY updates `grow_id`. Never touches logs, photos, sensor
    // history, alerts, or Action Queue.
    const { error } = await supabase
      .from("plants")
      .update(payload as never)
      .eq("id", source.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Grow context repaired from assigned tent");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plant", source.id] });
    qc.invalidateQueries({ queryKey: ["tent-detail"] });
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
            The source plant is never hard-deleted and logs, photos, and sensor
            history are never deleted.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <MergeSuccessView
            source={source}
            target={target ?? null}
            result={result}
            onClose={() => setOpen(false)}
          />
        ) : (
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

            {source.is_archived && (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                data-testid="plant-merge-source-archived"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-300 shrink-0" />
                  <p className="text-sm text-amber-100">
                    This plant is already archived or merged. Merge is blocked.
                  </p>
                </div>
              </div>
            )}

            {!sourceEffectiveGrowId && (
              <div
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2"
                data-testid="plant-merge-missing-grow-context"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                  <p className="text-sm">
                    This plant is missing grow context. Assign it to a tent in a grow before merging.
                  </p>
                </div>
                {sourceCanRepair && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={repairSourceGrowContext}
                    data-testid="plant-merge-repair-grow-context"
                  >
                    Repair grow context from assigned tent
                  </Button>
                )}
              </div>
            )}

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
                  <Badge
                    variant={canExecuteRpc ? "default" : "secondary"}
                    data-testid="plant-merge-preview-only-badge"
                  >
                    {canExecuteRpc
                      ? "Server transaction"
                      : canArchiveOnly
                        ? "Safe to archive"
                        : "Preview-only"}
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
                          {l.mergeable ? "Will move" : "Stays put"}
                        </span>
                      </li>
                    ))}
                </ul>
                <p
                  className="text-[11px] text-muted-foreground flex items-start gap-1"
                  data-testid="plant-merge-execution-blocked-note"
                >
                  <Info className="h-3 w-3 mt-0.5 shrink-0" />
                  Merge runs as one server-side transaction. Sensor readings
                  stay with the tent and are not moved. The source plant is
                  archived, never hard-deleted.
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
              {canArchiveOnly && (
                <Button
                  disabled={busy}
                  onClick={() => setConfirmArchive(true)}
                  data-testid="plant-merge-archive-source"
                >
                  Archive source as duplicate
                </Button>
              )}
              <Button
                disabled={!canExecuteRpc || busy}
                onClick={() => setConfirmExecute(true)}
                data-testid="plant-merge-execute"
                title={
                  !canExecuteRpc
                    ? "Pick a same-grow target with linked history to merge."
                    : undefined
                }
              >
                Merge plant
              </Button>
            </div>
          </div>
        )}

        {/* Final confirmation before RPC */}
        <AlertDialog open={confirmExecute} onOpenChange={setConfirmExecute}>
          <AlertDialogContent data-testid="confirm-merge-execute">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Merge {source.name} into {target?.name ?? "target"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span className="block">
                  The source plant <strong>{source.name}</strong> will be
                  archived as a merged duplicate.
                </span>
                <span className="block mt-1">
                  History will move to{" "}
                  <strong>{target?.name ?? "the target"}</strong> through a
                  single server-side transaction.
                </span>
                <span className="block mt-1">
                  This cannot be partially completed client-side. Logs, photos,
                  and sensor history will not be deleted.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy || !canExecuteRpc}
                onClick={(e) => {
                  e.preventDefault();
                  void executeMergeViaRpc();
                }}
                data-testid="confirm-merge-execute-submit"
              >
                {busy ? "Merging…" : "Merge plant"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive-only path for zero-history duplicates */}
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
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
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

function MergeSuccessView({
  source,
  target,
  result,
  onClose,
}: {
  source: PlantForMerge;
  target: PlantForMerge | null;
  result: MergeRpcSummary;
  onClose: () => void;
}) {
  return (
    <div className="grid gap-3" data-testid="plant-merge-success">
      <div className="flex items-center gap-2 text-[hsl(var(--success))]">
        <CheckCircle2 className="h-5 w-5" />
        <div className="font-medium" data-testid="plant-merge-success-headline">
          Merged into {target?.name ?? "target plant"}.
        </div>
      </div>
      <div className="rounded-md border border-border/50 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Moved
        </div>
        <ul className="text-sm space-y-1">
          <li
            className="flex items-center justify-between"
            data-testid="plant-merge-moved-grow_events"
          >
            <span>Grow events</span>
            <span>{result.moved.grow_events}</span>
          </li>
          <li
            className="flex items-center justify-between"
            data-testid="plant-merge-moved-diary_entries"
          >
            <span>Diary entries / Quick Logs</span>
            <span>{result.moved.diary_entries}</span>
          </li>
          <li
            className="flex items-center justify-between"
            data-testid="plant-merge-moved-alerts"
          >
            <span>Alerts</span>
            <span>{result.moved.alerts}</span>
          </li>
          <li
            className="flex items-center justify-between"
            data-testid="plant-merge-moved-action_queue"
          >
            <span>Action Queue items</span>
            <span>{result.moved.action_queue}</span>
          </li>
        </ul>
      </div>
      <div
        className="rounded-md border border-border/50 p-3 text-xs text-muted-foreground space-y-1"
        data-testid="plant-merge-skipped-notes"
      >
        <div>• Sensor readings are tent-scoped and were not moved.</div>
        <div>• Pi-ingest idempotency rows are bridge-scoped and were not moved.</div>
        {result.audit_logged === false && (
          <div>• Audit logging is deferred — the summary above is your record.</div>
        )}
        <div>
          • Source plant <strong>{source.name}</strong> is archived as merged.
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={onClose}
          data-testid="plant-merge-success-back"
          asChild
        >
          <Link to="/plants">Back to Plants</Link>
        </Button>
        {target && (
          <Button
            onClick={onClose}
            data-testid="plant-merge-success-view-target"
            asChild
          >
            <Link to={`/plants/${target.id}`}>View Target Plant</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
