import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string | number;
  unit?: string;
  status?: "ok" | "warn" | "bad";
  className?: string;
}

const map = {
  ok: "border-[hsl(var(--success))]/40 text-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
  warn: "border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
  bad: "border-destructive/40 text-destructive bg-destructive/10",
} as const;

export default function MetricChip({ label, value, unit, status = "ok", className }: Props) {
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs", map[status], className)}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      <span className="font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 opacity-70">{unit}</span>}
      </span>
    </div>
  );
}
