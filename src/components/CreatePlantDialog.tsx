import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Link } from "react-router-dom";
import CreateTentDialog from "@/components/CreateTentDialog";
import { validatePlantInsertPayload } from "@/lib/plantPayloadValidation";
import {
  buildCreateGrowBindingHardStop,
  canWriteCreateGrowId,
  evaluateTentGrowCompatibility,
  resolveCreateTargetGrowId,
  resolveInitialPlantTentId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_MESSAGES } from "@/constants/growSetupMessages";

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

type TentRow = { id: string; name: string; grow_id: string | null };

interface Props {
  trigger?: React.ReactNode;
  defaultTentId?: string;
  defaultGrowId?: string;
  /** Guided activation may require a validated tent; generic creation stays nullable. */
  requireTent?: boolean;
  initiallyOpen?: boolean;
  onCreated?: (plant: { id: string; name: string }) => void;
}

function emptyForm(tentId: string) {
  return {
    name: "",
    strain: "",
    tent_id: tentId,
    stage: "seedling",
    health: "healthy",
    started_at: "",
    plant_type: "unknown",
  };
}

export default function CreatePlantDialog({
  trigger,
  defaultTentId,
  defaultGrowId,
  requireTent = false,
  initiallyOpen = false,
  onCreated,
}: Props) {
  const { user } = useAuth();
  const { grows = [], activeGrowId, loading: growsLoading } = useGrows();
  const qc = useQueryClient();
  const { data: allTents = [] } = useTents();

  const targetGrowId = useMemo(
    () =>
      resolveCreateTargetGrowId({
        pageDefaultGrowId: defaultGrowId,
        activeGrowId,
        grows,
      }),
    [defaultGrowId, activeGrowId, grows],
  );
  const hardStop = useMemo(
    () =>
      buildCreateGrowBindingHardStop(
        { targetGrowId, growCount: grows.length, growsLoading },
        "plant",
      ),
    [targetGrowId, grows.length, growsLoading],
  );
  const setupName = useMemo(
    () => resolveSetupName(targetGrowId, grows),
    [targetGrowId, grows],
  );

  const tentRows = allTents as TentRow[];
  // Scope tent options to the resolved target setup when known.
  const tents = targetGrowId
    ? tentRows.filter((t) => t.grow_id === targetGrowId)
    : tentRows;

  const defaultTentGrowId = defaultTentId
    ? tentRows.find((t) => t.id === defaultTentId)?.grow_id ?? null
    : null;
  const initialTentId = resolveInitialPlantTentId({
    defaultTentId,
    tentGrowId: defaultTentGrowId,
    targetGrowId,
  });

  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => emptyForm(initialTentId));

  // Reset tent when open or target changes; never keep incompatible defaultTentId.
  useEffect(() => {
    if (!open) return;
    const tentGrow =
      form.tent_id !== "none"
        ? tentRows.find((t) => t.id === form.tent_id)?.grow_id ?? null
        : null;
    const selectedCompat = evaluateTentGrowCompatibility({
      selectedTentId: form.tent_id,
      tentGrowId: tentGrow,
      targetGrowId,
    });
    if (selectedCompat.clearTentSelection && form.tent_id !== "none") {
      setForm((f) => ({ ...f, tent_id: "none" }));
    }
    // Also re-resolve default when dialog opens with a new defaultTentId
    const nextInitial = resolveInitialPlantTentId({
      defaultTentId,
      tentGrowId: defaultTentGrowId,
      targetGrowId,
    });
    if (form.tent_id === "none" && nextInitial !== "none") {
      setForm((f) => ({ ...f, tent_id: nextInitial }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/target gate
  }, [open, targetGrowId, defaultTentId, defaultTentGrowId]);

  const selectedTentGrowId =
    form.tent_id !== "none"
      ? tentRows.find((t) => t.id === form.tent_id)?.grow_id ?? null
      : null;
  const tentCompat = evaluateTentGrowCompatibility({
    selectedTentId: form.tent_id,
    tentGrowId: selectedTentGrowId,
    targetGrowId,
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Cancel/reopen: clear incompatible tent selection.
      setForm(emptyForm(initialTentId));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (hardStop.blockSubmit || !canWriteCreateGrowId(targetGrowId)) {
      if (hardStop.toastMessage) toast.error(hardStop.toastMessage);
      return;
    }
    if (!tentCompat.compatible) {
      toast.error(tentCompat.title || GROW_SETUP_MESSAGES.tentMismatchTitle);
      return;
    }
    const selectedTent = tents.find((tent) => tent.id === form.tent_id);
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
      // Fail closed: always write grow_id when submitting.
      grow_id: targetGrowId,
    };
    if (form.tent_id && form.tent_id !== "none") payload.tent_id = form.tent_id;
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
    setForm(emptyForm(initialTentId));
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

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
        {hardStop.showStartRoomHardStop && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 space-y-2"
            data-testid="create-plant-hard-stop"
            role="alert"
          >
            <p className="text-sm font-semibold" data-testid="create-plant-hard-stop-title">
              {hardStop.hardStopTitle}
            </p>
            <p className="text-xs text-muted-foreground">{hardStop.hardStopBody}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                <Link to={hardStop.startRoomHref} data-testid="create-plant-start-room-cta">
                  {hardStop.hardStopCta}
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="create-plant-hard-stop-dismiss"
              >
                {hardStop.hardStopSecondary}
              </Button>
            </div>
          </div>
        )}
        {hardStop.showPickGrowHint && !hardStop.showStartRoomHardStop && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="create-plant-pick-setup"
          >
            {GROW_SETUP_MESSAGES.pickSetupToast("plant")}{" "}
            <Link
              to={hardStop.startRoomHref}
              className="underline underline-offset-2"
              data-testid="create-plant-pick-setup-cta"
            >
              {hardStop.hardStopCta}
            </Link>
          </p>
        )}
        {canWriteCreateGrowId(targetGrowId) && (
          <p
            className="text-xs rounded-md border border-primary/30 bg-primary/10 px-3 py-2"
            data-testid="create-plant-target-setup"
          >
            <span className="font-medium">
              {setupName
                ? GROW_SETUP_MESSAGES.addingTo(setupName)
                : GROW_SETUP_MESSAGES.addingToHint}
            </span>
            {setupName ? (
              <span className="block text-muted-foreground mt-0.5">
                {GROW_SETUP_MESSAGES.addingToHint}
              </span>
            ) : null}
          </p>
        )}
        {!tentCompat.compatible && form.tent_id !== "none" && (
          <p
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="create-plant-tent-mismatch"
            role="alert"
          >
            <span className="font-semibold block">{tentCompat.title}</span>
            <span className="text-muted-foreground">{tentCompat.body}</span>
          </p>
        )}
        <form onSubmit={submit} className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Plant A"
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
                defaultGrowId={targetGrowId ?? defaultGrowId}
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
                {tents.map((t: { id: string; name: string }) => (
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
                <Select value={form.health} onValueChange={(v) => setForm({ ...form, health: v })}>
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
              !tentCompat.compatible ||
              (requireTent && form.tent_id === "none")
            }
            className="gradient-leaf text-primary-foreground"
            data-testid="plant-create-submit"
          >
            Create plant
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
