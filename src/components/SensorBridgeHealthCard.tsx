import { AlertTriangle, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSensorBridgeHealth } from "@/hooks/useSensorBridgeHealth";
import {
  reconcileSensorBridgeHealthWithReadings,
  type SensorBridgeHealthState,
  type SensorBridgeHealthViewModel,
  type SensorBridgeReadingEvidenceRowLike,
  type SensorBridgeReadingEvidenceStatus,
} from "@/lib/sensorBridgeHealthViewModel";
import {
  classifySensorFeedLiveness,
  describeSensorFeedLiveness,
} from "@/lib/sensorFeedLivenessRules";

/**
 * Read-only presenter for sensor bridge intake health. Source-honest:
 *  - Never renders payload bodies, bridge credentials, or privileged values.
 *  - Never implies device control or automation.
 *  - Never classifies unknown telemetry as healthy.
 */

const STATE_LABEL: Record<SensorBridgeHealthState, string> = {
  no_data: "no data",
  usable: "usable",
  stale: "stale",
  needs_review: "needs review",
  invalid: "invalid",
};

function badgeVariant(
  s: SensorBridgeHealthState,
): "default" | "secondary" | "outline" | "destructive" {
  if (s === "usable") return "default";
  if (s === "stale") return "secondary";
  if (s === "needs_review" || s === "invalid") return "destructive";
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
  /** Provenance-bearing rows already loaded for the selected tent. */
  sensorReadings?: ReadonlyArray<SensorBridgeReadingEvidenceRowLike>;
  sensorReadingsStatus?: SensorBridgeReadingEvidenceStatus;
  /** Injectable evidence clock/window for deterministic tests. */
  evidenceNow?: Date;
  evidenceLiveWindowMs?: number;
  /** Injectable clock for the liveness banner. Falls back to `evidenceNow`. */
  livenessNow?: Date;
  className?: string;
}

export default function SensorBridgeHealthCard({
  viewModel,
  sensorReadings,
  sensorReadingsStatus,
  evidenceNow,
  evidenceLiveWindowMs,
  livenessNow,
  className,
}: SensorBridgeHealthCardProps) {
  const query = useSensorBridgeHealth();
  const isLoading = !viewModel && query.isLoading;
  const auditVm = viewModel ?? query.data ?? null;
  const vm = auditVm
    ? reconcileSensorBridgeHealthWithReadings(auditVm, {
        rows: sensorReadings,
        status: sensorReadingsStatus,
        now: evidenceNow,
        liveWindowMs: evidenceLiveWindowMs,
      })
    : null;

  // Liveness is a separate question from the card's freshness state: `stale`
  // covers both a 31-minute gap and a two-week dead feed. We only interrupt
  // for the latter.
  //
  // `no_data` is the shape an account with no bridge takes, so it maps to
  // "no bridge configured" and never produces a banner — otherwise every
  // manual-only grower sees an outage warning on day one.
  const liveness = vm
    ? classifySensorFeedLiveness({
        latestAcceptedAtIso: vm.latestAcceptedAtIso,
        hasConfiguredBridge: vm.state !== "no_data",
        now: livenessNow ?? evidenceNow ?? new Date(),
      })
    : null;
  const livenessMessage = liveness ? describeSensorFeedLiveness(liveness) : null;

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
        {vm?.controlDisclosure ?? "No device control."} Readings are observed only — bridge intake
        never executes equipment changes.
      </p>

      {livenessMessage && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3"
          data-testid="sensor-feed-liveness-banner"
          data-liveness={liveness?.liveness}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm text-foreground">{livenessMessage}</p>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !vm ? (
        <div className="text-sm text-muted-foreground">Bridge status unavailable.</div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="text-foreground" data-testid="sensor-bridge-health-message">
            {vm.message}
          </div>

          {vm.bridgeName && (
            <div className="text-xs text-muted-foreground">
              Bridge:{" "}
              <span className="font-medium text-foreground" data-testid="sensor-bridge-health-name">
                {vm.bridgeName}
              </span>
            </div>
          )}

          {vm.sourceLabel && (
            <div className="text-xs text-muted-foreground">
              Source:{" "}
              <span className="font-mono text-foreground" data-testid="sensor-bridge-health-source">
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
              Reason: <code className="font-mono text-foreground">{vm.latestReasonCode}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
