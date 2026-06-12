import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { STAGES } from "@/lib/grow";
import { EC_UNITS, EC_UNIT_LABEL, type EcUnit } from "@/constants/units";
import { usePlants } from "@/hooks/use-plants";
import { useTents } from "@/hooks/use-tents";
import { shouldRequireFirstTentSetup } from "@/lib/firstTentSetupRules";
import { evaluateQuickLogPreview } from "@/lib/quickLogPreviewRules";
import {
  appendHardwareReadingsToNote,
  computeQuickLogHardwareDefaultOpen,
  hasAnyHardwareReading,
  type QuickLogHardwareReadings,
} from "@/lib/quickLogHardwareReadingsRules";
import {
  filterQuickLogPlantOptions,
  pickDefaultQuickLogPlant,
  quickLogPlantHelperText,
} from "@/lib/quickLogPlantOptionRules";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import EventTypeSelector from "@/components/EventTypeSelector";
import { useLatestTentSensorSnapshot } from "@/lib/sensor";
import { buildQuickLogStripFromTentState } from "@/lib/quickLogSnapshotStripAdapter";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import {
  buildLegacyQuickLogUnifiedPayload,
  isSupportedLegacyEventType,
  UNSUPPORTED_EVENT_TYPE_COPY,
} from "@/lib/legacyQuickLogUnifiedSave";
import { buildSensorSnapshotSavePayload } from "@/lib/latestSensorSnapshotRules";
import { buildStaleSnapshotHelperCopy } from "@/lib/quickLogStaleSnapshotHelperCopy";
import { plantDetailPath } from "@/lib/routes";

export interface QuickLogPrefill {
  plantId?: string | null;
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  eventType?: string | null;
  suggestSnapshot?: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
  prefill?: QuickLogPrefill | null;
  successMessage?: string;
}

const LAST_TARGET_STORAGE_KEY = "verdant.quickLog.lastTarget.v1";

type SavedTarget = {
  id: string;
  name: string;
  tentName: string | null;
  growName: string | null;
  eventType: string;
  savedAt: string;
};

type LastQuickLogTarget = {
  plantId: string;
  growId: string | null;
  tentId: string | null;
  savedAt: string;
};

function readLastTarget(): LastQuickLogTarget | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_TARGET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastQuickLogTarget>;
    if (typeof parsed.plantId !== "string" || !parsed.plantId) return null;
    return {
      plantId: parsed.plantId,
      growId: typeof parsed.growId === "string" ? parsed.growId : null,
      tentId: typeof parsed.tentId === "string" ? parsed.tentId : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function rememberLastTarget(target: LastQuickLogTarget) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_TARGET_STORAGE_KEY, JSON.stringify(target));
  } catch {
    // Non-critical speed preference. Never block saving if storage is unavailable.
  }
}

function savedVerb(eventType: string): string {
  if (eventType === "watering") return "watering";
  if (eventType === "feeding") return "feeding";
  if (eventType === "observation") return "observation";
  if (eventType === "photo") return "photo note";
  return "log";
}

export default function QuickLog({
  open,
  onOpenChange,
  onCreated,
  prefill,
  successMessage = "Logged 🌱",
}: Props) {
  const { user } = useAuth();
  const { grows, activeGrow, activeGrowId, setActiveGrowId } = useGrows();
  const { data: plants = [] } = usePlants();
  const { data: activeTents = [] } = useTents();
  const queryClient = useQueryClient();
  const { save: saveViaRpc } = useQuickLogV2Save();

  const tentSetupRequired =
    shouldRequireFirstTentSetup(activeTents) &&
    !plants.some((p) => typeof p.tent_id === "string" && p.tent_id.length > 0);

  const [note, setNote] = useState("");
  const [stage, setStage] = useState(activeGrow?.stage || "veg");
  const [eventType, setEventType] = useState<string>("observation");
  const [plantId, setPlantId] = useState<string>("");
  const [snapshot, setSnapshot] = useState(false);
  const [remindAt, setRemindAt] = useState<string>("");
  const [showMore, setShowMore] = useState(false);
  const [details, setDetails] = useState<{
    ec: string;
    ecUnit: EcUnit;
    nutrients: string;
    training: string;
    watering: string;
  }>({
    ec: "",
    ecUnit: "mS/cm",
    nutrients: "",
    training: "",
    watering: "",
  });
  const [hardware, setHardware] = useState<QuickLogHardwareReadings>({
    inputPh: "",
    inputEc: "",
    runoffPh: "",
    runoffEc: "",
    ppfdCanopy: "",
    lightDistance: "",
  });
  const [busy, setBusy] = useState(false);
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const [wateringError, setWateringError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTarget, setSavedTarget] = useState<SavedTarget | null>(null);

  const wateringInputRef = useRef<HTMLInputElement | null>(null);
  const plantSelectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const attachWrapperRef = useRef<HTMLLabelElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const viewPlantBtnRef = useRef<HTMLAnchorElement | null>(null);
  const hardwareUserTouchedRef = useRef(false);
  const snapshotUserTouchedRef = useRef(false);

  useEffect(() => {
    if (!open || !prefill) return;
    if (prefill.growId && prefill.growId !== activeGrowId) {
      setActiveGrowId(prefill.growId);
    }
    if (prefill.eventType) setEventType(prefill.eventType);
    if (prefill.suggestSnapshot && prefill.tentId) setSnapshot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    prefill?.growId,
    prefill?.tentId,
    prefill?.eventType,
    prefill?.suggestSnapshot,
  ]);

  const scopedPlants = useMemo(
    () => filterQuickLogPlantOptions(plants, activeGrowId),
    [plants, activeGrowId],
  );

  const selectedPlant = useMemo(
    () => scopedPlants.find((p) => p.id === plantId) ?? null,
    [plantId, scopedPlants],
  );

  const selectedTent = useMemo(
    () => activeTents.find((t) => t.id === selectedPlant?.tent_id) ?? null,
    [activeTents, selectedPlant?.tent_id],
  );

  useEffect(() => {
    if (!open) return;
    if (plantId) return;

    const lastTarget = readLastTarget();
    const lastPlantId = lastTarget?.plantId ?? null;
    const lastPlantStillValid = lastPlantId
      ? scopedPlants.some((p) => p.id === lastPlantId)
      : false;

    const next = pickDefaultQuickLogPlant(
      scopedPlants,
      prefill?.plantId ?? (lastPlantStillValid ? lastPlantId : null),
      plantId || null,
    );
    if (next && next !== plantId) setPlantId(next);
  }, [open, plantId, scopedPlants, prefill?.plantId]);

  const sensorTentId = selectedPlant?.tent_id ?? null;
  const sensorState = useLatestTentSensorSnapshot(sensorTentId);
  const stripView = useMemo(
    () =>
      buildQuickLogStripFromTentState({
        status: sensorState.status,
        snapshot: sensorState.snapshot,
        hasTent: !!sensorTentId,
        attached: snapshot,
      }),
    [sensorState.status, sensorState.snapshot, sensorTentId, snapshot],
  );

  useEffect(() => {
    if (!open) return;
    if (snapshotUserTouchedRef.current) return;
    if (!selectedPlant?.tent_id) return;
    if (stripView.status === "usable" && !snapshot) setSnapshot(true);
  }, [open, stripView.status, selectedPlant?.tent_id, snapshot]);

  useEffect(() => {
    if (!open) return;
    if (stripView.status !== "usable" && snapshot) setSnapshot(false);
  }, [open, stripView.status, snapshot]);

  useEffect(() => {
    if (!open) return;
    snapshotUserTouchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPlant?.tent_id]);

  useEffect(() => {
    if (!open) return;
    if (eventType === "watering") setShowMore(true);
  }, [open, eventType]);

  useEffect(() => {
    if (eventType !== "watering" || details.watering.trim()) setWateringError(null);
  }, [eventType, details.watering]);

  useEffect(() => {
    if (!open) {
      hardwareUserTouchedRef.current = false;
      return;
    }
    if (hardwareUserTouchedRef.current) return;
    setHardwareOpen(computeQuickLogHardwareDefaultOpen(hardware));
  }, [open, hardware]);

  function emptyDetails() {
    return { ec: "", ecUnit: "mS/cm" as EcUnit, nutrients: "", training: "", watering: "" };
  }

  function emptyHardware(): QuickLogHardwareReadings {
    return {
      inputPh: "",
      inputEc: "",
      runoffPh: "",
      runoffEc: "",
      ppfdCanopy: "",
      lightDistance: "",
    };
  }

  function reset() {
    setNote("");
    setShowMore(false);
    setEventType("observation");
    setPlantId("");
    setSnapshot(false);
    snapshotUserTouchedRef.current = false;
    setRemindAt("");
    setDetails(emptyDetails());
    setHardware(emptyHardware());
    hardwareUserTouchedRef.current = false;
    setHardwareOpen(false);
    setWateringError(null);
    setSaveError(null);
    setSavedTarget(null);
  }

  function resetForAnother() {
    const keepPlantId = savedTarget?.id ?? plantId;
    setNote("");
    setShowMore(false);
    setEventType("observation");
    setSnapshot(false);
    snapshotUserTouchedRef.current = false;
    setRemindAt("");
    setDetails(emptyDetails());
    setHardware(emptyHardware());
    hardwareUserTouchedRef.current = false;
    setHardwareOpen(false);
    setWateringError(null);
    setSaveError(null);
    setSavedTarget(null);
    if (keepPlantId) setPlantId(keepPlantId);
    setTimeout(() => noteRef.current?.focus(), 0);
  }

  function focusPlant() {
    plantSelectTriggerRef.current?.focus();
    plantSelectTriggerRef.current?.scrollIntoView?.({ block: "center" });
  }

  function focusAttach() {
    attachWrapperRef.current?.focus();
    attachWrapperRef.current?.scrollIntoView?.({ block: "center" });
  }

  function focusWatering() {
    setShowMore(true);
    setTimeout(() => {
      wateringInputRef.current?.focus();
      wateringInputRef.current?.scrollIntoView?.({ block: "center" });
    }, 0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);

    if (!user || !activeGrowId) {
      const message = "Pick a workspace first";
      setSaveError(message);
      toast.error(message);
      return;
    }
    if (!isSupportedLegacyEventType(eventType)) {
      toast.message(UNSUPPORTED_EVENT_TYPE_COPY);
      return;
    }
    if (!selectedPlant) {
      const message = "Pick a plant to save this entry";
      setSaveError(message);
      toast.error(message);
      focusPlant();
      return;
    }
    if (!note.trim() && eventType !== "watering") {
      const message = "Add a quick note";
      setSaveError(message);
      toast.error(message);
      noteRef.current?.focus();
      return;
    }
    if (eventType === "watering") {
      const raw = details.watering.trim();
      const vol = Number(raw);
      if (!raw || !Number.isFinite(vol) || vol <= 0) {
        const message = "Add a watering volume (ml) to save.";
        setShowMore(true);
        setWateringError(message);
        setSaveError(message);
        focusWatering();
        toast.error(message);
        return;
      }
    }

    setBusy(true);
    try {
      const noteWithHardware = appendHardwareReadingsToNote(note, hardware);
      const sensorAttachPayload =
        snapshot && sensorTentId && stripView.status === "usable"
          ? buildSensorSnapshotSavePayload(sensorState.snapshot)
          : null;
      const built = buildLegacyQuickLogUnifiedPayload({
        eventType,
        noteWithHardware,
        plantId: selectedPlant.id,
        plantTentId: selectedPlant.tent_id ?? null,
        details,
        sensorAttachPayload,
      });
      if (built.ok !== true) {
        setSaveError(built.message);
        toast.error(built.message);
        return;
      }

      const result = await saveViaRpc(built.payload);
      if (!result.ok) {
        const message = `Couldn't save entry: ${result.reason ?? "save_failed"}`;
        setSaveError(`${message}. Your input is still here — retry when connection is stable.`);
        toast.error(message);
        console.error("[QuickLog] RPC save error", result);
        return;
      }

      if (activeGrow && stage !== activeGrow.stage) {
        await supabase.from("grows").update({ stage }).eq("id", activeGrowId);
      }

      const plantLabel = selectedPlant.name;
      const finalMessage =
        successMessage && successMessage !== "Logged 🌱"
          ? successMessage
          : `Saved ${savedVerb(eventType)} for ${plantLabel}`;
      toast.success(finalMessage);

      rememberLastTarget({
        plantId: selectedPlant.id,
        growId: activeGrowId,
        tentId: selectedPlant.tent_id ?? null,
        savedAt: new Date().toISOString(),
      });
      setSavedTarget({
        id: selectedPlant.id,
        name: plantLabel,
        tentName: selectedTent?.name ?? null,
        growName: activeGrow?.name ?? null,
        eventType,
        savedAt: new Date().toISOString(),
      });
      onCreated?.();
      setTimeout(() => viewPlantBtnRef.current?.focus(), 0);
      queryClient.invalidateQueries({ queryKey: ["plant_recent_activity"] });
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      queryClient.invalidateQueries({ queryKey: ["grow_events"] });
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: new Date().toISOString() },
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setSaveError(`${message}. Your input is still here — retry when connection is stable.`);
      toast.error(message);
      console.error("[QuickLog] unexpected error", err);
    } finally {
      setBusy(false);
    }
  }

  const snapshotUsable = stripView.status === "usable";
  const attachDisabled = !selectedPlant || !snapshotUsable;
  const showMismatch = !!(
    prefill?.plantId && selectedPlant && selectedPlant.id !== prefill.plantId
  );
  const showStaleHelper = !!(
    selectedPlant && !snapshotUsable && stripView.status !== "no_data" && !tentSetupRequired
  );
  const showWateringErr = !!wateringError;
  const targetGrowName = activeGrow?.name ?? "No setup selected";
  const targetTentName = selectedTent?.name ?? (selectedPlant?.tent_id ? "Assigned tent" : "No tent assigned");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="glass max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Quick Log
          </DialogTitle>
          <p
            data-testid="quick-log-subtitle"
            className="text-[12px] text-muted-foreground leading-snug"
          >
            One target. One truth label. One save.
          </p>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          {(showMismatch || showStaleHelper || showWateringErr) && (
            <div
              data-testid="quick-log-review-issues"
              role="group"
              aria-label="Review Quick Log issues"
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1"
            >
              <p className="text-[11px] uppercase tracking-wide text-amber-200/80">
                Review before saving
              </p>
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {showMismatch && (
                  <li>
                    <button
                      type="button"
                      data-testid="quick-log-review-jump-mismatch"
                      onClick={focusPlant}
                      className="text-[12px] underline text-amber-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Check target
                    </button>
                  </li>
                )}
                {showStaleHelper && (
                  <li>
                    <button
                      type="button"
                      data-testid="quick-log-review-jump-snapshot"
                      onClick={focusAttach}
                      className="text-[12px] underline text-amber-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Check sensor truth
                    </button>
                  </li>
                )}
                {showWateringErr && (
                  <li>
                    <button
                      type="button"
                      data-testid="quick-log-review-jump-watering"
                      onClick={focusWatering}
                      className="text-[12px] underline text-amber-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Add Watering (ml)
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}

          <section
            data-testid="quick-log-target-card"
            aria-label="Quick Log target"
            className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Logging to
                </p>
                <p data-testid="quick-log-target-plant" className="text-base font-semibold text-foreground">
                  {selectedPlant?.name ?? "Choose a plant"}
                </p>
                <p data-testid="quick-log-target-tent" className="text-[12px] text-muted-foreground">
                  {selectedPlant ? targetTentName : "Plant required before save"}
                </p>
                <p data-testid="quick-log-target-grow" className="text-[12px] text-muted-foreground">
                  {targetGrowName}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={focusPlant}>
                Change
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Plant</Label>
                <Select
                  value={plantId || "__none"}
                  onValueChange={(v) => {
                    setPlantId(v === "__none" ? "" : v);
                    setSaveError(null);
                  }}
                >
                  <SelectTrigger
                    ref={plantSelectTriggerRef}
                    data-testid="quick-log-plant-select"
                    aria-invalid={!selectedPlant}
                    aria-describedby={!selectedPlant ? "quick-log-plant-error" : undefined}
                  >
                    <SelectValue placeholder="Choose a plant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Choose a plant…</SelectItem>
                    {scopedPlants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.strain ? ` · ${p.strain}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Current Setup</Label>
                <Select
                  value={activeGrowId ?? ""}
                  onValueChange={(v) => {
                    setActiveGrowId(v);
                    setSaveError(null);
                  }}
                >
                  <SelectTrigger data-testid="quick-log-grow-select">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {grows.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!selectedPlant ? (
              <p
                id="quick-log-plant-error"
                role="alert"
                className="text-[11px] text-destructive"
                data-testid="quick-log-plant-error"
              >
                Choose a plant before saving this entry.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground" data-testid="quick-log-plant-helper">
                {quickLogPlantHelperText(activeGrow?.name ?? null, !!activeGrowId)}
              </p>
            )}
          </section>

          {prefill?.plantId && selectedPlant && selectedPlant.id !== prefill.plantId && (
            <div
              data-testid="quick-log-plant-mismatch-banner"
              role="status"
              aria-live="polite"
              tabIndex={-1}
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[12px] text-amber-200 flex items-start gap-2"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Logging to <strong className="font-semibold">{selectedPlant.name}</strong>
                {prefill.plantName ? (
                  <>, not <strong className="font-semibold">{prefill.plantName}</strong></>
                ) : (
                  ", not the plant currently open"
                )}.
              </span>
            </div>
          )}

          <section
            data-testid="quick-log-truth-section"
            className="rounded-xl border border-border/60 bg-secondary/20 p-3 space-y-2"
            aria-label="Quick Log sensor truth"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
                Sensor truth
              </span>
              <span
                data-testid="quick-log-truth-pill"
                data-status={stripView.status}
                className="rounded px-1.5 py-0.5 bg-muted/60 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                {stripView.status === "usable"
                  ? "Usable"
                  : stripView.status === "stale"
                    ? "Stale"
                    : stripView.status === "invalid"
                      ? "Invalid"
                      : "No data"}
              </span>
            </div>
            <p data-testid="quick-log-truth-copy" className="text-[12px] text-muted-foreground leading-snug">
              {stripView.status === "usable"
                ? snapshot
                  ? "Sensor context is usable and will attach to this log."
                  : "Sensor context is usable but not attached."
                : stripView.status === "no_data"
                  ? "No usable sensor context. This will save as a manual log only."
                  : "Sensor context is not usable enough to attach. This will save as a manual log only."}
            </p>

            {tentSetupRequired ? (
              <p
                data-testid="quick-log-snapshot-tent-required"
                className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-[12px] text-muted-foreground"
              >
                Sensor snapshots need a tent first. <a href="/tents" className="underline text-primary">Create your first tent</a> to attach environment context to logs.
              </p>
            ) : (
              <>
                <label
                  ref={attachWrapperRef}
                  tabIndex={-1}
                  data-testid="quick-log-snapshot-attach-section"
                  className={`flex items-center justify-between gap-2 rounded-lg border p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${attachDisabled ? "border-border/40 opacity-60" : "border-border/60"}`}
                >
                  <span className="text-sm">Attach sensor snapshot</span>
                  <Switch
                    data-testid="quick-log-snapshot-toggle"
                    data-snapshot-status={stripView.status}
                    checked={snapshot && !!selectedPlant && snapshotUsable}
                    onCheckedChange={(v) => {
                      snapshotUserTouchedRef.current = true;
                      setSnapshot(v);
                    }}
                    disabled={attachDisabled}
                    aria-label="Attach sensor snapshot to this log"
                    aria-describedby="quick-log-snapshot-session-helper"
                  />
                </label>
                <p
                  id="quick-log-snapshot-session-helper"
                  data-testid="quick-log-snapshot-session-helper"
                  className="text-[11px] text-muted-foreground"
                >
                  {selectedPlant && !snapshotUsable && stripView.status !== "no_data" ? (
                    <span data-testid="quick-log-snapshot-stale-helper">
                      {buildStaleSnapshotHelperCopy(stripView.capturedAt)}
                    </span>
                  ) : (
                    "Applies to this log only. Closing Quick Log resets this choice."
                  )}
                </p>
              </>
            )}
          </section>

          {!tentSetupRequired && (
            <QuickLogSensorSnapshotStrip
              growId={activeGrowId}
              tentId={selectedPlant?.tent_id ?? null}
              attached={snapshot && !!selectedPlant}
            />
          )}

          <section className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <EventTypeSelector value={eventType} onValueChange={setEventType} />
              <div>
                <Label className="text-xs">Stage</Label>
                <Select value={stage} onValueChange={setStage}>
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
            </div>

            <h3
              data-testid="quick-log-section-observation"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              What happened?
            </h3>
            <div
              data-testid="quick-log-prompt-chips"
              role="group"
              aria-label="Quick observation prompts"
              className="flex flex-wrap gap-1.5"
            >
              {[
                { label: "Watered", text: "Watered today." },
                { label: "Fed", text: "Fed today." },
                { label: "Better", text: "Better than yesterday." },
                { label: "Same", text: "About the same as yesterday." },
                { label: "Worse", text: "Looking worse than yesterday." },
                { label: "Spotted issue", text: "Spotted an issue — see photo or notes." },
                { label: "Photo only", text: "Photo only — no other changes today." },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  data-testid={`quick-log-chip-${chip.label.toLowerCase().replace(/\s+/g, "-")}`}
                  aria-label={`Insert observation: ${chip.label}`}
                  onClick={() => {
                    setNote((prev) => (prev.trim() ? `${prev.trim()} ${chip.text}` : chip.text));
                    setSaveError(null);
                  }}
                  className="rounded-full border border-border/60 bg-secondary/30 px-2.5 py-1 text-[11px] text-foreground hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <Label htmlFor="quicklog-note-textarea">Short note</Label>
            <Textarea
              id="quicklog-note-textarea"
              ref={noteRef}
              data-testid="quicklog-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaveError(null);
              }}
              placeholder="Watered, looking healthy, slight yellowing on a fan leaf…"
              rows={3}
              aria-label="Quick log observation note"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={true}
            />
          </section>

          {eventType === "reminder" && (
            <div>
              <Label className="text-xs">Remind me at</Label>
              <Input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
              />
            </div>
          )}

          <h3
            data-testid="quick-log-section-optional"
            className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Optional details
          </h3>
          <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
            <span className="text-sm">Add more details</span>
            <Switch checked={showMore} onCheckedChange={setShowMore} />
          </label>

          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">EC value</Label>
                <Input
                  inputMode="decimal"
                  value={details.ec}
                  onChange={(e) => setDetails({ ...details, ec: e.target.value })}
                  placeholder="1.4"
                  data-testid="quicklog-details-ec-value"
                />
              </div>
              <div>
                <Label className="text-xs">EC unit</Label>
                <Select
                  value={details.ecUnit}
                  onValueChange={(v) => setDetails({ ...details, ecUnit: v as EcUnit })}
                >
                  <SelectTrigger data-testid="quicklog-details-ec-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EC_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {EC_UNIT_LABEL[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs" htmlFor="quicklog-watering-ml">
                  Watering (ml){eventType === "watering" ? <span aria-hidden="true" className="text-destructive"> *</span> : null}
                </Label>
                <Input
                  id="quicklog-watering-ml"
                  ref={wateringInputRef}
                  data-testid="quicklog-watering-ml"
                  inputMode="decimal"
                  value={details.watering}
                  onChange={(e) => setDetails({ ...details, watering: e.target.value })}
                  required={eventType === "watering"}
                  aria-required={eventType === "watering"}
                  aria-invalid={!!wateringError}
                  aria-describedby={wateringError ? "quicklog-watering-error" : undefined}
                />
                {wateringError && (
                  <p
                    id="quicklog-watering-error"
                    role="alert"
                    data-testid="quicklog-watering-error"
                    className="text-[11px] text-destructive mt-1"
                  >
                    {wateringError}
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Nutrients</Label>
                <Input
                  value={details.nutrients}
                  onChange={(e) => setDetails({ ...details, nutrients: e.target.value })}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Training / actions</Label>
                <Input
                  value={details.training}
                  onChange={(e) => setDetails({ ...details, training: e.target.value })}
                  placeholder="LST, defoliation…"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          <section
            data-testid="quicklog-hardware-readings"
            data-has-readings={String(hasAnyHardwareReading(hardware))}
            data-open={String(hardwareOpen)}
            className="rounded-lg border border-border/60 p-3 space-y-2"
          >
            <button
              type="button"
              data-testid="quicklog-hardware-toggle"
              aria-expanded={hardwareOpen}
              aria-controls="quicklog-hardware-body"
              onClick={() => {
                hardwareUserTouchedRef.current = true;
                setHardwareOpen((v) => !v);
              }}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="text-sm font-medium">
                Hardware readings
                <span
                  data-testid="quicklog-hardware-manual-subtitle"
                  className="ml-2 text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
                >
                  Manual readings · handheld only, not telemetry
                </span>
              </span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {hardwareOpen ? "Optional" : "Tap to add"}
              </span>
            </button>
            {hardwareOpen && (
              <div id="quicklog-hardware-body" className="space-y-2">
                <p
                  data-testid="quicklog-hardware-helper"
                  className="text-[11px] text-muted-foreground leading-snug"
                >
                  Manual handheld readings — not live sensor data. EC fields are EC mS/cm only. Use the optional EC value above to record other scales.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Feed/Input pH</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.inputPh ?? ""}
                      onChange={(e) => setHardware({ ...hardware, inputPh: e.target.value })}
                      placeholder="6.2"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Feed/Input EC mS/cm</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.inputEc ?? ""}
                      onChange={(e) => setHardware({ ...hardware, inputEc: e.target.value })}
                      placeholder="1.4"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Runoff pH</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.runoffPh ?? ""}
                      onChange={(e) => setHardware({ ...hardware, runoffPh: e.target.value })}
                      placeholder="6.0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Runoff EC mS/cm</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.runoffEc ?? ""}
                      onChange={(e) => setHardware({ ...hardware, runoffEc: e.target.value })}
                      placeholder="1.6"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">PPFD canopy (µmol)</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.ppfdCanopy ?? ""}
                      onChange={(e) => setHardware({ ...hardware, ppfdCanopy: e.target.value })}
                      placeholder="650"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Light distance (cm)</Label>
                    <Input
                      inputMode="decimal"
                      value={hardware.lightDistance ?? ""}
                      onChange={(e) => setHardware({ ...hardware, lightDistance: e.target.value })}
                      placeholder="45"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {(() => {
            const preview = evaluateQuickLogPreview({ note, eventType, stage, remindAt, details });
            if (preview.warnings.length === 0) return null;
            return (
              <div
                data-testid="quicklog-preview"
                data-has-issues={String(preview.hasIssues)}
                className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-1.5"
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Validation preview
                </p>
                <ul className="space-y-1">
                  {preview.warnings.map((w) => {
                    const Icon = w.severity === "warning" ? AlertTriangle : Info;
                    const tone = w.severity === "warning" ? "text-amber-300" : "text-muted-foreground";
                    return (
                      <li
                        key={w.code}
                        data-testid={`quicklog-preview-${w.code}`}
                        className={`flex items-start gap-1.5 text-[12px] ${tone}`}
                      >
                        <Icon className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{w.message}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {saveError && (
            <p
              data-testid="quick-log-save-error"
              role="alert"
              aria-live="assertive"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[12px] text-destructive"
            >
              {saveError}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || !selectedPlant || !!savedTarget}
            data-testid="quick-log-save"
            className="gradient-leaf text-primary-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save log"}
          </Button>
          <p data-testid="quick-log-save-helper" className="text-[11px] text-muted-foreground -mt-2">
            Failed saves keep your input in place. You can add more detail later from the timeline.
          </p>

          {savedTarget && (
            <div
              data-testid="quick-log-post-save"
              role="status"
              aria-live="polite"
              className="rounded-lg border border-primary/40 bg-primary/5 p-3 flex flex-col gap-2"
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Saved</p>
                  <p className="text-[12px] text-muted-foreground">
                    Logged {savedVerb(savedTarget.eventType)} to <strong className="text-foreground font-semibold">{savedTarget.name}</strong>
                    {savedTarget.tentName ? <> · {savedTarget.tentName}</> : null}
                    {savedTarget.growName ? <> · {savedTarget.growName}</> : null}
                    {" · just now"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  ref={viewPlantBtnRef}
                  href={plantDetailPath(savedTarget.id)}
                  data-testid="quick-log-view-target-plant"
                  data-target-plant-id={savedTarget.id}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => {
                    if (typeof document !== "undefined") {
                      (document.activeElement as HTMLElement | null)?.blur?.();
                    }
                    onOpenChange(false);
                  }}
                >
                  View {savedTarget.name}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="quick-log-post-save-another"
                  onClick={resetForAnother}
                >
                  Log another for {savedTarget.name}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="quick-log-post-save-close"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
