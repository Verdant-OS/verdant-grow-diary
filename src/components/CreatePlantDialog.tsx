import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import {
  plantStartDateInputMax,
  plantStartDateInputToIso,
  plantStartDateSaveMessage,
} from "@/lib/plantStartDateRules";
import { validatePlantInsertPayload } from "@/lib/plantPayloadValidation";
import {
  PLANT_HEALTH_NOT_ASSESSED_LABEL,
  PLANT_HEALTH_NOT_ASSESSED_OPTION,
  buildPlantHealthCreateInsert,
  plantHealthFromSelectValue,
} from "@/lib/plantHealthRules";
import { plantCreateFailureMessage } from "@/lib/plantCreateFailureNotice";
import {
  primeConfirmedPlantCaches,
  reaffirmConfirmedPlantCacheMeta,
} from "@/lib/confirmedPlantCacheService";
import { recordConfirmedGrowPlantMeta } from "@/hooks/useGrowData";
import {
  confirmPlantCreateAttemptRow,
  isAmbiguousPlantInsertError,
  newPlantCreateAttemptId,
  reconcilePlantCreateAttempt,
} from "@/lib/plantCreatePersistence";
import { useHierarchyCreateOutcomeRecovery } from "@/hooks/useHierarchyCreateOutcomeRecovery";
import {
  buildCreateGrowBindingView,
  canWriteCreateGrowId,
  evaluateSuppliedTentBinding,
  createGrowIdsEqual,
  evaluateTentGrowCompatibility,
  plantCreateAllowsTentless,
  plantCreateNoTentsHintVisible,
  selectCreatePlantTents,
  resolveInitialPlantTentId,
  resolveSetupName,
  suppliedTentBlocksWrite,
} from "@/lib/createDialogGrowBindingRules";
import { GROW_SETUP_MESSAGES } from "@/constants/growSetupMessages";
import { useCreateBindingRetry } from "@/hooks/useCreateBindingRetry";
import { hasTrimmedRequiredIdentity } from "@/lib/formIdentityFailClosedRules";
import {
  describeCreatePlantPrimaryButton,
  PLANT_NO_TENTS_OPTIONAL_HINT,
} from "@/lib/createDialogPrimaryButtonViewModel";

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
    // Not assessed until the grower picks a value (QA 2026-09-24, BUG-009).
    health: "",
    started_at: "",
    plant_type: "unknown",
  };
}

/** Physical key identity; falls back to event.key when event.code is unavailable. */
function physicalKeyId(event: KeyboardEvent): string {
  return event.code || event.key;
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
    ? selectCreatePlantTents(tentRows, targetGrowId).filter(
        (t) =>
          t.grow_id === targetGrowId ||
          t.grow_id?.trim().toLowerCase() === targetGrowId.trim().toLowerCase(),
      )
    : [];
  const showNoTentsHint = plantCreateNoTentsHintVisible({
    selectableTentCount: tents.length,
    tentsSettled: tentsLoaded,
    tentsReadFailed: tentsError,
  });

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
  const [saveError, setSaveError] = useState<string | null>(null);
  const createInFlightRef = useRef(false);
  const suppressTentSelectSubmitRef = useRef(false);
  const closedAfterSubmitRef = useRef(false);
  const releaseReopenGuardRef = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseReopenGuardRef.current?.(), []);
  // Keys physically held right now, keyed by physical key (event.code): event.key
  // changes with Shift/dead keys between keydown and keyup and would leave
  // phantom entries. A save usually resolves after the keyup of the submitting key,
  // and a guard armed then would swallow the next genuine activation of
  // New plant (Codex P2 at 885e48b8).
  const heldKeysRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const held = heldKeysRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      held.add(physicalKeyId(event));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(physicalKeyId(event));
    };
    const onBlur = () => held.clear();
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      held.clear();
    };
  }, []);
  const { createOutcomeUnknown, recordUnknownCreateOutcome } = useHierarchyCreateOutcomeRecovery({
    ownerId: user?.id,
  });
  const handoffSuppressedRef = useRef(false);
  const mountedRef = useRef(true);
  const currentOwnerIdRef = useRef<string | null>(user?.id ?? null);
  currentOwnerIdRef.current = user?.id ?? null;
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
    if (!nestedTent || !createGrowIdsEqual(nestedTent.grow_id, targetGrowId)) return;
    setForm((current) => ({ ...current, tent_id: nestedTent.id }));
    setExplicitCompatiblePick(true);
    setPendingNestedTentId(null);
  }, [pendingNestedTentId, targetGrowId, tentRows]);

  const selectedTentRow = uniqueTentById(tentRows, form.tent_id);
  const selectedTentGrowId = selectedTentRow?.grow_id ?? null;
  const selectedTentIsLocallyVerified = createGrowIdsEqual(
    uniqueTentById(nestedTents, form.tent_id)?.grow_id,
    targetGrowId,
  );
  const selectedTentHasVerifiedSource =
    selectedTentIsLocallyVerified || (tentsLoaded && !tentsError);
  const hasVerifiedCompatibleReplacement =
    explicitCompatiblePick &&
    form.tent_id !== defaultTentId &&
    selectedTentHasVerifiedSource &&
    !!selectedTentRow &&
    !!targetGrowId &&
    createGrowIdsEqual(selectedTentRow.grow_id, targetGrowId);

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

  const formBlocked =
    createOutcomeUnknown ||
    binding.blockSubmit ||
    !canWriteCreateGrowId(targetGrowId) ||
    tentBlocksWrite;
  const nameFieldId = useId();
  const disabledReasonId = useId();
  const tentRequired = !plantCreateAllowsTentless({
    suppliedTentId: defaultTentId,
    requireTent,
  });
  const primary = describeCreatePlantPrimaryButton({
    busy,
    outcomeUnknown: createOutcomeUnknown,
    formBlocked,
    formBlockedDetail:
      suppliedTent.title || tentCompat.title || binding.title || binding.body || null,
    tentCompatible: tentCompat.compatible,
    tentRequired,
    tentBlockedDetail: tentCompat.title || tentCompat.body || null,
    name: form.name,
  });

  function outsideCreateDialogTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      Boolean(target.closest("[data-sonner-toaster], [data-sonner-toast]"))
    );
  }

  function armTentSelectSubmitGuard() {
    suppressTentSelectSubmitRef.current = true;
    queueMicrotask(() => {
      suppressTentSelectSubmitRef.current = false;
    });
  }

  function stopSelectEnterKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      armTentSelectSubmitGuard();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  // After a successful create, let Radix return focus to the New plant trigger
  // (keyboard users keep their place) but keep the reopen guard armed until the
  // submitting gesture ends: a held or trailing key must not reopen the dialog
  // empty. It is released once every key held at close is up (in any order),
  // on the next pointerdown, or on window blur (keyups elsewhere are lost).
  // When no key is held at close (pointer submit, or a keyboard save that
  // resolved after keyup), the gesture has already ended, so the guard is
  // released immediately.
  function handleDialogCloseAutoFocus(_event: Event) {
    if (!closedAfterSubmitRef.current) return;
    releaseReopenGuardRef.current?.();
    const held = heldKeysRef.current;
    if (held.size === 0) {
      closedAfterSubmitRef.current = false;
      return;
    }
    const release = () => {
      closedAfterSubmitRef.current = false;
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerdown", release, true);
      window.removeEventListener("blur", release);
      releaseReopenGuardRef.current = null;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(physicalKeyId(event));
      if (held.size === 0) release();
    };
    releaseReopenGuardRef.current = release;
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointerdown", release, true);
    window.addEventListener("blur", release);
  }

  // Closing the listbox arms the same-turn submit guard too: reselecting the
  // already-selected tent does not fire onValueChange (Radix keeps the value).
  function handleTentSelectOpenChange(next: boolean) {
    if (!next) armTentSelectSubmitGuard();
    setTentSelectOpen(next);
  }

  function handleOpenChange(next: boolean) {
    // The recovery explanation lives in this dialog, and the trigger cannot
    // reopen it while the outcome is unknown. Closing would hide that notice.
    if (!next && createOutcomeUnknown) return;
    if (next && (createOutcomeUnknown || closedAfterSubmitRef.current)) return;
    // The insert may already be durable, so closing cannot cancel it. Let the
    // grower dismiss a stalled refresh, but suppress the later Quick Log
    // handoff so closing never causes a delayed navigation surprise.
    if (!next && busy) handoffSuppressedRef.current = true;
    setOpen(next);
    if (next) setSaveError(null);
    if (!next) {
      setSaveError(null);
      setExplicitCompatiblePick(false);
      setForm(emptyForm(initialTentId));
      setNestedTents([]);
      setPendingNestedTentId(null);
      setNestedTentCreatorMounted(false);
      setTentSelectOpen(false);
    }
  }

  function onTentSelect(v: string) {
    armTentSelectSubmitGuard();
    if (v === "none") {
      setForm((current) => ({ ...current, tent_id: "none" }));
      setExplicitCompatiblePick(false);
      return;
    }

    const row = uniqueTentById(tentRows, v);
    if (!row || !createGrowIdsEqual(row.grow_id, targetGrowId)) {
      setForm((current) => ({ ...current, tent_id: "none" }));
      setExplicitCompatiblePick(false);
      return;
    }

    setForm((current) => ({ ...current, tent_id: v }));
    setExplicitCompatiblePick(v !== defaultTentId);
  }

  function handleNestedTentCreated(tent: CreatedTent) {
    if (!createGrowIdsEqual(tent.grow_id, targetGrowId)) {
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
    if (busy || createInFlightRef.current || tentSelectOpen || suppressTentSelectSubmitRef.current)
      return;
    if (!hasTrimmedRequiredIdentity(form.name)) return;
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    if (createOutcomeUnknown) {
      toast.error("Refresh this page before trying to create another plant.");
      return;
    }
    // A retry has begun: the last failure no longer describes this attempt,
    // even when a pre-write check below stops it before any insert.
    setSaveError(null);
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

    let plantId: string;
    try {
      plantId = newPlantCreateAttemptId();
    } catch {
      toast.error("Verdant could not start a safe plant save. Refresh and try again.");
      return;
    }

    // A start date is a calendar date: save the picked day at local midnight
    // and reject future dates before any write (QA 2026-09-24, BUG-004/005).
    let startedAtIso: string | null = null;
    if (form.started_at) {
      const startedAt = plantStartDateInputToIso(form.started_at, new Date());
      if (startedAt.ok !== true) {
        toast.error(plantStartDateSaveMessage(startedAt.reason));
        return;
      }
      startedAtIso = startedAt.iso;
    }

    handoffSuppressedRef.current = false;
    createInFlightRef.current = true;
    setBusy(true);
    try {
      const trimmedStrain = form.strain.trim();
      const payload: Record<string, unknown> = {
        id: plantId,
        user_id: user.id,
        name: form.name.trim(),
        strain: trimmedStrain || null,
        stage: form.stage,
        // Always explicit, "unknown" when not assessed: the column default is
        // "healthy" until 20260924120000 is applied (QA 2026-09-24, BUG-009).
        ...buildPlantHealthCreateInsert(form.health),
        plant_type: form.plant_type,
        grow_id: targetGrowId,
      };
      if (form.tent_id && form.tent_id !== "none") payload.tent_id = form.tent_id;
      if (startedAtIso) payload.started_at = startedAtIso;

      const validation = validatePlantInsertPayload(payload);
      if (!validation.ok || !validation.value) {
        setBusy(false);
        toast.error(validation.errors[0] ?? "Plant details are incomplete");
        return;
      }

      const attempt = {
        plantId,
        ownerId: user.id,
        growId: targetGrowId,
        tentId: validation.value.tent_id ?? null,
      };
      let data: unknown = null;
      let error: unknown = null;
      let insertThrew = false;
      try {
        const result = await supabase
          .from("plants")
          .insert(validation.value as never)
          .select("*")
          .single();
        data = result.data;
        error = result.error;
      } catch {
        insertThrew = true;
      }

      let confirmed = !error ? confirmPlantCreateAttemptRow(data, attempt) : null;
      const needsReconciliation =
        insertThrew || isAmbiguousPlantInsertError(error) || (!error && !confirmed);
      if (needsReconciliation) {
        const reconciliation = await reconcilePlantCreateAttempt(supabase, attempt);
        if (reconciliation.status === "confirmed") confirmed = reconciliation.confirmed;
      }

      if (!confirmed && needsReconciliation) {
        const notice =
          "Verdant could not confirm whether this plant was saved. Refresh before adding another.";
        if (mountedRef.current) {
          setBusy(false);
          setSaveError(notice);
        }
        recordUnknownCreateOutcome({
          entity: "plant",
          rowId: plantId,
          ownerId: user.id,
          growId: targetGrowId,
          tentId: validation.value.tent_id ?? null,
        });
        toast.error(notice);
        return;
      }
      if (error && !confirmed) {
        // Before 20260924120000 the trigger rejects "unknown" and nothing is
        // written; the form stays open so the grower can pick a health value.
        const notice = plantCreateFailureMessage(error);
        if (mountedRef.current) {
          setBusy(false);
          setSaveError(notice);
        }
        toast.error(notice);
        return;
      }
      // The insert is now durable. Record that fact before any cache refresh can
      // stall or the grower can leave; navigation remains refresh-gated below.
      trackFunnelEvent("plant_created");
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
      const isSubmittedOwnerCurrent = () =>
        mountedRef.current && currentOwnerIdRef.current === user.id;
      const cacheOptions = {
        isOwnerCurrent: isSubmittedOwnerCurrent,
        onGrowCacheConfirmed: (key) => {
          recordConfirmedGrowPlantMeta(user.id, key);
        },
      };
      const cacheReceipt = await primeConfirmedPlantCaches(qc, user.id, confirmed, cacheOptions);
      if (!isSubmittedOwnerCurrent()) {
        if (mountedRef.current) setBusy(false);
        else toast.success("Plant created");
        return;
      }
      // The insert is durable before these reads. Keep the dialog and its handoff
      // pending until both legacy Quick Log and owner-scoped grow views have
      // attempted authoritative reconciliation, matching Start Your Room.
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["plants"] }),
        qc.invalidateQueries({ queryKey: ["grow", "plants"] }),
      ]);
      reaffirmConfirmedPlantCacheMeta(qc, confirmed, cacheReceipt, cacheOptions);
      if (!isSubmittedOwnerCurrent()) {
        if (mountedRef.current) setBusy(false);
        else toast.success("Plant created");
        return;
      }
      const stillMounted = mountedRef.current;
      const handoffSuppressed = handoffSuppressedRef.current;
      if (stillMounted) {
        setBusy(false);
        setSaveError(null);
      }
      toast.success("Plant created");
      if (!stillMounted || handoffSuppressed) return;
      setForm(emptyForm(initialTentId));
      setExplicitCompatiblePick(false);
      setNestedTents([]);
      setPendingNestedTentId(null);
      setNestedTentCreatorMounted(false);
      setTentSelectOpen(false);
      closedAfterSubmitRef.current = true;
      setOpen(false);
      if (onCreated) onCreated(confirmed.row);
    } finally {
      createInFlightRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            size="sm"
            className="gradient-leaf text-primary-foreground gap-1"
            disabled={createOutcomeUnknown}
          >
            <Plus className="h-4 w-4" /> New plant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="glass max-w-md w-[calc(100%-1.5rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto flex flex-col gap-4 top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%] sm:max-h-[min(90vh,calc(100dvh-2rem))]"
        onFocusOutside={(event) => {
          // Disabling the focused submit button moves focus to the document.
          // That is not the grower leaving the form.
          if (busy || saveError || outsideCreateDialogTarget(event.target)) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          // The error toast sits outside this dialog. Pressing it must not
          // count as leaving, or the form the grower just filled is cleared.
          if (outsideCreateDialogTarget(event.target)) event.preventDefault();
        }}
        onCloseAutoFocus={handleDialogCloseAutoFocus}
      >
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
        {createOutcomeUnknown && (
          <p
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
            data-testid="plant-create-outcome-unknown"
          >
            Verdant could not confirm whether that plant was saved. Refresh this page before
            creating another plant so you do not make a duplicate.
          </p>
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
              <Label htmlFor={nameFieldId}>Name</Label>
              <Input
                required
                id={nameFieldId}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Plant A"
                data-testid="create-plant-name"
              />
              <p
                className="text-[11px] text-muted-foreground mt-1"
                data-testid="plant-create-name-helper"
              >
                {primary.helperText}
              </p>
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger type="button">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent onKeyDown={stopSelectEnterKeyDown}>
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
                <SelectTrigger type="button" data-testid="create-plant-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent onKeyDown={stopSelectEnterKeyDown}>
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
                onOpenChange={handleTentSelectOpenChange}
                value={form.tent_id}
                onValueChange={onTentSelect}
              >
                <SelectTrigger type="button" data-testid="create-plant-tent-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent onKeyDown={stopSelectEnterKeyDown}>
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
              {showNoTentsHint && (
                <p
                  className="text-xs text-muted-foreground mt-1"
                  data-testid="create-plant-no-tents-hint"
                >
                  {tentRequired ? "No tents yet. Create a tent first." : PLANT_NO_TENTS_OPTIONAL_HINT}
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
                    onValueChange={(v) =>
                      setForm({ ...form, health: plantHealthFromSelectValue(v) })
                    }
                  >
                    <SelectTrigger type="button" data-testid="create-plant-health">
                      <SelectValue placeholder={PLANT_HEALTH_NOT_ASSESSED_LABEL} />
                    </SelectTrigger>
                    <SelectContent onKeyDown={stopSelectEnterKeyDown}>
                      <SelectItem value={PLANT_HEALTH_NOT_ASSESSED_OPTION}>
                        {PLANT_HEALTH_NOT_ASSESSED_LABEL}
                      </SelectItem>
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
                    max={plantStartDateInputMax(new Date())}
                    value={form.started_at}
                    onChange={(e) => setForm({ ...form, started_at: e.target.value })}
                  />
                </div>
              </div>
            </details>
            {saveError ? (
              <p
                role="alert"
                data-testid="create-plant-save-error"
                className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {saveError}
              </p>
            ) : null}
            {primary.reason ? (
              <p
                id={disabledReasonId}
                className="text-xs text-muted-foreground"
                data-testid="plant-create-disabled-reason"
              >
                {primary.reason}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={
                busy ||
                formBlocked ||
                !tentCompat.compatible ||
                !hasTrimmedRequiredIdentity(form.name)
              }
              aria-describedby={primary.reason ? disabledReasonId : undefined}
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
