/**
 * EnvironmentCheckSnapshotLinkButton — presenter-only. Renders a
 * deterministic link to the matched SensorSnapshot when one exists.
 * Falls back to a calm "Sensor snapshot not linked" label otherwise.
 *
 * Never writes. Never guesses. Source `ecowitt` is rejected as canonical.
 */
import { ExternalLink } from "lucide-react";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import {
  linkEnvironmentCheckToSnapshot,
  SNAPSHOT_NOT_LINKED_LABEL,
  type EnvironmentCheckEntry,
  type SensorSnapshotCandidate,
} from "@/lib/environmentCheckSensorSnapshotLinkRules";

const CANONICAL_SOURCES = new Set(["live", "manual", "csv", "demo", "stale", "invalid"]);

export interface EnvironmentCheckSnapshotLinkButtonProps {
  entry: EnvironmentCheckEntry;
  snapshots?: SensorSnapshotCandidate[];
  className?: string;
}

export default function EnvironmentCheckSnapshotLinkButton({
  entry,
  snapshots = [],
  className,
}: EnvironmentCheckSnapshotLinkButtonProps) {
  const result = linkEnvironmentCheckToSnapshot({ entry, snapshots });

  // Source/provider/VPD/soil summary line. Reject non-canonical source values.
  const safeSource =
    entry.source && CANONICAL_SOURCES.has(entry.source) ? entry.source : "unknown";

  return (
    <div
      data-testid="env-check-snapshot-link"
      data-match-kind={result.matchKind}
      data-snapshot-id={result.snapshotId ?? ""}
      data-source={safeSource}
      data-provider={entry.provider ?? ""}
      data-stale-or-invalid={result.staleOrInvalid ? "true" : "false"}
      className={["mt-2 flex flex-wrap items-center gap-2 text-[11px]", className]
        .filter(Boolean)
        .join(" ")}
    >
      {entry.capturedAt && (
        <span className="text-muted-foreground">
          captured_at: <span className="font-mono">{entry.capturedAt}</span>
        </span>
      )}
      <span
        data-testid="env-check-source-badge"
        className="px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground"
      >
        source: {safeSource}
      </span>
      {entry.provider && (
        <span className="px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
          provider: {entry.provider}
        </span>
      )}
      <span data-testid="env-check-vpd">
        VPD: {result.vpdKpa === null ? "Not available" : formatVpdKpa(result.vpdKpa)}
      </span>
      {result.soilMoisturePct !== null && (
        <span>soil: {result.soilMoisturePct}%</span>
      )}
      {result.matchKind !== "none" && result.href ? (
        <a
          href={result.href}
          data-testid="env-check-snapshot-cta"
          className="inline-flex items-center gap-1 underline text-foreground/90 hover:text-foreground"
        >
          View sensor snapshot <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span
          data-testid="env-check-snapshot-not-linked"
          className="text-muted-foreground"
        >
          {SNAPSHOT_NOT_LINKED_LABEL}
        </span>
      )}
    </div>
  );
}
