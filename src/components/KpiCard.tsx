import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  trend?: { dir: "up" | "down" | "flat"; value: string };
  accent?: "primary" | "warning" | "destructive" | "info" | "success";
  className?: string;
}

const accentMap = {
  primary: "text-primary",
  warning: "text-[hsl(var(--warning))]",
  destructive: "text-destructive",
  info: "text-[hsl(var(--info))]",
  success: "text-[hsl(var(--success))]",
} as const;

export default function KpiCard({ label, value, hint, icon, trend, accent = "primary", className }: Props) {
  return (
    <div className={cn("glass rounded-2xl p-4 flex flex-col gap-2 animate-fade-in", className)}>
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        {icon && <span className={cn("h-7 w-7 rounded-lg bg-secondary/40 flex items-center justify-center", accentMap[accent])}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl md:text-3xl font-display font-semibold">{value}</span>
        {trend && (
          <span
            className={cn(
              "text-[11px] font-medium",
              trend.dir === "up" && "text-[hsl(var(--success))]",
              trend.dir === "down" && "text-destructive",
              trend.dir === "flat" && "text-muted-foreground",
            )}
          >
            {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "—"} {trend.value}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
