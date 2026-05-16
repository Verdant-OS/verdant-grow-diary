import { useState } from "react";
import { Activity } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SensorChart from "@/components/SensorChart";
import { useTents } from "@/hooks/useMockData";
import { useGrowSensorReadings } from "@/hooks/useGrowData";
import { cn } from "@/lib/utils";

const METRICS = [
  { key: "temp", label: "Temperature" },
  { key: "rh", label: "Humidity" },
  { key: "vpd", label: "VPD" },
  { key: "co2", label: "CO₂" },
  { key: "soil", label: "Soil moisture" },
] as const;

export default function Sensors() {
  const { data: tents = [] } = useTents();
  const { data: readings = [] } = useGrowSensorReadings();
  const [tentId, setTentId] = useState<string>(tents[0]?.id ?? "t1");
  const filtered = readings.filter((r) => r.tentId === tentId);

  return (
    <div>
      <PageHeader title="Sensor Data" description="Environmental telemetry across tents." icon={<Activity className="h-5 w-5" />} />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tents.map((t) => (
          <button key={t.id} onClick={() => setTentId(t.id)}
            className={cn("text-xs px-2.5 py-1 rounded-full border transition", tentId === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border/50 hover:bg-secondary")}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {METRICS.map((m) => (
          <div key={m.key} className="glass rounded-2xl p-4">
            <h3 className="font-display font-semibold mb-2">{m.label}</h3>
            <SensorChart data={filtered} metric={m.key} height={200} />
          </div>
        ))}
      </div>
    </div>
  );
}
