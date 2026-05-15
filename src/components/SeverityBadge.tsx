import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface Props {
  severity: "critical" | "warning" | "info";
  className?: string;
}

const map = {
  critical: { cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertCircle, label: "Critical" },
  warning: { cls: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30", Icon: AlertTriangle, label: "Warning" },
  info: { cls: "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30", Icon: Info, label: "Info" },
} as const;

export default function SeverityBadge({ severity, className }: Props) {
  const { cls, Icon, label } = map[severity];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", cls, className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
