import { useState, useRef, useMemo, useEffect } from "react";
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
import { Camera, Loader2, Sparkles, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { useQueryClient } from "@tanstack/react-query";

import { STAGES } from "@/lib/grow";

import { EC_UNITS, type EcUnit } from "@/constants/units";
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


import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

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
  // Snapshot attach requires a real tent anchor. We accept either an
  // active tent (authoritative) or a plant that already references a
  // tent_id (covers test fixtures and legacy data where useTents may not
  // be wired). This is intentionally permissive: the strip itself still
  // no-ops without a selectedPlant.tent_id.
  const tentSetupRequired =
    shouldRequireFirstTentSetup(activeTents) &&
    !plants.some((p) => typeof p.tent_id === "string" && p.tent_id.length > 0);
  const queryClient = useQueryClient();
  const { save: saveViaRpc } = useQuickLogV2Save();

  // Photo attach is disabled in the unified Quick Log slice; placeholder
  // state retained for layout only.
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
  // Hardware readings collapse state. Default is recomputed via a pure
  // helper whenever the dialog opens/resets, and remains under grower
  // control once they toggle it in-session.
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const hardwareUserTouchedRef = useRef(false);
  // Inline validation for required Watering (ml) when event=watering.
  const [wateringError, setWateringError] = useState<string | null>(null);
  const wateringInputRef = useRef<HTMLInputElement | null>(null);

  // Tracks whether the grower has manually changed the attach toggle in
  // this session. Until they do, we may auto-default it based on whether
  // the latest snapshot classifies as `usable` (Gate 1 trust rule).
  const snapshotUserTouchedRef = useRef(false);


  // Apply page-context prefill when the dialog opens. Does NOT submit —
  // grower still chooses to save the entry. NOTE: plant resolution is NOT
  // applied directly here. It is centralized in the
  // `pickDefaultQuickLogPlant` effect below so that out-of-scope, archived,
  // or merged plant ids in `prefill.plantId` are ignored and an existing
  // grower selection is never overwritten on reopen.
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

  // Speed slice: when no plant is selected, preselect the deterministic
  // default (single scoped candidate or valid prefill). Never overrides a
  // grower's current selection — pickDefaultQuickLogPlant returns
  // currentPlantId unchanged when it's valid. Re-evaluates when the dialog
  // re-opens or scoped plants change.
  useEffect(() => {
    if (!open) return;
    if (plantId) return;
    const next = pickDefaultQuickLogPlant(
      scopedPlants,
      prefill?.plantId ?? null,
      plantId || null,
    );
    if (next && next !== plantId) setPlantId(next);
  }, [open, plantId, scopedPlants, prefill?.plantId]);

  // Drive the sensor snapshot strip + auto-attach default from the same
  // contract-derived status the strip uses. We call the loader here so the
  // parent can react to status transitions without duplicating any
  // classification logic in this .tsx.
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

  // When the snapshot becomes `usable` and the grower has NOT manually
  // toggled the attach switch in this session, default it to ON so the
  // strip's "this log will include current sensor context" copy matches
  // what the save payload will actually include. Session-local only —
  // reload / tent change re-evaluates against the default.
  useEffect(() => {
    if (!open) return;
    if (snapshotUserTouchedRef.current) return;
    if (!selectedPlant?.tent_id) return;
    if (stripView.status === "usable" && !snapshot) {
      setSnapshot(true);
    }
  }, [open, stripView.status, selectedPlant?.tent_id, snapshot]);

  // When snapshot is not usable (stale/invalid/no_data) the attach toggle
  // must be OFF and disabled — saving stale/manual readings as attached
  // context would imply they are current evidence. The save payload
  // already drops non-usable snapshots; this aligns the toggle truth.
  useEffect(() => {
    if (!open) return;
    if (stripView.status !== "usable" && snapshot) {
      setSnapshot(false);
    }
  }, [open, stripView.status, snapshot]);

  // Reset the session "user touched" flag when the active tent changes,
  // so the auto-default ON effect can re-evaluate for the new tent.
  useEffect(() => {
    if (!open) return;
    snapshotUserTouchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPlant?.tent_id]);

  // Auto-expand the details section when event becomes "watering" so the
  // required Watering (ml) field is visible without hunting for it.
  useEffect(() => {
    if (!open) return;
    if (eventType === "watering") setShowMore(true);
  }, [open, eventType]);

  // Clear the inline watering error when the value changes or event flips.
  useEffect(() => {
    if (eventType !== "watering" || details.watering.trim()) {
      setWateringError(null);
    }
  }, [eventType, details.watering]);



  // On open/reset, recompute the Hardware readings default from current
  // values unless the grower already toggled it in this session.
  useEffect(() => {
    if (!open) {
      hardwareUserTouchedRef.current = false;
      return;
    }
    if (hardwareUserTouchedRef.current) return;
    setHardwareOpen(computeQuickLogHardwareDefaultOpen(hardware));
  }, [open, hardware]);

  function reset() {
    setNote("");
    setShowMore(false);
    setEventType("observation");
    setPlantId("");
    setSnapshot(false);
    snapshotUserTouchedRef.current = false;
    setRemindAt("");
    setDetails({ ec: "", ecUnit: "mS/cm", nutrients: "", training: "", watering: "" });
    setHardware({
      inputPh: "",
      inputEc: "",
      runoffPh: "",
      runoffEc: "",
      ppfdCanopy: "",
      lightDistance: "",
    });
    hardwareUserTouchedRef.current = false;
    setHardwareOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activeGrowId) {
      toast.error("Pick a workspace first");
      return;
    }
    if (!isSupportedLegacyEventType(eventType)) {
      toast.message(UNSUPPORTED_EVENT_TYPE_COPY);
      return;
    }
    if (!selectedPlant) {
      toast.error("Pick a plant to save this entry");
      return;
    }
    if (!note.trim() && eventType !== "watering") {
      toast.error("Add a quick note");
      return;
    }
    if (eventType === "watering") {
      const raw = details.watering.trim();
      const vol = Number(raw);
      if (!raw || !Number.isFinite(vol) || vol <= 0) {
        setShowMore(true);
        setWateringError("Add a watering volume (ml) to save.");
        // Defer focus so the field is mounted after auto-expand.
        setTimeout(() => {
          wateringInputRef.current?.focus();
          wateringInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        }, 0);
        toast.error("Add a watering volume (ml) to save.");
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
        toast.error(built.message);
        return;
      }

      const result = await saveViaRpc(built.payload);
      if (!result.ok) {
        toast.error(`Couldn't save entry: ${result.reason ?? "save_failed"}`);
        console.error("[QuickLog] RPC save error", result);
        return;
      }

      if (activeGrow && stage !== activeGrow.stage) {
        await supabase.from("grows").update({ stage }).eq("id", activeGrowId);
      }

      // Enrich the toast with the actual target plant name so growers can
      // verify the log landed where they intended (especially when the
      // selected plant differs from the page they opened QuickLog from).
      const plantLabel = selectedPlant.name;
      const verb =
        eventType === "watering"
          ? "watering"
          : eventType === "observation"
            ? "observation"
            : "note";
      const finalMessage =
        successMessage && successMessage !== "Logged 🌱"
          ? successMessage
          : `Logged ${verb} for ${plantLabel}`;
      toast.success(finalMessage);

      reset();
      onOpenChange(false);
      onCreated?.();
      // Refresh both legacy and unified timeline readers so the just-saved
      // entry appears without a hard refresh.
      queryClient.invalidateQueries({ queryKey: ["plant_recent_activity"] });
      queryClient.invalidateQueries({ queryKey: ["diary_entries"] });
      queryClient.invalidateQueries({ queryKey: ["grow_events"] });
      window.dispatchEvent(
        new CustomEvent("verdant:entry-created", {
          detail: { createdAt: new Date().toISOString() },
        }),
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      console.error("[QuickLog] unexpected error", err);
    } finally {
      setBusy(false);
    }
  }

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
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {/* Photo attach is temporarily disabled in the unified Quick
              Log slice. Copy stays grower-facing — never references
              internal table or writer names. */}
          <div
            data-testid="quicklog-photo-coming-soon"
            className="relative aspect-square w-full rounded-xl border-2 border-dashed border-border/40 overflow-hidden bg-secondary/20"
          >
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 px-4 text-center">
              <Camera className="h-10 w-10 opacity-50" />
              <span className="text-sm font-medium">Photo attach — coming soon</span>
              <span className="text-[11px] leading-snug">
                Photo logging is coming soon.
              </span>
            </div>
          </div>


          {/* Event + Stage + Current Setup — compact responsive row.
              Mobile (<sm): 2 cols, Setup wraps onto its own line.
              ≥sm: all three sit side-by-side. Plant keeps its own row
              below so the validation alert/helper has full width. */}
          <div
            data-testid="quicklog-context-row"
            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
          >
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
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Current Setup</Label>
              <Select value={activeGrowId ?? ""} onValueChange={setActiveGrowId}>
                <SelectTrigger>
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

          {/* Plant — full-width row so the validation alert + helper text
              have room to read on narrow viewports. */}
          <div>
            <Label className="text-xs">Plant</Label>
            <Select
              value={plantId || "__none"}
              onValueChange={(v) => setPlantId(v === "__none" ? "" : v)}
            >
              <SelectTrigger
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
            {!selectedPlant ? (
              <p
                id="quick-log-plant-error"
                role="alert"
                className="text-[11px] text-destructive mt-1"
                data-testid="quick-log-plant-error"
              >
                Choose a plant before saving this entry.
              </p>
            ) : (
              <p
                className="text-[11px] text-muted-foreground mt-1"
                data-testid="quick-log-plant-helper"
              >
                {quickLogPlantHelperText(activeGrow?.name ?? null, !!activeGrowId)}
              </p>
            )}
          </div>

          {/* Plant mismatch banner — shown when QuickLog was opened from a
              plant context (prefill.plantId) but the grower changed the
              picker to a different plant. Presenter-only; does not block
              saving. */}
          {prefill?.plantId && selectedPlant && selectedPlant.id !== prefill.plantId && (
            <div
              data-testid="quick-log-plant-mismatch-banner"
              role="status"
              className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[12px] text-amber-200 flex items-start gap-2"
            >
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Logging to <strong className="font-semibold">{selectedPlant.name}</strong>
                {prefill.plantName ? <>, not <strong className="font-semibold">{prefill.plantName}</strong></> : ", not the plant currently open"}.
              </span>
            </div>
          )}


          <div>
            <Label>What's happening?</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Watered, looking healthy, slight yellowing on a fan leaf…"
              rows={3}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={true}
            />
          </div>

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

          {tentSetupRequired ? (
            <p
              data-testid="quick-log-snapshot-tent-required"
              className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-[12px] text-muted-foreground"
            >
              Sensor snapshots need a tent first.{" "}
              <a href="/tents" className="underline text-primary">
                Create your first tent
              </a>{" "}
              to attach environment context to logs.
            </p>
          ) : (
            <>
              {(() => {
                const snapshotUsable = stripView.status === "usable";
                const attachDisabled = !selectedPlant || !snapshotUsable;
                return (
                  <>
                    <label
                      className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${attachDisabled ? "border-border/40 opacity-60" : "border-border/60"}`}
                    >
                      <span className="text-sm flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-primary" />
                        Attach sensor snapshot
                      </span>
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
                      className="text-[11px] text-muted-foreground -mt-2"
                    >
                      {selectedPlant && !snapshotUsable && stripView.status !== "no_data" ? (
                        <span data-testid="quick-log-snapshot-stale-helper">
                          Refresh before attaching this snapshot. Stale or unverified readings are not saved as current sensor context.
                        </span>
                      ) : (
                        "Applies to this log only. Closing Quick Log resets this choice."
                      )}
                    </p>
                    {snapshot && !selectedPlant && (
                      <p
                        className="text-[11px] text-muted-foreground -mt-2"
                        data-testid="quick-log-snapshot-plant-warning"
                      >
                        Choose a plant before attaching plant-specific readings.
                      </p>
                    )}
                  </>
                );
              })()}
            </>
          )}


          <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-3">
            <span className="text-sm">Add more details</span>
            <Switch checked={showMore} onCheckedChange={setShowMore} />
          </label>

          {showMore && (
            <div className="grid grid-cols-2 gap-2">
              {/* pH/Runoff pH have been consolidated into the Hardware
                  readings section below to remove duplicate inputs. */}
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
                  onValueChange={(v) =>
                    setDetails({ ...details, ecUnit: v as EcUnit })
                  }
                >
                  <SelectTrigger data-testid="quicklog-details-ec-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EC_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
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

          {/* Hardware readings — manual handheld grow tools (Spider Farmer pH/EC pen,
              PAR/PPFD meter, etc.). NOT live sensor data. Never written to
              sensor_readings. Never generates alerts or action_queue items. */}
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
              <span className="text-sm font-medium">Hardware readings</span>
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
                  Manual handheld readings — not live sensor data. e.g. Spider Farmer pH/EC combo pen or
                  PAR/PPFD meter. Leave blank if not measured.
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
                    <Label className="text-xs">Feed/Input EC (mS/cm)</Label>
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
                    <Label className="text-xs">Runoff EC (mS/cm)</Label>
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
            const preview = evaluateQuickLogPreview({
              note,
              eventType,
              stage,
              remindAt,
              details,
            });
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
                    const tone =
                      w.severity === "warning" ? "text-amber-300" : "text-muted-foreground";
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

          {!tentSetupRequired && (
            <QuickLogSensorSnapshotStrip
              growId={activeGrowId}
              tentId={selectedPlant?.tent_id ?? null}
              attached={snapshot && !!selectedPlant}
            />
          )}


          <Button
            type="submit"
            disabled={busy || !selectedPlant}
            data-testid="quick-log-save"
            className="gradient-leaf text-primary-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save entry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
