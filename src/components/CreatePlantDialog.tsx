import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Link } from "@/lib/react-router-compat";
import CreateTentDialog, { type CreatedTent } from "@/components/CreateTentDialog";
import { validatePlantInsertPayload } from "@/lib/plantPayloadValidation";
import {
  confirmCreatedPlantRow,
  primeConfirmedPlantCaches,
} from "@/lib/confirmedPlantCacheService";
import { recordConfirmedGrowPlantMeta } from "@/hooks/useGrowData";
import {
  buildCreateGrowBindingView,
  canWriteCreateGrowId,
  evaluateSuppliedTentBinding,
  evaluateTentGrowCompatibility,
  plantCreateAllowsTentless,
  resolveInitialPlantTentId,
  resolveSetupName,
  suppliedTentBlocksWrite,
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
const EMPTY_TENT_ROWS: readonly TentRow[] = [];

function uniqueTentById(rows: readonly TentRow[], tentId: string | null | undefined) {
  const id = tentId?.trim();
  if (!id) return null;
  const matches = rows.filter((tent) => tent.id === id);
  return matches.length === 1 ? matches[0] : null;
}

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
    data: loadedTents = EMPTY_TENT_ROWS,
    isLoading: tentsQueryLoading,
    isFetching: tentsFetching,
    isError: tentsError,
    isFetched: tentsFetched,
    refetch: refetchTents,
  } = useTents();
  const [nestedTents, setNestedTents] = useState<TentRow[]>([]);
  const [pendingNestedTentId, setPendingNestedTentId] = useState<string | null>(null);
  const [nestedTentCreatorMounted, setNestedTentCreatorMounted] = useState(false);
  const [tentSelectOpen, setTentSelectOpen] = useState(false);
  // Dialog-level pending flag for presenters; pure rules also receive tentsFetching.
  const tentsLoading = tentsQueryLoading || tentsFetching;

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

  const tentRows = useMemo(() => {
    // React Query can retain its last successful rows when a refresh fails.
    // Those cached remote rows are not authoritative during a read error.
    const rows = tentsError ? EMPTY_TENT_ROWS : (loadedTents as readonly TentRow[]);
    return [
      ...rows,
      ...nestedTents.filter(
        (nestedTent) => !rows.some((loadedTent) => loadedTent.id === nestedTent.id),
      ),
    ];
  }, [loadedTents, nestedTents, tentsError]);
  const tentsLoaded = tentsFetched && !tentsLoading;
  const suppliedTentRow = uniqueTentById(tentRows, defaultTentId);

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

  const tents = targetGrowId
    ? tentRows.filter(
        (tent, _index, rows) =>
          tent.grow_id === targetGrowId &&
          tent.id.trim().length > 0 &&
          rows.filter((candidate) => candidate.id === tent.id).length === 1,
      )
    : [];

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
  const handoffSuppressedRef = useRef(false);
  const mountedRef = useRef(true);
  const [form, setForm] = useState(() => emptyForm(initialTentId));
  /** Once grower explicitly picks a compatible tent after a conflict, allow write. */
  const [explicitCompatiblePick, setExplicitCompatiblePick] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      handoffSuppressedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!open || explicitCompatiblePick) return;
    const nextTentId = defaultTentId && suppliedTent.kind === "ready" ? defaultTentId : "none";
    setForm((current) =>
      current.tent_id === nextTentId ? current : { ...current, tent_id: nextTentId },
    );
  }, [defaultTentId, explicitCompatiblePick, open, suppliedTent.kind]);

  useEffect(() => {
    if (!pendingNestedTentId || !targetGrowId) return;
    const nestedTent = uniqueTentById(tentRows, pendingNestedTentId);
    if (!nestedTent || nestedTent.grow_id !== targetGrowId) return;
    setForm((current) => ({ ...current, tent_id: nestedTent.id }));
    setExplicitCompatiblePick(true);
    setPendingNestedTentId(null);
  }, [pendingNestedTentId, targetGrowId, tentRows]);

  const selectedTentRow = uniqueTentById(tentRows, form.tent_id);
  const selectedTentGrowId = selectedTentRow?.grow_id ?? null;
  const selectedTentIsLocallyVerified =
    uniqueTentById(nestedTents, form.tent_id)?.grow_id === targetGrowId;
  const selectedTentHasVerifiedSource =
    selectedTentIsLocallyVerified || (tentsLoaded && !tentsError);
  const hasVerifiedCompatibleReplacement =
    explicitCompatiblePick &&
    form.tent_id !== defaultTentId &&
    selectedTentHasVerifiedSource &&
    !!selectedTentRow &&
    !!targetGrowId &&
    selectedTentRow.grow_id === targetGrowId;

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
    // A tent returned by the nested creator is verified by that insert result;
    // a still-loading background list must not invalidate it.
    tentsLoading: tentsLoading && !selectedTentIsLocallyVerified,
    tentsFetching: tentsFetching && !selectedTentIsLocallyVerified,
  });

  // Pending/read-error always block. Orphan/mismatch/missing-after-load clear
  // only through a provenance-verified replacement — never tentless.
  const suppliedTentStillBlocksWrite = suppliedTentBlocksWrite(
    suppliedTent,
    hasVerifiedCompatibleReplacement,
    { replacementIsLocallyVerified: selectedTentIsLocallyVerified },
  );
  const tentBlocksWrite = suppliedTentStillBlocksWrite || tentCompat.blockSubmit;
  // A pending/read-error supplied tent is not a replacement workflow. Keep the
  // nested tent writer unavailable until the source rows are verified or the
  // binding contract explicitly permits a compatible replacement.
  const nestedTentCreateBlocked =
    suppliedTent.blockSubmit && !suppliedTent.allowCompatibleReplacement;

  // Wait for the first authoritative supplied-tent read before adding a
  // second tents observer for the nested creator. Once mounted, keep it mounted
  // across refetch/error transitions so that observer cannot toggle itself.
  useEffect(() => {
    if (open && !nestedTentCreateBlocked) setNestedTentCreatorMounted(true);
  }, [open, nestedTentCreateBlocked]);

  const formBlocked = binding.blockSubmit || !canWriteCreateGrowId(targetGrowId) || tentBlocksWrite;

  function handleOpenChange(next: boolean) {
    // The insert may already be durable, so closing cannot cancel it. Let the
    // grower dismiss a stalled refresh, but suppress the later Quick Log
    // handoff so closing never causes a delayed navigation surprise.
    if (!next && busy) handoffSuppressedRef.current = true;
    setOpen(next);
    if (!next) {
      setExplicitCompatiblePick(false);
      setForm(emptyForm(initialTentId));
      setNestedTents([]);
      setPendingNestedTentId(null);
      setNestedTentCreatorMounted(false);
      setTentSelectOpen(false);
    }
  }

  function onTentSelect(v: string) {
    if (v === "none") {
      setForm((current) => ({ ...current, tent_id: "none" }));
      setExplicitCompatiblePick(false);
      return;
    }

    const row = uniqueTentById(tentRows, v);
    if (!row || !targetGrowId || row.grow_id !== targetGrowId) {
      setForm((current) => ({ ...current, tent_id: "none" }));
      setExplicitCompatiblePick(false);
      return;
    }

    setForm((current) => ({ ...current, tent_id: v }));
    setExplicitCompatiblePick(v !== defaultTentId);
  }

  function handleNestedTentCreated(tent: CreatedTent) {
    if (!targetGrowId || tent.grow_id !== targetGrowId) {
      setForm((current) => ({ ...current, tent_id: "none" }));
      setExplicitCompatiblePick(false);
      setPendingNestedTentId(null);
      toast.error(GROW_SETUP_MESSAGES.tentUnavailableBody);
      return;
    }

    setNestedTents((current) => [...current.filter((candidate) => candidate.id !== tent.id), tent]);
    setPendingNestedTentId(tent.id);
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
      if (form.tent_id === "none" || !uniqueTentById(tentRows, form.tent_id)) {
        toast.error(GROW_SETUP_MESSAGES.tentRequiredBody);
        return;
      }
    }

    handoffSuppressedRef.current = false;
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
      .select("*")
      .single();
    if (error) {
      if (mountedRef.current) setBusy(false);
      toast.error(error.message);
      return;
    }
    // The insert is now durable. Record that fact before any cache refresh can
    // stall or the grower can leave; navigation remains refresh-gated below.
    trackFunnelEvent("plant_created");
    const confirmed = confirmCreatedPlantRow(data, {
      ownerId: user.id,
      growId: targetGrowId,
      tentId: validation.value.tent_id ?? null,
    });
    if (!confirmed) {
      if (mountedRef.current) {
        setBusy(false);
        setOpen(false);
      }
      toast.error(
        "Plant was saved, but Verdant could not confirm its details. Refresh before adding another.",
      );
      return;
    }
    await primeConfirmedPlantCaches(qc, user.id, confirmed, {
      onGrowCacheConfirmed: (key) => {
        recordConfirmedGrowPlantMeta(user.id, key);
      },
    });
    // The insert is durable before these reads. Keep the dialog and its handoff
    // pending until both legacy Quick Log and owner-scoped grow views have
    // attempted authoritative reconciliation, matching Start Your Room.
    await Promise.allSettled([
      qc.invalidateQueries({ queryKey: ["plants"] }),
      qc.invalidateQueries({ queryKey: ["grow", "plants"] }),
    ]);
    const stillMounted = mountedRef.current;
    const handoffSuppressed = handoffSuppressedRef.current;
    if (stillMounted) setBusy(false);
    toast.success("Plant created");
    if (!stillMounted || handoffSuppressed) return;
    setForm(emptyForm(initialTentId));
    setExplicitCompatiblePick(false);
    setNestedTents([]);
    setPendingNestedTentId(null);
    setNestedTentCreatorMounted(false);
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
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 space-y-2"
            data-testid="create-plant-requested-unavailable"
            role="alert"
          >
            <p className="text-sm font-semibold">{binding.title}</p>
            <p className="text-xs text-muted-foreground">{binding.body}</p>
            <Button asChild type="button" size="sm" variant="outline">
              <Link to={binding.chooseSetupHref}>{binding.chooseSetupLabel}</Link>
            </Button>
          </div>
        )}
        {binding.showStartRoomHardStop && (
          <div
            className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-3 space-y-2"
            data-testid="create-plant-hard-stop"
            role="alert"
            aria-label={binding.title || GROW_SETUP_MESSAGES.hardStopTitle}
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
                onClick={() => handleOpenChange(false)}
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
              to={binding.chooseSetupHref}
              className="underline underline-offset-2"
              data-testid="create-plant-pick-setup-cta"
            >
              {binding.chooseSetupLabel}
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

        {suppliedTent.kind === "pending" && suppliedTentStillBlocksWrite && (
          <p
            className="rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs"
            data-testid="create-plant-tent-pending"
            role="status"
          >
            <span className="font-semibold block">{suppliedTent.title}</span>
            <span className="text-muted-foreground">{suppliedTent.body}</span>
          </p>
        )}
        {suppliedTent.kind === "unavailable" && suppliedTentStillBlocksWrite && (
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
          suppliedTentStillBlocksWrite && (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs space-y-2"
              data-testid="create-plant-tent-mismatch"
              role="alert"
              aria-label={suppliedTent.title}
            >
              <p className="font-semibold">{suppliedTent.title}</p>
              <p className="text-muted-foreground">
                {suppliedTent.kind === "mismatch" && setupName
                  ? GROW_SETUP_MESSAGES.tentMismatchBodyForSetup(setupName)
                  : suppliedTent.body}
              </p>
              {suppliedTent.finishSetupHref ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    to={suppliedTent.finishSetupHref}
                    data-testid="create-plant-finish-setup-cta"
                  >
                    {suppliedTent.finishSetupLabel}
                  </Link>
                </Button>
              ) : null}
            </div>
          )}
        {!tentCompat.compatible && form.tent_id !== "none" && (
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
                {nestedTentCreatorMounted && (
                  <CreateTentDialog
                    writeBlocked={nestedTentCreateBlocked}
                    defaultGrowId={targetGrowId ?? undefined}
                    onCreated={handleNestedTentCreated}
                    trigger={
                      nestedTentCreateBlocked ? (
                        <span
                          hidden
                          aria-hidden="true"
                          data-testid="create-plant-nested-tent-trigger-placeholder"
                        />
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 gap-1 text-xs"
                        >
                          <Plus className="h-3 w-3" /> Add new tent
                        </Button>
                      )
                    }
                  />
                )}
              </div>
              <Select
                open={tentSelectOpen}
                onOpenChange={setTentSelectOpen}
                value={form.tent_id}
                onValueChange={onTentSelect}
              >
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
