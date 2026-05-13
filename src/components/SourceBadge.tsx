import { Badge } from "@/components/ui/badge";
import { DataSource, Confidence } from "@/store/verdant";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";

export function SourceBadge({ source }: { source: DataSource }) {
  const map: Record<DataSource, string> = {
    demo: "bg-info/20 text-info border-info/40",
    manual: "bg-muted text-muted-foreground border-border",
    live: "bg-success/20 text-success border-success/40",
    stale: "bg-warning/20 text-warning border-warning/40",
  };
  return <Badge variant="outline" className={cn("label-chip", map[source])}>{source}</Badge>;
}

export function ConfidenceBadge({ c }: { c: Confidence }) {
  const ic = { good: CheckCircle2, suspicious: AlertTriangle, stale: Clock, missing: HelpCircle }[c];
  const Icon = ic;
  const cls = {
    good: "text-success", suspicious: "text-warning",
    stale: "text-warning", missing: "text-muted-foreground",
  }[c];
  return <span className={cn("inline-flex items-center gap-1 text-xs", cls)}><Icon className="h-3 w-3" />{c}</span>;
}
