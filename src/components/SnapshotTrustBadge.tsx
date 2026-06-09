/**
 * SnapshotTrustBadge — small presenter for the Live/Stale/Invalid/Manual/
 * Demo/CSV trust badge derived from sensorSnapshotTrustBadgeRules.
 *
 * Trust is rendered separately from provider identity. Provider chip
 * (e.g. "Ecowitt") is rendered next to the trust badge but never
 * substituted for trust. No I/O, no Supabase, no writes.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  classifySnapshotTrustBadge,
  type SnapshotTrustInput,
  type SnapshotTrustBadgeView,
} from "@/lib/sensorSnapshotTrustBadgeRules";

interface Props {
  view?: SnapshotTrustBadgeView;
  input?: SnapshotTrustInput;
  className?: string;
  showProvider?: boolean;
}

const VARIANT: Record<
  SnapshotTrustBadgeView["severity"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  ok: "default",
  info: "secondary",
  warn: "outline",
  error: "destructive",
};

export default function SnapshotTrustBadge({
  view,
  input,
  className,
  showProvider = true,
}: Props) {
  const v = view ?? classifySnapshotTrustBadge(input ?? {});
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-testid="snapshot-trust-badge"
      data-badge={v.badge}
      data-attachable={String(v.attachable)}
    >
      <Badge
        variant={VARIANT[v.severity]}
        className="text-[10px] uppercase tracking-wide"
        title={v.helper}
        data-testid="snapshot-trust-badge-label"
      >
        {v.label}
      </Badge>
      {showProvider && v.providerLabel && (
        <span
          className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-muted/60 text-muted-foreground"
          data-testid="snapshot-trust-badge-provider"
        >
          {v.providerLabel}
        </span>
      )}
    </span>
  );
}
