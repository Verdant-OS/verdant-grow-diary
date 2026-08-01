import { useCallback, useEffect, useMemo, useState } from "react";
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
  buildCreateGrowBindingView,
  canWriteCreateGrowId,
  evaluateSuppliedTentBinding,
  evaluateTentGrowCompatibility,
  plantCreateAllowsTentless,
  resolveInitialPlantTentId,
  resolveSetupName,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_MESSAGES } from "@/constants/growSetupMessages";
import { useCreateBindingRetry } from "@/hooks/useCreateBindingRetry";

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
  const {
    grows = [],
    activeGrowId,
    loading: growsLoading,
    error: growsError,
    refresh: refreshGrows,
  } = useGrows();
  const qc = useQueryClient();
  const {
    data: allTents = [],
    isLoading: tentsLoading,
    isFetching: tentsFetching,
    isError: tentsError,
    isFetched: tentsFetched,
    refetch: refetchTents,
  } = useTents();

  const runGrowRefresh = useCallback(() => refreshGrows(), [refreshGrows]);
  const runTentRefresh = useCallback(() => refetchTents(), [refetchTents]);
  const growRetry = useCreateBindingRetry(runGrowRefresh);
  const tentRetry = useCreateBindingRetry(runTentRefresh);

  const binding = useMemo(
    () =>
      buildCreateGrowBindingView(
        {
          pageDefaultGrowId: defaultGrowId,
          activeGrowId,
          grows,
          growsLoading,
          growsError: !!growsError,
        },
        "plant",
      ),
    [defaultGrowId, activeGrowId, grows, growsLoading, growsError],
  );
  const targetGrowId = binding.targetGrowId;
  const setupName = useMemo(() => resolveSetupName(targetGrowId, grows), [targetGrowId, grows]);

  const tentRows = allTents as TentRow[];
  const tentsLoaded = tentsFetched && !tentsLoading;
  const suppliedTentRow = defaultTentId
    ? (tentRows.find((t) => t.id === defaultTentId) ?? null)
    : null;

  const suppliedTent = useMemo(
    () =>
      evaluateSuppliedTentBinding({
        suppliedTentId: defaultTentId,
        tentsLoading,
        tentsFetching,
        tentsError,
        tentsLoaded,
        suppliedTentRow: suppliedTentRow
          ? { id: suppliedTentRow.id, grow_id: suppliedTentRow.grow_id }
          : null,
        targetGrowId,
      }),
    [
      defaultTentId,
      tentsLoading,
      tentsFetching,
      tentsError,
      tentsLoaded,
      suppliedTentRow,
      targetGrowId,
    ],
  );

  const requireTentForWrite =
    requireTent || !!defaultTentId || suppliedTent.requireCompatibleTentSelection;

  const tents = targetGrowId ? tentRows.filter((t) => t.grow_id === targetGrowId) : tentRows;

  const initialTentId = resolveInitialPlantTentId({
    defaultTentId,
    tentGrowId: suppliedTentRow?.grow_id ?? null,
    targetGrowId,
    tentsLoading,
    tentsFetching,
    tentsError,
    tentsLoaded,
  });

  const [open, setOpen] = useState(initiallyOpen);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => emptyForm(initialTentId));
  /** Once grower explicitly picks a compatible tent after a conflict, allow write. */
  const [explicitCompatiblePick, setExplicitCompatiblePick] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Preserve supplied tent id while pending/conflict — never silent tentless escape.
    if (defaultTentId && form.tent_id === "none" && !explicitCompatiblePick) {
      setForm((f) => ({ ...f, tent_id: defaultTentId }));
    }
    if (
      suppliedTent.kind === "ready" &&
      form.tent_id !== defaultTentId &&
      !explicitCompatiblePick
    ) {
      setForm((f) => ({ ...f, tent_id: defaultTentId! }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultTentId, suppliedTent.kind, targetGrowId]);

  const selectedTentGrowId =
    form.tent_id !== "none" ? (tentRows.find((t) => t.id === form.tent_id)?.grow_id ?? null) : null;

  const tentCompat = evaluateTentGrowCompatibility({
    selectedTentId: form.tent_id,
    tentGrowId: selectedTentGrowId,
    targetGrowId,
    requireTentForWrite:
      requireTentForWrite &&
      (suppliedTent.kind === "orphan" ||
        suppliedTent.kind === "mismatch" ||
        suppliedTent.kind === "unavailable" ||
        suppliedTent.kind === "pending" ||
        requireTent ||
        !!defaultTentId),
    tentsLoading,
    tentsFetching,
  });

  // Pending always blocks. Unavailable/orphan/mismatch clear only after a
  // verified compatible replacement (explicitCompatiblePick), never via tentless.
  const tentBlocksWrite =
    (suppliedTent.blockSubmit &&
      (suppliedTent.kind === "pending" ||
        ((suppliedTent.kind === "unavailable" ||
          suppliedTent.kind === "orphan" ||
          suppliedTent.kind === "mismatch") &&
          !explicitCompatiblePick))) ||
    tentCompat.blockSubmit;

  const formBlocked = binding.blockSubmit || !canWriteCreateGrowId(targetGrowId) || tentBlocksWrite;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setExplicitCompatiblePick(false);
      setForm(emptyForm(initialTentId));
    }
  }

  function onTentSelect(v: string) {
    setForm((f) => ({ ...f, tent_id: v }));
    if (v !== "none" && v !== defaultTentId) {
      const row = tentRows.find((t) => t.id === v);
      if (row && targetGrowId && row.grow_id === targetGrowId) {
        setExplicitCompatiblePick(true);
      }
    }
    if (v === defaultTentId) setExplicitCompatiblePick(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (formBlocked || !targetGrowId) {
      if (binding.toastMessage) toast.error(binding.toastMessage);
      else if (suppliedTent.blockSubmit) toast.error(suppliedTent.title);
      else if (tentCompat.blockSubmit) toast.error(tentCompat.title);
      return;
    }
    if (!tentCompat.compatible) {
      toast.error(tentCompat.title || GROW_SETUP_MESSAGES.tentMismatchTitle);
      return;
    }
    if (!plantCreateAllowsTentless({ suppliedTentId: defaultTentId, requireTent })) {
      if (form.tent_id === "none" || !tentRows.some((t) => t.id === form.tent_id)) {
        toast.error(GROW_SETUP_MESSAGES.tentRequiredBody);
        return;
      }
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
    setExplicitCompatiblePick(false);
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

        {binding.showLoading && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
            data-testid="create-plant-loading"
          >
            {binding.body}
          </p>
        )}
        {binding.showReadError && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-3 space-y-2"
            data-testid="create-plant-read-error"
            role="alert"
          >
            <p className="text-sm font-semibold">{binding.title}</p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="create-plant-retry"
              disabled={growRetry.gate.disabled}
              aria-disabled={growRetry.gate.disabled}
              title={
                growRetry.gate.reason === "cooldown"
                  ? GROW_SETUP_MESSAGES.retryCooldownHint
                  : undefined
              }
              onClick={() => void growRetry.attempt()}
            >
              {binding.retryLabel}
            </Button>
            {growRetry.gate.reason === "cooldown" && (
              <p
                className="text-[11px] text-muted-foreground"
                data-testid="create-plant-retry-cooldown"
              >
                {GROW_SETUP_MESSAGES.retryCooldownHint}
              </p>
            )}
          </div>
        )}
        {binding.showRequestedUnavailable && (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-1"
            data-testid="create-plant-requested-unavailable"
            role="alert"
          >
            <p className="text-sm font-semibold">{binding.title}</p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
          </div>
        )}
        {binding.showStartRoomHardStop && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 space-y-2"
            data-testid="create-plant-hard-stop"
            role="alert"
          >
            <p className="text-sm font-semibold" data-testid="create-plant-hard-stop-title">
              {binding.title}
            </p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="gradient-leaf text-primary-foreground">
                <Link to={binding.startRoomHref} data-testid="create-plant-start-room-cta">
                  {binding.primaryCta}
                </Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="create-plant-hard-stop-dismiss"
              >
                {binding.secondaryCta}
              </Button>
            </div>
          </div>
        )}
        {binding.showPickGrowHint && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            data-testid="create-plant-pick-setup"
          >
            {GROW_SETUP_MESSAGES.pickSetupToast("plant")}{" "}
            <Link
              to={binding.startRoomHref}
              className="underline underline-offset-2"
              data-testid="create-plant-pick-setup-cta"
            >
              {binding.primaryCta}
            </Link>
          </p>
        )}
        {binding.kind === "ready" && canWriteCreateGrowId(targetGrowId) && (
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

        {suppliedTent.kind === "pending" && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
            data-testid="create-plant-tent-pending"
            role="status"
          >
            <span className="font-semibold block">{suppliedTent.title}</span>
            <span className="text-muted-foreground">{suppliedTent.body}</span>
          </p>
        )}
        {suppliedTent.kind === "unavailable" && !explicitCompatiblePick && (
          <div
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs space-y-2"
            data-testid="create-plant-tent-unavailable"
            role="alert"
          >
            <p className="font-semibold">{suppliedTent.title}</p>
            <p className="text-muted-foreground">{suppliedTent.body}</p>
            {suppliedTent.showRetry && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="create-plant-tent-retry"
                  disabled={tentRetry.gate.disabled}
                  aria-disabled={tentRetry.gate.disabled}
                  title={
                    tentRetry.gate.reason === "cooldown"
                      ? GROW_SETUP_MESSAGES.retryCooldownHint
                      : undefined
                  }
                  onClick={() => void tentRetry.attempt()}
                >
                  {GROW_SETUP_MESSAGES.readErrorRetry}
                </Button>
                {tentRetry.gate.reason === "cooldown" && (
                  <p
                    className="text-[11px] text-muted-foreground"
                    data-testid="create-plant-tent-retry-cooldown"
                  >
                    {GROW_SETUP_MESSAGES.retryCooldownHint}
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {(suppliedTent.kind === "orphan" || suppliedTent.kind === "mismatch") &&
          !explicitCompatiblePick && (
            <p
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
              data-testid="create-plant-tent-mismatch"
              role="alert"
            >
              <span className="font-semibold block">{suppliedTent.title}</span>
              <span className="text-muted-foreground">{suppliedTent.body}</span>
            </p>
          )}
        {!tentCompat.compatible && form.tent_id !== "none" && suppliedTent.kind === "ready" && (
          <p
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="create-plant-tent-compat"
            role="alert"
          >
            <span className="font-semibold block">{tentCompat.title}</span>
            <span className="text-muted-foreground">{tentCompat.body}</span>
          </p>
        )}

        {!binding.blockSubmit && (
          <form onSubmit={submit} className="grid gap-3" data-testid="create-plant-form">
            <div>
              <Label>Name</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Plant A"
                data-testid="create-plant-name"
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
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>
                  Tent
                  {requireTentForWrite ||
                  !plantCreateAllowsTentless({
                    suppliedTentId: defaultTentId,
                    requireTent,
                  })
                    ? ""
                    : " (optional)"}
                </Label>
                <CreateTentDialog
                  defaultGrowId={targetGrowId ?? defaultGrowId}
                  onCreated={(t) => {
                    setForm((f) => ({ ...f, tent_id: t.id }));
                    setExplicitCompatiblePick(true);
                  }}
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
              <Select value={form.tent_id} onValueChange={onTentSelect}>
                <SelectTrigger data-testid="create-plant-tent-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plantCreateAllowsTentless({
                    suppliedTentId: defaultTentId,
                    requireTent,
                  }) && <SelectItem value="none">No tent</SelectItem>}
                  {tents.map((t: { id: string; name: string }) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {defaultTentId &&
                    !tents.some((t) => t.id === defaultTentId) &&
                    form.tent_id === defaultTentId && (
                      <SelectItem value={defaultTentId}>Selected tent (needs review)</SelectItem>
                    )}
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
              disabled={busy || formBlocked || !tentCompat.compatible}
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
