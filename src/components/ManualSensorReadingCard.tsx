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

interface TentOption {
  id: string;
  name: string;
}

interface Props {
  tents: TentOption[];
  defaultTentId?: string;
}

const EMPTY: ManualEntryInput = {
  airTempF: "",
  humidityPct: "",
  vpdKpa: "",
  co2Ppm: "",
  soilMoisturePct: "",
};

export default function ManualSensorReadingCard({ tents, defaultTentId }: Props) {
  const [tentId, setTentId] = useState<string>(defaultTentId ?? tents[0]?.id ?? "");
  const [form, setForm] = useState<ManualEntryInput>(EMPTY);
  const insert = useInsertSensorReading();

  const validation = useMemo(() => validateManualEntry(form), [form]);

  function update<K extends keyof ManualEntryInput>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
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
      toast.success(`Saved ${payloads.length} manual reading${payloads.length === 1 ? "" : "s"}.`);
      setForm(EMPTY);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      toast.error(msg);
    }
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
            Saved as a <strong>manual snapshot</strong>, not live sensor data.
            Good for handheld tools like the SwitchBot CO₂/temp/RH monitor.
          </span>
        </div>

        {tents.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="manual-reading-tent" className="text-xs">
              Tent
            </Label>
            <Select value={tentId} onValueChange={setTentId}>
              <SelectTrigger id="manual-reading-tent">
                <SelectValue placeholder="Select tent" />
              </SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          pH, EC/TDS, water temp, and PPFD/DLI from pens like the Spider Farmer
          pH/EC combo or PAR meter aren't stored as sensor metrics yet — log
          them as a Quick Log feeding or observation note for now.
        </p>


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
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-destructive"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
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

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
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
