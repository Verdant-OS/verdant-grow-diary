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
import { EVENT_TYPES } from "@/lib/diary";
import { EC_UNITS, type EcUnit } from "@/constants/units";
import { usePlants } from "@/hooks/use-plants";
import { evaluateQuickLogPreview } from "@/lib/quickLogPreviewRules";
import {
  appendHardwareReadingsToNote,
  hasAnyHardwareReading,
  type QuickLogHardwareReadings,
} from "@/lib/quickLogHardwareReadingsRules";
import {
  filterQuickLogPlantOptions,
  quickLogPlantHelperText,
} from "@/lib/quickLogPlantOptionRules";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { buildQuickLogSnapshotStrip } from "@/lib/quickLogSnapshotStripAdapter";
import { useQuickLogV2Save } from "@/hooks/useQuickLogV2Save";
import {
  buildLegacyQuickLogUnifiedPayload,
  isSupportedLegacyEventType,
  UNSUPPORTED_EVENT_TYPE_COPY,
} from "@/lib/legacyQuickLogUnifiedSave";

import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";

export interface QuickLogPrefill {
  plantId?: string | null;
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
  
  // Tracks whether the grower has manually changed the attach toggle in
  // this session. Until they do, we may auto-default it based on whether
  // the latest snapshot classifies as `usable` (Gate 1 trust rule).
  const snapshotUserTouchedRef = useRef(false);

  // Apply prefill when the dialog opens. Does NOT submit — grower still
  // chooses to save the entry.
  useEffect(() => {
    if (!open || !prefill) return;
    if (prefill.growId && prefill.growId !== activeGrowId) {
      setActiveGrowId(prefill.growId);
    }
    if (prefill.plantId) setPlantId(prefill.plantId);
    if (prefill.eventType) setEventType(prefill.eventType);
    if (prefill.suggestSnapshot && prefill.tentId) setSnapshot(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    prefill?.plantId,
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

  // Drive the sensor snapshot strip + auto-attach default from the same
  // contract-derived status the strip uses. We call the loader here so the
  // parent can react to status transitions without duplicating any
  // classification logic in this .tsx.
  const sensorTentIds = selectedPlant?.tent_id ? [selectedPlant.tent_id] : [];
  const sensorState = useLatestSensorSnapshot(activeGrowId, sensorTentIds);
  const stripView = useMemo(
    () =>
      buildQuickLogSnapshotStrip({
        snapshot: sensorState.snapshot,
        loading: sensorState.status === "loading",
        hasTent: !!selectedPlant?.tent_id,
        attached: snapshot,
      }),
    [sensorState.snapshot, sensorState.status, selectedPlant?.tent_id, snapshot],
  );

  // When the snapshot becomes `usable` and the grower has NOT manually
  // toggled the attach switch in this session, default it to ON so the
  // strip's "this log will include current sensor context" copy matches
  // what the save payload will actually include.
  useEffect(() => {
    if (!open) return;
    if (snapshotUserTouchedRef.current) return;
    if (!selectedPlant?.tent_id) return;
    if (stripView.status === "usable" && !snapshot) {
      setSnapshot(true);
    }
  }, [open, stripView.status, selectedPlant?.tent_id, snapshot]);

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

    setBusy(true);
    try {
      const noteWithHardware = appendHardwareReadingsToNote(note, hardware);
      const built = buildLegacyQuickLogUnifiedPayload({
        eventType,
        noteWithHardware,
        plantId: selectedPlant.id,
        plantTentId: selectedPlant.tent_id ?? null,
        details,
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

      toast.success(successMessage);
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
          {/* Photo — disabled in unified Quick Log slice. Photo attach
              will return when grow_events gains a photo writer path. */}
          <div
            data-testid="quicklog-photo-coming-soon"
            className="relative aspect-square w-full rounded-xl border-2 border-dashed border-border/40 overflow-hidden bg-secondary/20"
          >
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 px-4 text-center">
              <Camera className="h-10 w-10 opacity-50" />
              <span className="text-sm font-medium">Photo attach — coming soon</span>
              <span className="text-[11px] leading-snug">
                Photo logs will return after the unified grow_events writer is expanded.
              </span>
            </div>
          </div>


          {/* Event type + Stage */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Event</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => {
                    const supported = isSupportedLegacyEventType(t.value);
                    return (
                      <SelectItem key={t.value} value={t.value} disabled={!supported}>
                        <span className="inline-flex items-center gap-2">
                          <t.icon className="h-3.5 w-3.5" />
                          {t.label}
                          {!supported && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              Coming soon
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
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

          {/* Current Setup + Plant */}
          <div className="grid grid-cols-2 gap-2">
            <div>
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
            <div>
              <Label className="text-xs">Plant (optional)</Label>
              <Select
                value={plantId || "__none"}
                onValueChange={(v) => setPlantId(v === "__none" ? "" : v)}
              >
                <SelectTrigger data-testid="quick-log-plant-select">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No specific plant</SelectItem>
                  {scopedPlants.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.strain ? ` · ${p.strain}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p
                className="text-[11px] text-muted-foreground mt-1"
                data-testid="quick-log-plant-helper"
              >
                {quickLogPlantHelperText(activeGrow?.name ?? null, !!activeGrowId)}
              </p>
            </div>
          </div>

          <div>
            <Label>What's happening?</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Watered, looking healthy, slight yellowing on a fan leaf…"
              rows={3}
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

          <label
            className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${selectedPlant ? "border-border/60" : "border-border/40 opacity-60"}`}
          >
            <span className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              Attach sensor snapshot
            </span>
            <Switch
              checked={snapshot && !!selectedPlant}
              onCheckedChange={(v) => {
                snapshotUserTouchedRef.current = true;
                setSnapshot(v);
              }}
              disabled={!selectedPlant}
            />
          </label>
          {snapshot && !selectedPlant && (
            <p className="text-[11px] text-muted-foreground -mt-2">
              Pick a plant to capture its tent's latest readings.
            </p>
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
                <Label className="text-xs">Watering (ml)</Label>
                <Input
                  inputMode="decimal"
                  value={details.watering}
                  onChange={(e) => setDetails({ ...details, watering: e.target.value })}
                />
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
            className="rounded-lg border border-border/60 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Hardware readings</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Optional
              </span>
            </div>
            <p
              data-testid="quicklog-hardware-helper"
              className="text-[11px] text-muted-foreground leading-snug"
            >
              Manual handheld readings — not live sensor data. e.g. Spider Farmer pH/EC combo pen or
              PAR/PPFD meter. Leave blank if not measured.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Input pH</Label>
                <Input
                  inputMode="decimal"
                  value={hardware.inputPh ?? ""}
                  onChange={(e) => setHardware({ ...hardware, inputPh: e.target.value })}
                  placeholder="6.2"
                />
              </div>
              <div>
                <Label className="text-xs">Input EC/PPM</Label>
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
                <Label className="text-xs">Runoff EC/PPM</Label>
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

          <QuickLogSensorSnapshotStrip
            growId={activeGrowId}
            tentId={selectedPlant?.tent_id ?? null}
            attached={snapshot && !!selectedPlant}
          />

          <Button type="submit" disabled={busy} className="gradient-leaf text-primary-foreground">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save entry"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
