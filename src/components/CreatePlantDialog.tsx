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
  canSubmitPlantCreate,
  evaluatePlantTentBinding,
  resolveCreateGrowBinding,
  resolveInitialTentSelection,
  type CreateGrowOption,
  type PlantTentBindingState,
} from "@/lib/createGrowBindingRules";
import {
  CHOOSE_SETUP_HREF,
  growSetupMessages,
} from "@/constants/growSetupMessages";

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

const EMPTY_GROWS: CreateGrowOption[] = [];

interface Props {
  trigger?: React.ReactNode;
  defaultTentId?: string;
  defaultGrowId?: string;
  /** Guided activation may require a validated tent; generic creation stays nullable. */
  requireTent?: boolean;
  initiallyOpen?: boolean;
  onCreated?: (plant: { id: string; name: string }) => void;
}

type PlantFormState = {
  name: string;
  strain: string;
  tent_id: string;
  stage: string;
  health: string;
  started_at: string;
  plant_type: string;
};

function buildEmptyForm(tentId: string): PlantFormState {
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

function renderTentConflict(
  conflict: PlantTentBindingState,
  setupName: string,
  onClearConflict: () => void,
) {
  if (conflict.kind === "different_setup") {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs" data-testid="create-plant-tent-conflict">
        <p className="font-medium">{growSetupMessages.mismatch.tentTitle}</p>
        <p className="text-muted-foreground">{growSetupMessages.mismatch.tentBody(setupName)}</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClearConflict}>
            {growSetupMessages.mismatch.ctaChooseTent}
          </Button>
          <Button asChild type="button" size="sm" variant="ghost">
            <Link to={CHOOSE_SETUP_HREF}>{growSetupMessages.mismatch.ctaSwitchSetup}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (conflict.kind === "tent_not_in_setup" || conflict.kind === "tent_unavailable") {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs" data-testid="create-plant-tent-conflict">
        <p className="font-medium">{growSetupMessages.mismatch.unlinkedTentTitle}</p>
        <p className="text-muted-foreground">{growSetupMessages.mismatch.unlinkedTentBody}</p>
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onClearConflict}>
          {growSetupMessages.mismatch.ctaChooseTent}
        </Button>
      </div>
    );
  }

  return null;
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
  const qc = useQueryClient();
  const {
    grows: loadedGrows,
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh: refreshGrows,
  } = useGrows();
  const grows = loadedGrows ?? EMPTY_GROWS;
  const { data: allTents = [] } = useTents();
  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [openSession, setOpenSession] = useState(0);
  const [tentConflict, setTentConflict] = useState<PlantTentBindingState | null>(null);
  const [form, setForm] = useState<PlantFormState>(() => buildEmptyForm("none"));

  const growBinding = useMemo(
    () =>
      resolveCreateGrowBinding({
        grows,
        growsLoading,
        growsError,
        requestedGrowId: defaultGrowId,
        activeGrowId,
      }),
    [grows, growsLoading, growsError, defaultGrowId, activeGrowId],
  );

  const scopedTents = useMemo(() => {
    if (growBinding.kind !== "ready") return [];
    return (allTents as Array<{ id: string; name: string; grow_id: string | null }>).filter(
      (tent) => tent.grow_id === growBinding.growId,
    );
  }, [allTents, growBinding]);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setTentConflict(null);
      setForm(buildEmptyForm("none"));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setOpenSession((session) => session + 1);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (growBinding.kind === "loading") return;

    const initial = resolveInitialTentSelection({
      binding: growBinding,
      defaultTentId,
      requireTent,
      tents: allTents as Array<{ id: string; grow_id: string | null }>,
    });

    setTentConflict(initial.conflict);
    setForm((current) => {
      const isPristine = current.name.trim().length === 0 && current.strain.trim().length === 0;
      if (!isPristine) return current;
      return buildEmptyForm(initial.tentId);
    });
  }, [open, openSession, growBinding, defaultTentId, requireTent, allTents]);

  const tentBinding = useMemo(() => {
    if (growBinding.kind !== "ready") {
      return { kind: "tent_required" as const };
    }
    return evaluatePlantTentBinding({
      resolvedGrowId: growBinding.growId,
      selectedTentId: form.tent_id,
      requireTent,
      tents: allTents as Array<{ id: string; grow_id: string | null }>,
    });
  }, [growBinding, form.tent_id, requireTent, allTents]);

  const submitAllowed =
    tentConflict === null && canSubmitPlantCreate({ binding: growBinding, tentBinding });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!submitAllowed || growBinding.kind !== "ready") return;
    if (!user) {
      toast.error("Not signed in");
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
      grow_id: growBinding.growId,
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
    setForm(buildEmptyForm("none"));
    setTentConflict(null);
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  function handleNestedTentCreated(tent: { id: string; name: string }) {
    if (growBinding.kind !== "ready") return;
    const evaluation = evaluatePlantTentBinding({
      resolvedGrowId: growBinding.growId,
      selectedTentId: tent.id,
      requireTent,
      tents: allTents as Array<{ id: string; grow_id: string | null }>,
    });
    if (evaluation.kind !== "ready") {
      setTentConflict(evaluation);
      return;
    }
    setTentConflict(null);
    setForm((current) => ({ ...current, tent_id: tent.id }));
  }

  function renderBody() {
    if (growBinding.kind === "loading") {
      return (
        <p className="text-sm text-muted-foreground" data-testid="create-plant-loading">
          Loading your current setup…
        </p>
      );
    }

    if (growBinding.kind === "read_error") {
      return (
        <div className="grid gap-3" data-testid="create-plant-read-error">
          <p className="text-sm font-medium">{growSetupMessages.readError.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.readError.body}</p>
          <Button type="button" variant="outline" onClick={() => void refreshGrows()}>
            {growSetupMessages.readError.cta}
          </Button>
        </div>
      );
    }

    if (growBinding.kind === "no_setup") {
      return (
        <div className="grid gap-3" data-testid="create-plant-no-setup">
          <p className="text-sm font-medium">{growSetupMessages.noSetup.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.noSetup.body}</p>
          <div className="flex gap-2">
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={growBinding.startHref}>{growSetupMessages.noSetup.ctaPrimary}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        </div>
      );
    }

    if (
      growBinding.kind === "requested_setup_unavailable" ||
      growBinding.kind === "choose_setup"
    ) {
      return (
        <div className="grid gap-3" data-testid="create-plant-setup-unavailable">
          <p className="text-sm font-medium">{growSetupMessages.setupUnavailable.title}</p>
          <p className="text-xs text-muted-foreground">{growSetupMessages.setupUnavailable.body}</p>
          <Button asChild variant="outline">
            <Link to={growBinding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
          </Button>
        </div>
      );
    }

    return (
      <>
        <div
          className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
          data-testid="create-plant-setup-context"
        >
          <p className="font-medium">{growSetupMessages.create.addingTo(growBinding.setupName)}</p>
          <p className="text-muted-foreground">{growSetupMessages.create.addingToHint}</p>
        </div>
        {tentConflict &&
          renderTentConflict(tentConflict, growBinding.setupName, () => {
            setTentConflict(null);
            setForm((current) => ({ ...current, tent_id: "none" }));
          })}
        <p className="text-xs text-muted-foreground -mt-1">
          Start simple. You can add genetics, medium, dates, and notes later. Verdant works best
          once your first plant memory exists.
        </p>
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
                defaultGrowId={growBinding.growId}
                onCreated={handleNestedTentCreated}
                trigger={
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 gap-1 text-xs"
                    data-testid="create-plant-add-tent"
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
                {scopedTents.map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scopedTents.length === 0 && (
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
            disabled={busy || !submitAllowed}
            className="gradient-leaf text-primary-foreground"
            data-testid="plant-create-submit"
          >
            Create plant
          </Button>
        </form>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
