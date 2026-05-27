import VpdStageMissingBadge from "@/components/VpdStageMissingBadge";
import EnvironmentStabilityCard from "@/components/EnvironmentStabilityCard";
import { computeEnvironmentStability } from "@/lib/environmentStabilityRules";
import { useState } from "react";
import { Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SensorChart from "@/components/SensorChart";
import GrowDataSourceBadge from "@/components/GrowDataSourceBadge";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { useGrowTents, useGrowSensorReadings } from "@/hooks/useGrowData";
import { useTents as useTentRows } from "@/hooks/use-tents";
import { classifyGrowDataSource } from "@/lib/growDataSourceLabelRules";
import { VPD_STAGE_HELPER_TEXT } from "@/lib/vpdStageTargetRules";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "temp", label: "Temperature" },
  { key: "rh", label: "Humidity" },
  { key: "vpd", label: "VPD" },
  { key: "co2", label: "CO₂" },
  { key: "soil", label: "Soil moisture" },
] as const;

export default function Sensors() {
  const { data: tents = [] } = useGrowTents();
  const { data: readings = [] } = useGrowSensorReadings();
  // Real DB tents (uuid-backed) for the manual entry form — only these can
  // be written to via RLS. The display list above may include mock tents.
  const { data: realTents = [] } = useTentRows();
  const [tentId, setTentId] = useState<string>(tents[0]?.id ?? "t1");
  const filtered = readings.filter((r) => r.tentId === tentId);
  const latest = filtered.length > 0 ? filtered[filtered.length - 1] : null;
  const selectedTent = tents.find((t) => t.id === tentId) ?? null;
  const selectedTentStage =
    (selectedTent as unknown as { stage?: string | null } | null)?.stage ?? null;
  const vpdStageMissing = latest?.vpd != null && selectedTentStage == null;

  // AUD-003 fix: classify based on the actual latest reading. If a reading
  // exists but is older than the freshness window, label it "Stale" and
  // still render the chart instead of hiding it as "Unavailable". Only the
  // truly-empty case should render the empty state.
  // `useGrowSensorReadings` currently silently falls back to mock data
  // (documented in docs/grow-os-architecture.md); when the slice is empty we
  // honestly classify it as Unavailable rather than fabricating a source.
  const latestSourceRaw =
    (latest as unknown as { source?: string | null } | null)?.source ?? null;
  const latestSource =
    typeof latestSourceRaw === "string" && latestSourceRaw.length > 0
      ? latestSourceRaw
      : latest
        ? "demo"
        : null;
  const classification = classifyGrowDataSource(
    latest
      ? { source: latestSource, value: latest.temp, timestamp: latest.ts }
      : { source: null, value: null, timestamp: null },
  );
  const hasReadings = filtered.length > 0;

  const manualTents = realTents.map((t) => ({ id: t.id as string, name: t.name as string }));
  // Only auto-default when the chip-selected tent exists as a real DB tent;
  // otherwise leave it undefined so the user must consciously pick from the
  // tent dropdown rather than silently writing to manualTents[0].
  const defaultManualTentId = manualTents.find((t) => t.id === tentId)?.id;

  return (
    <div>
      <PageHeader title="Sensor Data" description="Environmental telemetry across tents." icon={<Activity className="h-5 w-5" />} />
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {tents.map((t) => (
          <button key={t.id} onClick={() => setTentId(t.id)}
            className={cn("text-xs px-2.5 py-1 rounded-full border transition", tentId === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border/50 hover:bg-secondary")}>
            {t.name}
          </button>
        ))}
        <GrowDataSourceBadge classification={classification} className="ml-2" />
      </div>
      <EnvironmentStabilityCard
        testId="sensors-environment-stability"
        className="mb-4"
        result={computeEnvironmentStability(filtered, {
          stage: selectedTentStage,
        })}
      />
      <div className="grid lg:grid-cols-2 gap-4">
        {METRICS.map((m) => (
          <div key={m.key} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold">{m.label}</h3>
              <GrowDataSourceBadge classification={classification} />
            </div>
            {!hasReadings ? (
              <p
                className="text-xs text-muted-foreground py-6 text-center"
                data-testid={`sensors-empty-${m.key}`}
              >
                No reading available.
              </p>
            ) : (
              <SensorChart data={filtered} metric={m.key} height={200} />
            )}
            {m.key === "vpd" && (
              <p
                className="text-[11px] text-muted-foreground mt-2"
                data-testid="sensors-vpd-stage-hint"
              >
                {VPD_STAGE_HELPER_TEXT}
              </p>
            )}
            {m.key === "vpd" && vpdStageMissing && (
              <VpdStageMissingBadge
                testId="sensors-vpd-stage-missing-badge"
                className="mt-2"
              />
            )}
          </div>
        ))}
      </div>
      {manualTents.length > 0 && (
        <div className="mt-4 max-w-xl">
          <ManualSensorReadingCard tents={manualTents} defaultTentId={defaultManualTentId} />
        </div>
      )}
    </div>
  );
}
