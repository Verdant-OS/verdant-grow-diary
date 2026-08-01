import { useRef, useState } from "react";
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
  evaluatePlantTentBinding,
  resolveCreateGrowBinding,
  type PlantTentBindingState,
} from "@/lib/createGrowBindingRules";
import { growSetupMessages } from "@/constants/growSetupMessages";

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

interface PlantFormState {
  name: string;
  strain: string;
  tent_id: string;
  stage: string;
  health: string;
  started_at: string;
  plant_type: string;
}

type TentRow = { id: string; name: string; grow_id: string | null };

/**
 * Decide the safe initial tent selection for a dialog open.
 * Compatible default tents are retained; incompatible/unlinked/unavailable
 * defaults are cleared so the original id can never reach a payload.
 */
function initialTentSelection(
  defaultTentId: string | undefined,
  resolvedGrowId: string | null,
  requireTent: boolean,
  tents: ReadonlyArray<TentRow>,
): { tent_id: string; conflict: PlantTentBindingState | null } {
  if (!defaultTentId || !resolvedGrowId) {
    return { tent_id: "none", conflict: null };
  }
  const evaluation = evaluatePlantTentBinding({
    resolvedGrowId,
    selectedTentId: defaultTentId,
    requireTent,
    tents,
  });
  if (evaluation.kind === "ready") {
    return { tent_id: evaluation.tentId, conflict: null };
  }
  return { tent_id: "none", conflict: evaluation };
}

function blankForm(tentId: string): PlantFormState {
  return {
    name: "",
    strain: "",
    tent_id: tentId,
    stage: "seedling",
    health: "healthy",
    started_at: "",
    // "unknown" = Not sure. Deliberately never defaults to photoperiod.
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
  const qc = useQueryClient();
  const { grows, activeGrowId, loading: growsLoading, error: growsError, refresh } = useGrows();
  const { data: allTents = [] } = useTents();
  const tentRows = allTents as TentRow[];

  // Current setup is the source of creation truth. The requested grow prop
  // is only trusted after it matches an RLS-loaded grow.
  const binding = resolveCreateGrowBinding({
    grows,
    growsLoading: !!growsLoading,
    growsError,
    requestedGrowId: defaultGrowId ?? null,
    activeGrowId,
  });
  const resolvedGrowId = binding.kind === "ready" ? binding.growId : null;

  // Filter tent options by the verified resolved grow, not the raw prop.
  const tents = resolvedGrowId
    ? tentRows.filter((t) => t.grow_id === resolvedGrowId)
    : [];

  const initial = initialTentSelection(
    defaultTentId,
    resolvedGrowId,
    requireTent,
    tentRows,
  );

  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PlantFormState>(() => blankForm(initial.tent_id));
  const [tentConflict, setTentConflict] = useState<PlantTentBindingState | null>(
    () => initial.conflict,
  );
  // Nested CreateTentDialog shares the Radix dialog stack; when it closes,
  // Radix may also fire the parent's onOpenChange(false). Ignore that
  // spurious close so plant form fields survive nested tent creation.
  const nestedTentOpenRef = useRef(false);
  const ignoreParentCloseRef = useRef(false);

  // Re-derive a fresh safe initial state whenever the dialog opens so a
  // cancel/close/reopen never retains a stale tent or setup selection.
  function resetSafeState() {
    const next = initialTentSelection(defaultTentId, resolvedGrowId, requireTent, tentRows);
    setForm(blankForm(next.tent_id));
    setTentConflict(next.conflict);
  }

  function handleNestedTentOpenChange(next: boolean) {
    if (next) {
      nestedTentOpenRef.current = true;
      return;
    }
    // Nested just closed. Keep the plant dialog open through the Radix
    // stack unwind by ignoring the next parent close attempt.
    ignoreParentCloseRef.current = true;
    nestedTentOpenRef.current = false;
  }

  function handleOpenChange(next: boolean) {
    if (!next && nestedTentOpenRef.current) return;
    if (!next && ignoreParentCloseRef.current) {
      ignoreParentCloseRef.current = false;
      return;
    }
    setOpen(next);
    if (next) resetSafeState();
    else {
      setForm(blankForm("none"));
      setTentConflict(null);
    }
  }

  function clearTentConflict() {
    setForm((f) => ({ ...f, tent_id: "none" }));
    setTentConflict(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (binding.kind !== "ready") {
      toast.error(growSetupMessages.setupUnavailable.body);
      return;
    }

    // Evaluate the live selection against the resolved grow before any
    // payload is built. A conflicting tent never reaches the insert.
    const tentState = evaluatePlantTentBinding({
      resolvedGrowId: binding.growId,
      selectedTentId: form.tent_id,
      requireTent,
      tents: tentRows,
    });
    if (tentState.kind === "tent_required") {
      toast.error("Choose the connected tent before creating this plant.");
      return;
    }
    if (
      tentState.kind === "tent_unavailable" ||
      tentState.kind === "tent_not_in_setup" ||
      tentState.kind === "different_setup"
    ) {
      setTentConflict(tentState);
      setForm((f) => ({ ...f, tent_id: "none" }));
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
      // Every canonical plant insert carries a verified grow_id.
      grow_id: binding.growId,
    };
    if (tentState.kind === "ready") payload.tent_id = tentState.tentId;
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
    setForm(blankForm("none"));
    setTentConflict(null);
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  function handleNestedTentCreated(tent: { id: string; name: string }) {
    // Preserve every entered plant field; select the new tent only after
    // verifying it belongs to the same resolved grow (the nested dialog
    // was itself bound to resolvedGrowId).
    if (!resolvedGrowId) return;
    const verification = evaluatePlantTentBinding({
      resolvedGrowId,
      selectedTentId: tent.id,
      requireTent,
      // The newly created tent is grow-bound by the nested dialog; include
      // it so verification can pass before the tents query refreshes.
      tents: [...tentRows, { id: tent.id, grow_id: resolvedGrowId }],
    });
    if (verification.kind !== "ready") {
      setTentConflict(verification);
      return;
    }
    setForm((f) => ({ ...f, tent_id: tent.id }));
    setTentConflict(null);
  }

  const showCreateForm = binding.kind === "ready";
  const liveTentState =
    showCreateForm && form.tent_id !== "none"
      ? evaluatePlantTentBinding({
          resolvedGrowId: binding.growId,
          selectedTentId: form.tent_id,
          requireTent,
          tents: tentRows,
        })
      : null;
  const activeConflict =
    tentConflict ??
    (liveTentState &&
    (liveTentState.kind === "different_setup" ||
      liveTentState.kind === "tent_not_in_setup" ||
      liveTentState.kind === "tent_unavailable")
      ? liveTentState
      : null);

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
        {binding.kind === "loading" && (
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground py-4"
            data-testid="create-binding-loading"
          >
            Checking your current setup…
          </p>
        )}
        {binding.kind === "read_error" && (
          <div className="grid gap-3 py-2" data-testid="create-binding-read-error">
            <p className="text-sm font-medium">{growSetupMessages.readError.title}</p>
            <p className="text-sm text-muted-foreground">{growSetupMessages.readError.body}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => refresh?.()}
              data-testid="create-binding-retry"
            >
              {growSetupMessages.readError.cta}
            </Button>
          </div>
        )}
        {binding.kind === "no_setup" && (
          <div className="grid gap-3 py-2" data-testid="create-binding-no-setup">
            <p className="text-sm font-medium">{growSetupMessages.noSetup.title}</p>
            <p className="text-sm text-muted-foreground">{growSetupMessages.noSetup.body}</p>
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={binding.startHref} data-testid="create-binding-start-room">
                {growSetupMessages.noSetup.ctaPrimary}
              </Link>
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        )}
        {(binding.kind === "requested_setup_unavailable" || binding.kind === "choose_setup") && (
          <div className="grid gap-3 py-2" data-testid="create-binding-choose-setup">
            <p className="text-sm font-medium">{growSetupMessages.setupUnavailable.title}</p>
            <p className="text-sm text-muted-foreground">
              {growSetupMessages.setupUnavailable.body}
            </p>
            <Button asChild variant="outline">
              <Link to={binding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
            </Button>
          </div>
        )}
        {showCreateForm && (
          <>
            <p className="text-xs text-muted-foreground -mt-1">
              Start simple. You can add genetics, medium, dates, and notes later. Verdant works best
              once your first plant memory exists.
            </p>
            <p
              className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
              data-testid="create-binding-context"
            >
              <span className="font-medium">
                {growSetupMessages.create.addingTo(binding.setupName)}
              </span>{" "}
              <span className="text-muted-foreground">{growSetupMessages.create.addingToHint}</span>
            </p>
            {activeConflict && (
              <div
                className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 grid gap-2"
                data-testid="create-binding-tent-conflict"
              >
                <p className="text-sm font-medium">
                  {activeConflict.kind === "tent_not_in_setup"
                    ? growSetupMessages.mismatch.unlinkedTentTitle
                    : growSetupMessages.mismatch.tentTitle}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeConflict.kind === "tent_not_in_setup"
                    ? growSetupMessages.mismatch.unlinkedTentBody
                    : growSetupMessages.mismatch.tentBody(binding.setupName)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={clearTentConflict}
                    data-testid="create-binding-choose-tent"
                  >
                    {growSetupMessages.mismatch.ctaChooseTent}
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/grows">{growSetupMessages.mismatch.ctaSwitchSetup}</Link>
                  </Button>
                </div>
              </div>
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
                    defaultGrowId={resolvedGrowId ?? undefined}
                    onCreated={handleNestedTentCreated}
                    onOpenChange={handleNestedTentOpenChange}
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
                <Select
                  value={form.tent_id}
                  onValueChange={(v) => {
                    setForm({ ...form, tent_id: v });
                    setTentConflict(null);
                  }}
                >
                  <SelectTrigger data-testid="create-plant-tent-select">
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
                  !!activeConflict ||
                  (requireTent && form.tent_id === "none")
                }
                className="gradient-leaf text-primary-foreground"
                data-testid="plant-create-submit"
              >
                Create plant
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
