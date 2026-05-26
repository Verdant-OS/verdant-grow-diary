import { useMemo, useState } from "react";
import { AlertTriangle, Gauge, Info, Loader2 } from "lucide-react";
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

interface TentOption {
  id: string;
  name: string;
}

interface Props {
  tents: TentOption[];
  defaultTentId?: string;
  successMessage?: string;
  onSaved?: (meta: { tentId: string; metricsSaved: number; createdAt: string }) => void;
}

const EMPTY: ManualEntryInput = {
  airTempF: "",
  humidityPct: "",
  vpdKpa: "",
  co2Ppm: "",
  soilMoisturePct: "",
};

export default function ManualSensorReadingCard({
  tents,
  defaultTentId,
  successMessage,
  onSaved,
}: Props) {
  const [tentId, setTentId] = useState<string>(defaultTentId ?? tents[0]?.id ?? "");
  const [form, setForm] = useState<ManualEntryInput>(EMPTY);
  const [devicePreset, setDevicePreset] = useState<string>("none");
  const [deviceCustom, setDeviceCustom] = useState<string>("");
  const [reviewOpen, setReviewOpen] = useState(false);
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

  function update<K extends keyof ManualEntryInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    // Any edit invalidates a previously-shown review prompt so it must be
    // re-triggered on the next save attempt against the new values.
    if (reviewOpen) setReviewOpen(false);
  }

  async function doSave() {
    const payloads = buildManualReadingPayloads({
      tentId,
      metrics: validation.metrics,
    });
    try {
      // Sequential keeps ordering deterministic and per-row error surfacing
      // simple; manual entries are tiny (≤ 5 metrics).
      for (const p of payloads) {
        await insert.mutateAsync(p);
      }
      toast.success(
        successMessage ??
          `Saved ${payloads.length} manual reading${payloads.length === 1 ? "" : "s"}.`,
      );
      onSaved?.({
        tentId,
        metricsSaved: payloads.length,
        createdAt: new Date().toISOString(),
      });
      setForm(EMPTY);
      setReviewOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      toast.error(msg);
    }
  }

  async function onSave() {
    if (!tentId) {
      toast.error("Pick a tent first.");
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

  return (
    <Card className="glass" data-testid="manual-sensor-reading-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-display">
          <Gauge className="h-4 w-4" />
          Add Manual Sensor Reading
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/40 p-2 text-xs text-muted-foreground"
          data-testid="manual-reading-helper"
        >
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Saved as a <strong>manual snapshot</strong>, not live sensor data. Good for handheld
            tools like the SwitchBot CO₂/temp/RH monitor.
          </span>
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
            placeholder="e.g. 800 from SwitchBot CO₂ Monitor"
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

        <p
          className="text-[11px] text-muted-foreground"
          data-testid="manual-reading-out-of-scope-hint"
        >
          pH, EC/TDS, water temp, and PPFD/DLI from pens like the Spider Farmer pH/EC combo or PAR
          meter aren't stored as sensor metrics yet — log them as a Quick Log feeding or observation
          note for now.
        </p>

        {advisor.derivedVpdKpa !== null && (
          <p className="text-[11px] text-muted-foreground" data-testid="manual-reading-derived-vpd">
            Derived VPD ≈ <strong>{advisor.derivedVpdKpa} kPa</strong> from your air temp +
            humidity. Saved as the VPD value unless you enter one.
          </p>
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
