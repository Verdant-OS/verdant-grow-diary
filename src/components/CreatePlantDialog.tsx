import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { useTents } from "@/hooks/use-tents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import CreateTentDialog from "@/components/CreateTentDialog";
import { validatePlantInsertPayload } from "@/lib/plantPayloadValidation";
import { formatAddingToSetup, formatMismatchBody, growSetup } from "@/constants/growSetupMessages";
import {
  buildHardStopView,
  checkTentGrowCompatibility,
  resolveTargetGrow,
  START_YOUR_ROOM_HREF,
  type TentGrowCompatibility,
} from "@/lib/createDialogGrowBindingRules";

const STAGES = [
  { value: "seedling", label: "Seedling" },
  { value: "veg", label: "Vegetative" },
  { value: "flower", label: "Flowering" },
  { value: "flush", label: "Flushing" },
  { value: "harvest", label: "Harvest" },
  { value: "cure", label: "Cure" },
];

const HEALTH = [
  { value: "healthy", label: "Healthy" },
  { value: "watch", label: "Watch" },
  { value: "issue", label: "Issue" },
];

interface Props {
  trigger?: React.ReactNode;
  defaultTentId?: string;
  defaultGrowId?: string;
  /** Guided activation may require a validated tent; generic creation stays nullable. */
  requireTent?: boolean;
  initiallyOpen?: boolean;
  onCreated?: (plant: { id: string; name: string }) => void;
}

type TentRow = { id: string; name: string; grow_id?: string | null };

export default function CreatePlantDialog({
  trigger,
  defaultTentId,
  defaultGrowId,
  requireTent = false,
  initiallyOpen = false,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { grows, activeGrowId, loading: growsLoading } = useGrows();
  const { data: allTents = [], isLoading: tentsLoading } = useTents();

  const targetGrow = resolveTargetGrow({
    pageDefaultGrowId: defaultGrowId,
    activeGrowId,
    grows,
  });
  const hardStop = buildHardStopView({
    targetGrow,
    growCount: grows.length,
    growsLoading,
  });

  const tents = targetGrow
    ? (allTents as TentRow[]).filter(
        (tent) =>
          checkTentGrowCompatibility({
            targetGrowId: targetGrow.id,
            tent,
          }).ok,
      )
    : [];

  const defaultTentCompatibility: TentGrowCompatibility | null =
    defaultTentId && targetGrow
      ? checkTentGrowCompatibility({
          targetGrowId: targetGrow.id,
          tent: (allTents as TentRow[]).find((tent) => tent.id === defaultTentId) ?? {
            grow_id: null,
          },
        })
      : null;

  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [tentIssue, setTentIssue] = useState<TentGrowCompatibility | null>(
    defaultTentCompatibility && !defaultTentCompatibility.ok ? defaultTentCompatibility : null,
  );
  const [form, setForm] = useState({
    name: "",
    strain: "",
    tent_id: "none",
    stage: "seedling",
    health: "healthy",
    started_at: "",
    // "unknown" = Not sure. Deliberately never defaults to photoperiod.
    plant_type: "unknown",
  });

  function compatibleDefaultTentId(): string {
    if (!defaultTentId || !targetGrow) return "none";
    const defaultTent = (allTents as TentRow[]).find((tent) => tent.id === defaultTentId);
    return checkTentGrowCompatibility({
      targetGrowId: targetGrow.id,
      tent: defaultTent ?? { grow_id: null },
    }).ok
      ? defaultTentId
      : "none";
  }

  function resetForm() {
    const compatibility =
      defaultTentId && targetGrow
        ? checkTentGrowCompatibility({
            targetGrowId: targetGrow.id,
            tent: (allTents as TentRow[]).find((tent) => tent.id === defaultTentId) ?? {
              grow_id: null,
            },
          })
        : null;
    setForm({
      name: "",
      strain: "",
      tent_id: compatibleDefaultTentId(),
      stage: "seedling",
      health: "healthy",
      started_at: "",
      plant_type: "unknown",
    });
    setTentIssue(compatibility && !compatibility.ok ? compatibility : null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetForm();
    } else {
      setForm({
        name: "",
        strain: "",
        tent_id: "none",
        stage: "seedling",
        health: "healthy",
        started_at: "",
        plant_type: "unknown",
      });
      setTentIssue(null);
    }
    setOpen(nextOpen);
  }

  const targetGrowId = targetGrow?.id ?? null;

  useEffect(() => {
    if (!open || hardStop.blockSubmit || tentsLoading) return;
    if (!defaultTentId || !targetGrowId) return;

    const defaultTent = (allTents as TentRow[]).find((tent) => tent.id === defaultTentId);
    const compatibility = checkTentGrowCompatibility({
      targetGrowId,
      tent: defaultTent ?? { grow_id: null },
    });
    if (compatibility.ok) {
      setTentIssue((current) => (current && !current.ok ? null : current));
      setForm((current) =>
        current.tent_id === "none" ? { ...current, tent_id: defaultTentId } : current,
      );
      return;
    }
    setTentIssue(compatibility);
    setForm((current) =>
      current.tent_id === defaultTentId ? { ...current, tent_id: "none" } : current,
    );
  }, [allTents, defaultTentId, hardStop.blockSubmit, open, targetGrowId, tentsLoading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (hardStop.blockSubmit) {
      toast.error(hardStop.title);
      return;
    }
    if (!targetGrow) {
      toast.error(hardStop.title || growSetup.noSetup.title);
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (tentIssue && !tentIssue.ok) {
      toast.error(growSetup.mismatch.title);
      return;
    }

    const selectedTent = (allTents as TentRow[]).find((tent) => tent.id === form.tent_id);
    if (form.tent_id !== "none") {
      if (tentsLoading) {
        toast.error("Your tents are still loading. Try again in a moment.");
        return;
      }
      const tentCompatibility = checkTentGrowCompatibility({
        targetGrowId: targetGrow.id,
        tent: selectedTent ?? { grow_id: null },
      });
      if (!tentCompatibility.ok) {
        setTentIssue(tentCompatibility);
        setForm((current) => ({ ...current, tent_id: "none" }));
        toast.error(growSetup.mismatch.title);
        return;
      }
    }
    if (requireTent && !selectedTent) {
      toast.error("Choose the connected tent before creating this plant.");
      return;
    }

    setBusy(true);
    const trimmedStrain = form.strain.trim();
    const payload: Record<string, unknown> = {
      user_id: user.id,
      name: form.name.trim(),
      strain: trimmedStrain || null,
      stage: form.stage,
      health: form.health,
      plant_type: form.plant_type,
      grow_id: targetGrow.id,
    };
    if (selectedTent) payload.tent_id = selectedTent.id;
    if (form.started_at) payload.started_at = new Date(form.started_at).toISOString();

    const validation = validatePlantInsertPayload(payload);
    if (!validation.ok || !validation.value) {
      setBusy(false);
      toast.error(validation.errors[0] ?? "Plant details are incomplete");
      return;
    }

    const { data, error } = await supabase
      .from("plants")
      .insert(validation.value as never)
      .select("id, name")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Plant created");
    trackFunnelEvent("plant_created");
    qc.invalidateQueries({ queryKey: ["plants"] });
    qc.invalidateQueries({ queryKey: ["grow", "plants"] });
    resetForm();
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  const mismatchBlocksSubmit = Boolean(tentIssue && !tentIssue.ok);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
            <Plus className="h-4 w-4" /> New plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">New plant</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add genetics, medium, dates, and notes later. Verdant works best
          once your first plant memory exists.
        </p>
        {hardStop.blockSubmit ? (
          <div
            className="grid gap-3 rounded-xl border border-border/60 bg-muted/40 p-4"
            data-testid="plant-create-setup-hard-stop"
            role="status"
            aria-label={hardStop.ariaLabel}
          >
            <div>
              <p className="font-medium">{hardStop.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{hardStop.body}</p>
            </div>
            {!hardStop.showLoading && (
              <div className="flex flex-wrap gap-2">
                <Button asChild className="gradient-leaf text-primary-foreground">
                  <Link to={START_YOUR_ROOM_HREF} data-testid="plant-create-start-room">
                    {hardStop.primaryLabel}
                  </Link>
                </Button>
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
                  {growSetup.noSetup.ctaDismiss}
                </Button>
              </div>
            )}
          </div>
        ) : targetGrow ? (
          <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{formatAddingToSetup(targetGrow.name)}</p>
            <p className="text-xs text-muted-foreground">{growSetup.create.knownBody}</p>
          </div>
        ) : null}
        {mismatchBlocksSubmit && targetGrow && (
          <div
            className="grid gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2"
            role="alert"
            aria-label={growSetup.mismatch.bannerAriaLabel}
            data-testid="plant-create-setup-mismatch"
          >
            <p className="text-sm font-medium">{growSetup.mismatch.title}</p>
            <p className="text-xs text-muted-foreground">{formatMismatchBody(targetGrow.name)}</p>
            <div>
              <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                <Link to={growSetup.mismatch.finishHref} data-testid="plant-create-finish-setup">
                  {growSetup.mismatch.ctaFinish}
                </Link>
              </Button>
            </div>
          </div>
        )}
        {!hardStop.blockSubmit && !mismatchBlocksSubmit && (
          <form onSubmit={submit} className="grid gap-3">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Plant A"
                data-testid="plant-create-name"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Only a name and stage are required to get started.
              </p>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type (optional)</Label>
              <Select
                value={form.plant_type}
                onValueChange={(v) => setForm({ ...form, plant_type: v })}
              >
                <SelectTrigger data-testid="create-plant-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">Not sure</SelectItem>
                  <SelectItem value="autoflower">Autoflower</SelectItem>
                  <SelectItem value="photoperiod">Photoperiod</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Helps AI Doctor stay gentle and keeps pheno comparisons honest.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Tent{requireTent ? "" : " (optional)"}</Label>
                <CreateTentDialog
                  defaultGrowId={targetGrow?.id ?? defaultGrowId}
                  onCreated={(t) => setForm((f) => ({ ...f, tent_id: t.id }))}
                  trigger={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" /> Add new tent
                    </Button>
                  }
                />
              </div>
              <Select value={form.tent_id} onValueChange={(v) => setForm({ ...form, tent_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!requireTent && <SelectItem value="none">No tent</SelectItem>}
                  {tents.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tents.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  No tents yet. Create a tent first.
                </p>
              )}
            </div>
            <details className="rounded-md border border-border/40 px-3 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                Optional details (enrich later)
              </summary>
              <div className="grid gap-3 pt-3">
                <div>
                  <Label>Strain (optional)</Label>
                  <Input
                    value={form.strain}
                    onChange={(e) => setForm({ ...form, strain: e.target.value })}
                    placeholder="Blue Dream"
                  />
                </div>
                <div>
                  <Label>Health</Label>
                  <Select
                    value={form.health}
                    onValueChange={(v) => setForm({ ...form, health: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HEALTH.map((h) => (
                        <SelectItem key={h.value} value={h.value}>
                          {h.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Started at (optional)</Label>
                  <Input
                    type="date"
                    value={form.started_at}
                    onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                  />
                </div>
              </div>
            </details>
            <Button
              disabled={
                busy ||
                hardStop.blockSubmit ||
                mismatchBlocksSubmit ||
                (requireTent && form.tent_id === "none")
              }
              className="gradient-leaf text-primary-foreground"
              data-testid="plant-create-submit"
            >
              Create plant
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
