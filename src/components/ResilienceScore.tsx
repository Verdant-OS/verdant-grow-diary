import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export interface ResilienceData {
  drought_tolerance: number; // 0-100
  pest_resistance: number; // 0-100
  mold_resistance: number; // 0-100
  heat_tolerance: number; // 0-100
  overall_score: number; // 0-100
}

export default function ResilienceScore({ data }: { data: ResilienceData }) {
  const getTone = (score: number) => {
    if (score >= 80) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (score >= 50) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-red-500 bg-red-500/10 border-red-500/20";
  };

  const getIcon = (score: number) => {
    if (score >= 80) return <ShieldCheck className="h-4 w-4" />;
    if (score >= 50) return <Shield className="h-4 w-4" />;
    return <ShieldAlert className="h-4 w-4" />;
  };

  const metrics = [
    { label: "Drought Tolerance", value: data.drought_tolerance },
    { label: "Pest Resistance", value: data.pest_resistance },
    { label: "Mold Resistance", value: data.mold_resistance },
    { label: "Heat/VPD Tolerance", value: data.heat_tolerance },
  ];

  return (
    <div className="glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-border/50 pb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Stress Resilience
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Breeder evaluation of environmental hardiness.</p>
        </div>
        <div className={`flex items-center justify-center h-12 w-12 rounded-full border-4 ${data.overall_score >= 80 ? 'border-emerald-500 text-emerald-500' : data.overall_score >= 50 ? 'border-amber-500 text-amber-500' : 'border-red-500 text-red-500'}`}>
          <span className="font-bold text-lg">{data.overall_score}</span>
        </div>
      </div>

      <div className="grid gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{m.label}</span>
              <Badge variant="outline" className={`px-1.5 py-0 border ${getTone(m.value)}`}>
                {getIcon(m.value)} <span className="ml-1">{m.value}/100</span>
              </Badge>
            </div>
            <Progress value={m.value} className="h-1.5" />
          </div>
        ))}
      </div>
    </div>
  );
}
