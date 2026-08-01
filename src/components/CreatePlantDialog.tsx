import { useEffect, useMemo, useRef, useState } from "react";
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
import { growSetupMessages } from "@/constants/growSetupMessages";
import {
  filterTentsForResolvedGrow,
  resolveCreateGrowBinding,
  resolvePlantTentBinding,
  resolveSafeInitialPlantTentSelection,
  type PlantTentConflictKind,
} from "@/lib/createGrowBindingRules";

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
  /** Guided activation may require a validated tent; generic creation may omit a tent. */
  requireTent?: boolean;
  initiallyOpen?: boolean;
  onCreated?: (plant: { id: string; name: string }) => void;
}

type TentRow = { id: string; name: string; grow_id: string | null };

function emptyPlantForm(tentId: string | null) {
  return {
    name: "",
    strain: "",
    tent_id: tentId ?? "none",
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
  const {
    grows,
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh,
  } = useGrows();
  const { data: allTents = [] } = useTents();

  const binding = resolveCreateGrowBinding({
    grows,
    growsLoading,
    growsError,
    requestedGrowId: defaultGrowId,
    activeGrowId,
  });

  const resolvedGrowId = binding.kind === "ready" ? binding.growId : null;
  const tents = useMemo(() => {
    if (!resolvedGrowId) return [] as TentRow[];
    return filterTentsForResolvedGrow(allTents as TentRow[], resolvedGrowId);
  }, [allTents, resolvedGrowId]);

  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [tentConflict, setTentConflict] = useState<PlantTentConflictKind>(null);
  const [form, setForm] = useState(() => emptyPlantForm(null));
  const [addingTent, setAddingTent] = useState(false);
  const appliedGrowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      appliedGrowRef.current = null;
      setAddingTent(false);
      return;
    }
    if (!resolvedGrowId) return;
    // Apply safe default tent once per open+grow session. Do not reset when
    // the tents query refreshes after a nested "Add new tent" create.
    if (appliedGrowRef.current === resolvedGrowId) return;
    appliedGrowRef.current = resolvedGrowId;
    const next = resolveSafeInitialPlantTentSelection({
      resolvedGrowId,
      defaultTentId,
      tents: allTents as TentRow[],
    });
    setTentConflict(next.conflict);
    setForm(emptyPlantForm(next.tentId));
  }, [open, resolvedGrowId, defaultTentId, allTents]);

  function resetDialogState() {
    const nextInitial =
      resolvedGrowId != null
        ? resolveSafeInitialPlantTentSelection({
            resolvedGrowId,
            defaultTentId,
            tents: allTents as TentRow[],
          })
        : { tentId: null, conflict: null as PlantTentConflictKind };
    setForm(emptyPlantForm(nextInitial.tentId));
    setTentConflict(nextInitial.conflict);
    appliedGrowRef.current = resolvedGrowId;
    setAddingTent(false);
    setBusy(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      appliedGrowRef.current = null;
      setAddingTent(false);
    }
    resetDialogState();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (binding.kind !== "ready") return;
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (busy) return;

    const tentBinding = resolvePlantTentBinding({
      resolvedGrowId: binding.growId,
      selectedTentId: form.tent_id,
      requireTent,
      tents: allTents as TentRow[],
    });

    if (tentBinding.kind === "tent_required") {
      toast.error("Choose the connected tent before creating this plant.");
      return;
    }
    if (
      tentBinding.kind === "tent_unavailable" ||
      tentBinding.kind === "tent_not_in_setup" ||
      tentBinding.kind === "different_setup"
    ) {
      setTentConflict(tentBinding.kind);
      setForm((f) => ({ ...f, tent_id: "none" }));
      toast.error(
        tentBinding.kind === "tent_not_in_setup"
          ? growSetupMessages.mismatch.unlinkedTentTitle
          : growSetupMessages.mismatch.tentTitle,
      );
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
      grow_id: binding.growId,
    };
    if (tentBinding.kind === "ready") payload.tent_id = tentBinding.tentId;
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
    resetDialogState();
    setOpen(false);
    if (data && onCreated) onCreated(data as { id: string; name: string });
  }

  function renderTentConflict() {
    if (!tentConflict || binding.kind !== "ready") return null;
    if (tentConflict === "tent_not_in_setup") {
      return (
        <div
          className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
          data-testid="create-plant-tent-conflict"
        >
          <p className="font-medium">{growSetupMessages.mismatch.unlinkedTentTitle}</p>
          <p className="text-muted-foreground mt-1">{growSetupMessages.mismatch.unlinkedTentBody}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setTentConflict(null);
                setForm((f) => ({ ...f, tent_id: "none" }));
              }}
            >
              {growSetupMessages.mismatch.ctaChooseTent}
            </Button>
            <Button asChild type="button" size="sm" variant="ghost">
              <Link to="/grows">{growSetupMessages.mismatch.ctaSwitchSetup}</Link>
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div
        className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
        data-testid="create-plant-tent-conflict"
      >
        <p className="font-medium">{growSetupMessages.mismatch.tentTitle}</p>
        <p className="text-muted-foreground mt-1">
          {growSetupMessages.mismatch.tentBody(binding.setupName)}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setTentConflict(null);
              setForm((f) => ({ ...f, tent_id: "none" }));
            }}
          >
            {growSetupMessages.mismatch.ctaChooseTent}
          </Button>
          <Button asChild type="button" size="sm" variant="ghost">
            <Link to="/grows">{growSetupMessages.mismatch.ctaSwitchSetup}</Link>
          </Button>
        </div>
      </div>
    );
  }

  function renderBody() {
    switch (binding.kind) {
      case "loading":
        return (
          <p className="text-sm text-muted-foreground" data-testid="create-plant-binding-loading">
            {growSetupMessages.loading.body}
          </p>
        );
      case "read_error":
        return (
          <div className="grid gap-3" data-testid="create-plant-binding-read-error">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.readError.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{growSetupMessages.readError.body}</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              {growSetupMessages.readError.cta}
            </Button>
          </div>
        );
      case "no_setup":
        return (
          <div className="grid gap-3" data-testid="create-plant-no-setup">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.noSetup.title}</p>
              <p className="text-sm text-muted-foreground mt-1">{growSetupMessages.noSetup.body}</p>
            </div>
            <Button asChild className="gradient-leaf text-primary-foreground">
              <Link to={binding.startHref} data-testid="create-plant-start-room">
                {growSetupMessages.noSetup.ctaPrimary}
              </Link>
            </Button>
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {growSetupMessages.noSetup.ctaSecondary}
            </Button>
          </div>
        );
      case "requested_setup_unavailable":
      case "choose_setup":
        return (
          <div className="grid gap-3" data-testid="create-plant-choose-setup">
            <div>
              <p className="font-medium text-sm">{growSetupMessages.setupUnavailable.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {growSetupMessages.setupUnavailable.body}
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link to={binding.chooseHref}>{growSetupMessages.setupUnavailable.cta}</Link>
            </Button>
          </div>
        );
      case "ready":
        return (
          <>
            <div data-testid="create-plant-setup-context">
              <p className="text-sm font-medium">
                {growSetupMessages.create.addingTo(binding.setupName)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {growSetupMessages.create.addingToHint}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Start simple. You can add genetics, medium, dates, and notes later. Verdant works best
              once your first plant memory exists.
            </p>
            {renderTentConflict()}
            <form onSubmit={submit} className="grid gap-3" data-testid="create-plant-form">
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
                  {!addingTent && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 text-xs"
                      data-testid="create-plant-add-tent"
                      onClick={() => setAddingTent(true)}
                    >
                      <Plus className="h-3 w-3" /> Add new tent
                    </Button>
                  )}
                </div>
                {addingTent ? (
                  <CreateTentDialog
                    presentation="inline"
                    inlineOpen={addingTent}
                    onInlineOpenChange={setAddingTent}
                    defaultGrowId={binding.growId}
                    onCreated={(t) => {
                      const verify = resolvePlantTentBinding({
                        resolvedGrowId: binding.growId,
                        selectedTentId: t.id,
                        requireTent: false,
                        tents: [
                          ...(allTents as TentRow[]),
                          { id: t.id, name: t.name, grow_id: binding.growId },
                        ],
                      });
                      if (verify.kind !== "ready") {
                        toast.error("The new tent could not be verified for this setup.");
                        return;
                      }
                      setTentConflict(null);
                      setForm((f) => ({ ...f, tent_id: t.id }));
                      setAddingTent(false);
                    }}
                  />
                ) : (
                  <>
                    <Select
                      value={form.tent_id}
                      onValueChange={(v) => {
                        setTentConflict(null);
                        setForm({ ...form, tent_id: v });
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
                  </>
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
                disabled={busy || (requireTent && form.tent_id === "none")}
                className="gradient-leaf text-primary-foreground"
                data-testid="plant-create-submit"
              >
                Create plant
              </Button>
            </form>
          </>
        );
      default: {
        const _exhaustive: never = binding;
        return _exhaustive;
      }
    }
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
        {renderBody()}
      </DialogContent>
    </Dialog>
  );
}
