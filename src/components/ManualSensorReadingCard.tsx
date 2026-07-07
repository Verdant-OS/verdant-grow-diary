import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, Info, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  buildManualSaveSuccessLine,
  mapManualSaveErrorToUserMessage,
} from "@/lib/manualSensorSaveConfirmation";
import { useInsertSensorReading } from "@/hooks/useInsertSensorReading";
import {
  buildManualReadingPayloads,
  validateManualEntry,
  type ManualEntryInput,
} from "@/lib/sensorReadingManualEntryRules";
import {
  getManualSensorDeviceOptions,
  normalizeManualSourceNote,
  MAX_MANUAL_DEVICE_NOTE_LEN,
} from "@/lib/manualSensorSourceLabel";
import { evaluateManualSnapshotAdvisor } from "@/lib/manualSensorSnapshotAdvisorRules";
import {
  evaluateManualSensorSnapshotQuality,
  type ManualSensorSnapshotInput,
} from "@/lib/manualSensorSnapshotQualityRules";
import ManualSensorSnapshotQualityBadge from "@/components/ManualSensorSnapshotQualityBadge";
import DerivedVpdStatus from "@/components/DerivedVpdStatus";
import {
  validateManualSensorSnapshotFields,
  VPD_CONFLICT_THRESHOLD_KPA,
} from "@/lib/manualSensorSnapshotFieldValidation";
import FirstTentSetupEmptyState from "@/components/FirstTentSetupEmptyState";
import { shouldRequireFirstTentSetup } from "@/lib/firstTentSetupRules";
import { isUuid } from "@/lib/isUuid";
import {
  MANUAL_SENSOR_TRUTH_TITLE,
  MANUAL_SENSOR_TRUTH_SOURCE_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE,
  MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE,
  MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE,
} from "@/constants/manualSensorTruthCopy";

interface TentOption {
  id: string;
  name: string;
}

interface Props {
  tents: TentOption[];
  defaultTentId?: string;
  successMessage?: string;
  /** When provided, the post-save next-step links Alerts filtered to this grow. */
  growId?: string;
  onSaved?: (meta: { tentId: string; metricsSaved: number; createdAt: string }) => void;
}

interface LastSavedConfirmation {
  line: string;
  capturedAt: string;
  tentId: string;
}

const EMPTY: ManualEntryInput = {
  airTempF: "",
  humidityPct: "",
  vpdKpa: "",
  co2Ppm: "",
  soilMoisturePct: "",
  ppfd: "",
};

export default function ManualSensorReadingCard({
  tents,
  defaultTentId,
  successMessage,
  growId,
  onSaved,
}: Props) {
  const [tentId, setTentId] = useState<string>(defaultTentId ?? tents[0]?.id ?? "");
  const [form, setForm] = useState<ManualEntryInput>(EMPTY);
  const [devicePreset, setDevicePreset] = useState<string>("none");
  const [deviceCustom, setDeviceCustom] = useState<string>("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastSaved, setLastSaved] = useState<LastSavedConfirmation | null>(null);
  const insert = useInsertSensorReading();

  const devicePresets = useMemo(() => getManualSensorDeviceOptions(), []);
  const deviceNote = useMemo(() => {
    if (devicePreset === "custom") return normalizeManualSourceNote(deviceCustom);
    if (devicePreset === "none" || !devicePreset) return null;
    const preset = devicePresets.find((p) => p.id === devicePreset);
    return preset ? normalizeManualSourceNote(preset.label) : null;
  }, [devicePreset, deviceCustom, devicePresets]);

  const validation = useMemo(() => validateManualEntry(form), [form]);
  const advisor = useMemo(() => evaluateManualSnapshotAdvisor(form), [form]);
  const snapshotQuality = useMemo(() => {
    // Build a sanitized snapshot from validated metrics only. No raw_payload,
    // no vendor metadata, no tokens, no private IDs. captured_at = now since
    // the grower is entering a current reading right now.
    const fields: Record<string, number> = {};
    for (const m of validation.metrics) {
      if (m.metric === "temperature_c") fields.temperature_c = m.value;
      else if (m.metric === "humidity_pct") fields.humidity_pct = m.value;
      else if (m.metric === "vpd_kpa") fields.vpd_kpa = m.value;
      else if (m.metric === "soil_moisture_pct") fields.soil_moisture_pct = m.value;
    }
    const snap: ManualSensorSnapshotInput = {
      source: "manual",
      captured_at: new Date().toISOString(),
      ...fields,
    };
    return evaluateManualSensorSnapshotQuality(snap);
  }, [validation.metrics]);

  // Entered vs derived VPD comparison. Uses only sanitized numeric metrics —
  // never relabels source. If the grower entered a VPD that disagrees with
  // temp/RH-derived VPD by more than `VPD_CONFLICT_THRESHOLD_KPA`, the
  // validator returns a warn hint on `vpdKpa`; we surface it inline.
  //
  // We only treat VPD as "entered" when the grower literally typed one in
  // the VPD field (form.vpdKpa is a non-empty string). Auto-derived VPD
  // that appears in validation.metrics from temp+RH must NOT be treated as
  // entered — that would suppress the derived display and mask conflicts.
  const fieldValidation = useMemo(() => {
    const fields: {
      temperatureC?: number;
      humidityPct?: number;
      vpdKpa?: number;
    } = {};
    for (const m of validation.metrics) {
      if (m.metric === "temperature_c") fields.temperatureC = m.value;
      else if (m.metric === "humidity_pct") fields.humidityPct = m.value;
    }
    const rawVpd = typeof form.vpdKpa === "string" ? form.vpdKpa.trim() : "";
    if (rawVpd.length > 0) {
      const n = Number(rawVpd);
      if (Number.isFinite(n)) fields.vpdKpa = n;
    }
    return validateManualSensorSnapshotFields({
      source: "manual",
      capturedAt: new Date().toISOString(),
      ...fields,
    });
  }, [validation.metrics, form.vpdKpa]);
  const enteredVpd = fieldValidation.derivedVpd.kind === "entered"
    ? fieldValidation.derivedVpd.vpdKpa
    : null;
  const derivedVpdFromTempRh = useMemo(() => {
    // Compute derived VPD independently so we can render entered vs derived
    // side-by-side even when the grower typed a VPD.
    const t = validation.metrics.find((m) => m.metric === "temperature_c");
    const h = validation.metrics.find((m) => m.metric === "humidity_pct");
    if (!t || !h) return null;
    const fresh = validateManualSensorSnapshotFields({
      source: "manual",
      capturedAt: new Date().toISOString(),
      temperatureC: t.value,
      humidityPct: h.value,
    });
    return fresh.derivedVpd.kind === "derived" ? fresh.derivedVpd.vpdKpa : null;
  }, [validation.metrics]);
  const vpdConflictHint = fieldValidation.hints.find(
    (h) => h.field === "vpdKpa" && h.severity === "warn",
  );



  function update<K extends keyof ManualEntryInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    // Any edit invalidates a previously-shown review prompt so it must be
    // re-triggered on the next save attempt against the new values.
    if (reviewOpen) setReviewOpen(false);
    // Editing after a save dismisses the prior confirmation so it never
    // confuses the grower about the current form state.
    if (lastSaved) setLastSaved(null);
  }

  async function doSave() {
    // Belt-and-suspenders: even though Save buttons are disabled while
    // pending, guard against a second concurrent call from any path.
    if (insert.isPending) return;
    const capturedMetrics = validation.metrics;
    const payloads = buildManualReadingPayloads({
      tentId,
      metrics: capturedMetrics,
      deviceNote,
    });
    try {
      // Sequential keeps ordering deterministic and per-row error surfacing
      // simple; manual entries are tiny (≤ 5 metrics).
      for (const p of payloads) {
        await insert.mutateAsync(p);
      }
      const createdAt = new Date().toISOString();
      const successLine = buildManualSaveSuccessLine({ metrics: capturedMetrics });
      toast.success(successMessage ?? successLine);
      onSaved?.({
        tentId,
        metricsSaved: payloads.length,
        createdAt,
      });
      setLastSaved({ line: successLine, capturedAt: createdAt, tentId });
      setForm(EMPTY);
      setDevicePreset("none");
      setDeviceCustom("");
      setReviewOpen(false);
    } catch (err) {
      // Preserve entered values (we don't clear the form on failure) and
      // surface a safe operator-facing error. Never echo raw internals.
      const msg = mapManualSaveErrorToUserMessage(err);
      toast.error(msg);
      // Developer-safe diagnostic: console only, not in UI.
      // eslint-disable-next-line no-console
      console.warn("[manual-sensor-save] failed");
    }
  }

  async function onSave() {
    if (!tentId) {
      toast.error("Pick a tent first.");
      return;
    }
    if (!isUuid(tentId)) {
      toast.error("Select a real tent before saving a manual sensor reading.");
      return;
    }
    if (!validation.ok) {
      toast.error(validation.errors[0] ?? "Reading is invalid.");
      return;
    }
    // Suspicious values → show review prompt instead of saving immediately.
    // Normal readings (no advisor warnings) save exactly as before.
    if (advisor.warnings.length > 0 && !reviewOpen) {
      setReviewOpen(true);
      return;
    }
    await doSave();
  }

  const tentSetupRequired = shouldRequireFirstTentSetup(
    tents.map((t) => ({ id: t.id, is_archived: false })),
  );

  return (
    <Card className="glass" data-testid="manual-sensor-reading-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <Gauge className="h-4 w-4" />
          Add Manual Sensor Reading
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tentSetupRequired ? (
          <FirstTentSetupEmptyState
            surface="manual_sensor"
            testId="manual-reading-first-tent-setup"
          />
        ) : (
          <>

        <div
          className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/40 p-2 text-xs text-muted-foreground"
          data-testid="manual-reading-helper"
        >
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p>
              <strong>{MANUAL_SENSOR_TRUTH_TITLE}</strong> — {MANUAL_SENSOR_TRUTH_SOURCE_LINE}
            </p>
            <p data-testid="manual-reading-helper-not-device-control">
              {MANUAL_SENSOR_TRUTH_NOT_DEVICE_CONTROL_LINE}
            </p>
            <p data-testid="manual-reading-helper-not-diagnosis">
              {MANUAL_SENSOR_TRUTH_NOT_DIAGNOSIS_LINE}
            </p>
            {validation.metrics.length === 0 && (
              <p data-testid="manual-reading-helper-missing-readings">
                {MANUAL_SENSOR_TRUTH_MISSING_READINGS_LINE}
              </p>
            )}
            <p className="text-[11px] opacity-80">
              Good for handheld tools and EcoWitt console/app readouts (e.g. WH45 CO₂/THP, WH31
              temp/RH, WH51 soil).
            </p>
          </div>
        </div>

        {tents.length > 0 && (
          <div className="space-y-1" data-testid="manual-reading-tent-row">
            <Label htmlFor="manual-reading-tent" className="text-xs">
              Tent
            </Label>
            <Select value={tentId} onValueChange={setTentId}>
              <SelectTrigger id="manual-reading-tent" data-testid="manual-reading-tent-select">
                <SelectValue placeholder="Select tent" />
              </SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem
                    key={t.id}
                    value={t.id}
                    data-testid={`manual-reading-tent-option-${t.id}`}
                  >
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Saving to: <strong>{tents.find((t) => t.id === tentId)?.name ?? "—"}</strong>
            </p>
          </div>
        )}

        <div className="space-y-1" data-testid="manual-reading-device-row">
          <Label htmlFor="manual-reading-device" className="text-xs">
            Reading source / device <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Select value={devicePreset} onValueChange={setDevicePreset}>
            <SelectTrigger
              id="manual-reading-device"
              data-testid="manual-reading-device-select"
            >
              <SelectValue placeholder="Where did this reading come from?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" data-testid="manual-reading-device-option-none">
                Not specified
              </SelectItem>
              {devicePresets.map((opt) => (
                <SelectItem
                  key={opt.id}
                  value={opt.id}
                  data-testid={`manual-reading-device-option-${opt.id}`}
                >
                  {opt.label}
                </SelectItem>
              ))}
              <SelectItem value="custom" data-testid="manual-reading-device-option-custom">
                Other (type a short note)
              </SelectItem>
            </SelectContent>
          </Select>
          {devicePreset === "custom" && (
            <Input
              id="manual-reading-device-custom"
              data-testid="manual-reading-device-custom"
              value={deviceCustom}
              onChange={(e) => setDeviceCustom(e.target.value)}
              maxLength={MAX_MANUAL_DEVICE_NOTE_LEN}
              placeholder="e.g. SensorPush HT.w"
              className="mt-1"
            />
          )}
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="manual-reading-device-hint"
          >
            Optional note about where this reading came from. Stays labeled as a manual,
            user-entered reading — not a connected device.
          </p>
        </div>



        <Section title="Air" testId="manual-reading-section-air">
          <Field
            id="m-air-temp"
            label="Air temp"
            unit="°F"
            value={form.airTempF as string}
            onChange={(v) => update("airTempF", v)}
            placeholder="75"
          />
          <Field
            id="m-humidity"
            label="Humidity"
            unit="%"
            value={form.humidityPct as string}
            onChange={(v) => update("humidityPct", v)}
            placeholder="55"
          />
          <Field
            id="m-co2"
            label="CO₂"
            unit="ppm"
            value={form.co2Ppm as string}
            onChange={(v) => update("co2Ppm", v)}
            placeholder="e.g. 800 from EcoWitt WH45 CO₂ Monitor"
          />
          <Field
            id="m-vpd"
            label="VPD"
            unit="kPa"
            value={form.vpdKpa as string}
            onChange={(v) => update("vpdKpa", v)}
            placeholder="auto from temp + RH"
          />
        </Section>

        <Section title="Root zone" testId="manual-reading-section-root">
          <Field
            id="m-soil"
            label="Soil water"
            unit="%"
            value={form.soilMoisturePct as string}
            onChange={(v) => update("soilMoisturePct", v)}
            placeholder="45"
          />
        </Section>

        <Section title="Light" testId="manual-reading-section-light">
          <Field
            id="m-ppfd"
            label="PPFD"
            unit="µmol/m²/s"
            value={form.ppfd as string}
            onChange={(v) => update("ppfd", v)}
            placeholder="e.g. 650"
          />
        </Section>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="manual-reading-ppfd-hint"
        >
          Enter PPFD from a PAR/quantum meter. Do not estimate from light percentage or watts.
        </p>

        <p
          className="text-[11px] text-muted-foreground"
          data-testid="manual-reading-out-of-scope-hint"
        >
          pH, EC/TDS, water temp, and DLI from pens like the Spider Farmer pH/EC combo aren't
          stored as sensor metrics yet — log them as a Quick Log feeding or observation note for
          now.
        </p>

        <DerivedVpdStatus
          testId="manual-reading-derived-vpd"
          airTempF={form.airTempF as string}
          humidityPct={form.humidityPct as string}
        />
        {advisor.derivedVpdKpa !== null && (
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="manual-reading-derived-vpd-hint"
          >
            Saved as the VPD value unless you enter one.
          </p>
        )}

        {(enteredVpd !== null || derivedVpdFromTempRh !== null) && (
          <div
            className="rounded-md border border-border/40 bg-secondary/10 p-2 text-xs"
            data-testid="manual-reading-vpd-comparison"
            data-vpd-conflict={vpdConflictHint ? "true" : "false"}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className="tabular-nums"
                data-testid="manual-reading-vpd-entered"
                data-value={enteredVpd ?? ""}
              >
                <span className="text-muted-foreground">Entered VPD:</span>{" "}
                {enteredVpd !== null ? `${enteredVpd.toFixed(2)} kPa` : "—"}
              </span>
              <span
                className="tabular-nums"
                data-testid="manual-reading-vpd-derived"
                data-value={derivedVpdFromTempRh ?? ""}
              >
                <span className="text-muted-foreground">Derived VPD (temp + RH):</span>{" "}
                {derivedVpdFromTempRh !== null
                  ? `${derivedVpdFromTempRh.toFixed(2)} kPa`
                  : "—"}
              </span>
            </div>
            {vpdConflictHint && (
              <p
                className="mt-1 flex items-start gap-1.5 text-amber-600 dark:text-amber-400"
                data-testid="manual-reading-vpd-conflict-warning"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{vpdConflictHint.message}</span>
              </p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground">
              Manual entry — derived VPD never relabels this reading as live.
              Conflict threshold: {VPD_CONFLICT_THRESHOLD_KPA.toFixed(2)} kPa.
            </p>
          </div>
        )}


        {advisor.warnings.length > 0 && (
          <ul className="space-y-1" data-testid="manual-reading-advisor-warnings">
            {advisor.warnings.map((w, i) => (
              <li
                key={`adv-${i}`}
                className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {validation.warnings.length > 0 && (
          <ul className="space-y-1" data-testid="manual-reading-warnings">
            {validation.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
        {validation.errors.length > 0 && (
          <ul className="space-y-1" data-testid="manual-reading-errors">
            {validation.errors.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        )}

        {reviewOpen && advisor.warnings.length > 0 && (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2"
            data-testid="manual-reading-review-prompt"
            role="alertdialog"
            aria-label="Review suspicious readings before saving"
          >
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              Double-check these readings before saving.
            </p>
            <ul className="space-y-1">
              {advisor.warnings.map((w, i) => (
                <li
                  key={`rev-${i}`}
                  className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewOpen(false)}
                data-testid="manual-reading-review-edit"
              >
                Edit readings
              </Button>
              <Button
                size="sm"
                onClick={doSave}
                disabled={insert.isPending}
                data-testid="manual-reading-review-save-anyway"
              >
                {insert.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save anyway"
                )}
              </Button>
            </div>
          </div>
        )}

        <section
          className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2"
          data-testid="manual-reading-snapshot-quality"
          aria-label="Snapshot quality"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Snapshot quality
            </h3>
          </div>
          <ManualSensorSnapshotQualityBadge evaluation={snapshotQuality} />
          <p className="text-[11px] text-muted-foreground">
            This check helps AI Doctor decide whether the reading can support
            current-room guidance.
          </p>
        </section>

        {lastSaved && (
          <div
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2"
            data-testid="manual-reading-saved-confirmation"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p
                  className="text-xs font-medium text-emerald-700 dark:text-emerald-300"
                  data-testid="manual-reading-saved-line"
                >
                  {lastSaved.line}
                </p>
                <p
                  className="text-[11px] text-muted-foreground"
                  data-testid="manual-reading-saved-captured-at"
                >
                  Captured {new Date(lastSaved.capturedAt).toLocaleString()}. Now
                  available for snapshot and alert evaluation.
                </p>
                <Link
                  to={growId ? `/alerts?growId=${encodeURIComponent(growId)}` : "/alerts"}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                  data-testid="manual-reading-next-step-alerts"
                >
                  Next: open Alerts to check this snapshot against current targets
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        )}


        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            {validation.metrics.length > 0
              ? `${validation.metrics.length} metric${validation.metrics.length === 1 ? "" : "s"} ready`
              : "No metrics entered yet"}
          </p>
          <Button
            onClick={onSave}
            disabled={!validation.ok || !tentId || insert.isPending}
            data-testid="manual-reading-save"
          >
            {insert.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save Reading"
            )}
          </Button>
        </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2" data-testid={testId}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs flex items-center justify-between gap-2">
        <span>{label}</span>
        {unit ? (
          <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
        ) : null}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
