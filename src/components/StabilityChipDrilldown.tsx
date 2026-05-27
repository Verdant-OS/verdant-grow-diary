/**
 * StabilityChipDrilldown — read-only modal showing each tent's last-24h
 * VPD stability details + the exact copy variant the chip is rendering.
 *
 * No I/O, no writes, no Action Queue, no automation, no device control.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { StabilityResult } from "@/lib/environmentStabilityRules";
import {
  formatStabilityChipView,
  type StabilityChipView,
} from "@/lib/dashboardStabilityChipCopyRules";

export type StabilityCopyVariant =
  | "unavailable"
  | "stage_unknown"
  | "context_only"
  | "outside_24h";

export function resolveCopyVariant(
  result: StabilityResult,
): StabilityCopyVariant {
  switch (result.status) {
    case "unavailable":
      return "unavailable";
    case "stage_unknown":
      return "stage_unknown";
    case "context_only":
      return "context_only";
    case "stable":
    case "watch":
    case "unstable":
    default:
      return "outside_24h";
  }
}

const VARIANT_LABEL: Record<StabilityCopyVariant, string> = {
  unavailable: "Unavailable",
  stage_unknown: "Stage unknown",
  context_only: "Context only",
  outside_24h: "Outside 24h",
};

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  return `${Math.round(h * 10) / 10}h`;
}

export interface StabilityChipDrilldownProps {
  tentId: string;
  tentName: string;
  stability: StabilityResult;
  /** Pre-computed chip view for visual parity with the trigger. */
  view?: StabilityChipView;
}

export default function StabilityChipDrilldown({
  tentId,
  tentName,
  stability,
  view,
}: StabilityChipDrilldownProps) {
  const chipView = view ?? formatStabilityChipView(stability);
  const variant = resolveCopyVariant(stability);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          // The chip sits inside a <Link> wrapper; stop propagation so
          // opening the drilldown does not also navigate to the tent.
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          data-testid={`dashboard-stability-chip-${tentId}`}
          aria-label={`${tentName} stability details`}
          className={`mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] cursor-pointer hover:opacity-80 transition ${chipView.toneClass}`}
        >
          {chipView.copy}
        </button>
      </DialogTrigger>
      <DialogContent
        data-testid={`dashboard-stability-drilldown-${tentId}`}
        className="max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{tentName} — VPD stability</DialogTitle>
          <DialogDescription>
            Read-only summary of the last 24h VPD window for this tent. No
            alerts or device actions are triggered from this view.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Copy variant</span>
            <span
              data-testid={`dashboard-stability-drilldown-${tentId}-variant`}
              className="font-medium"
            >
              {VARIANT_LABEL[variant]}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Chip copy</span>
            <span
              data-testid={`dashboard-stability-drilldown-${tentId}-copy`}
              className="font-medium"
            >
              {chipView.copy}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-mono text-xs">{stability.status}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Stage</span>
            <span className="font-mono text-xs">{stability.stage}</span>
          </div>

          <div className="rounded-lg border border-border/40 p-3 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last 24h
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hours outside band</span>
              <span className="font-medium">
                {formatHours(stability.last24h.hoursOutside)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hours considered</span>
              <span className="font-medium">
                {formatHours(stability.last24h.hoursConsidered)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Readings considered</span>
              <span className="font-medium">
                {stability.last24h.totalConsidered}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Outside count</span>
              <span className="font-medium">
                {stability.last24h.outsideCount}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Sparse window</span>
              <span className="font-medium">
                {stability.sparse ? "yes" : "no"}
              </span>
            </div>
          </div>

          {stability.message && (
            <p
              data-testid={`dashboard-stability-drilldown-${tentId}-message`}
              className="text-xs text-muted-foreground"
            >
              {stability.message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
