import { useState } from "react";
import { Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SensorChart from "@/components/SensorChart";
import GrowDataSourceBadge from "@/components/GrowDataSourceBadge";
import ManualSensorReadingCard from "@/components/ManualSensorReadingCard";
import { useGrowTents, useGrowSensorReadings } from "@/hooks/useGrowData";
import { useTents as useTentRows } from "@/hooks/use-tents";
import { classifyGrowDataSource } from "@/lib/growDataSourceLabelRules";
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

  // useGrowSensorReadings currently silently falls back to mock data
  // (documented in docs/grow-os-architecture.md). Until that fallback is
  // removed, we honestly label what is on screen as Demo data and surface
  // Unavailable when the slice is empty.
  const classification = classifyGrowDataSource(
    latest
      ? { source: "demo", value: latest.temp, timestamp: latest.ts }
      : { source: null, value: null, timestamp: null },
  );

  const manualTents = realTents.map((t) => ({ id: t.id as string, name: t.name as string }));
  const defaultManualTentId = manualTents.find((t) => t.id === tentId)?.id ?? manualTents[0]?.id;

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
      <div className="grid lg:grid-cols-2 gap-4">
        {METRICS.map((m) => (
          <div key={m.key} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold">{m.label}</h3>
              <GrowDataSourceBadge classification={classification} />
            </div>
            {classification.label === "Unavailable" ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No reading available.
              </p>
            ) : (
              <SensorChart data={filtered} metric={m.key} height={200} />
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
