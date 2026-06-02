import { Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSensorBridgeHealth } from "@/hooks/useSensorBridgeHealth";
import type {
  SensorBridgeHealthState,
  SensorBridgeHealthViewModel,
} from "@/lib/sensorBridgeHealthViewModel";

/**
 * Read-only presenter for sensor bridge intake health. Source-honest:
 *  - Never renders payload bodies, bridge credentials, or privileged values.
 *  - Never implies device control or automation.
 *  - Never classifies unknown telemetry as healthy.
 */

const STATE_LABEL: Record<SensorBridgeHealthState, string> = {
  no_data: "no data",
  accepted: "accepted",
  stale: "stale",
  needs_review: "needs review",
};

function badgeVariant(
  s: SensorBridgeHealthState,
): "default" | "secondary" | "outline" | "destructive" {
  if (s === "accepted") return "default";
  if (s === "stale") return "secondary";
  if (s === "needs_review") return "destructive";
  return "outline";
}

function formatIso(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString();
}

export interface SensorBridgeHealthCardProps {
  /** Optional injected view model (tests). When omitted, hook is used. */
  viewModel?: SensorBridgeHealthViewModel;
  className?: string;
}

export default function SensorBridgeHealthCard({
  viewModel,
  className,
}: SensorBridgeHealthCardProps) {
  const query = useSensorBridgeHealth();
  const isLoading = !viewModel && query.isLoading;
  const vm = viewModel ?? query.data ?? null;

  return (
    <div
      className={`glass rounded-2xl p-4 mt-4 ${className ?? ""}`.trim()}
      data-testid="sensor-bridge-health-card"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-display font-semibold">Sensor bridge status</h2>
        </div>
        {vm && (
          <Badge
            variant={badgeVariant(vm.state)}
            data-testid="sensor-bridge-health-state"
            data-state={vm.state}
          >
            {STATE_LABEL[vm.state]}
          </Badge>
        )}
      </div>
      <p
        className="text-xs text-muted-foreground mb-3"
        data-testid="sensor-bridge-health-disclosure"
      >
        {vm?.controlDisclosure ?? "No device control."} Readings are observed
        only — bridge intake never executes equipment changes.
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !vm ? (
        <div className="text-sm text-muted-foreground">
          Bridge status unavailable.
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div
            className="text-foreground"
            data-testid="sensor-bridge-health-message"
          >
            {vm.message}
          </div>

          {vm.bridgeName && (
            <div className="text-xs text-muted-foreground">
              Bridge:{" "}
              <span
                className="font-medium text-foreground"
                data-testid="sensor-bridge-health-name"
              >
                {vm.bridgeName}
              </span>
            </div>
          )}

          {vm.sourceLabel && (
            <div className="text-xs text-muted-foreground">
              Source:{" "}
              <span
                className="font-mono text-foreground"
                data-testid="sensor-bridge-health-source"
              >
                {vm.sourceLabel}
              </span>
            </div>
          )}

          {vm.latestAcceptedAtIso && (
            <div
              className="text-xs text-muted-foreground"
              data-testid="sensor-bridge-health-accepted-at"
            >
              Latest accepted: {formatIso(vm.latestAcceptedAtIso)}
            </div>
          )}

          {vm.latestRejectedAtIso && (
            <div
              className="text-xs text-muted-foreground"
              data-testid="sensor-bridge-health-rejected-at"
            >
              Latest rejected: {formatIso(vm.latestRejectedAtIso)}
            </div>
          )}

          {vm.latestReasonCode && (
            <div
              className="text-xs text-muted-foreground"
              data-testid="sensor-bridge-health-reason"
            >
              Reason:{" "}
              <code className="font-mono text-foreground">
                {vm.latestReasonCode}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
