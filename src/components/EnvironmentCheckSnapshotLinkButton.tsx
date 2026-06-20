/**
 * EnvironmentCheckSnapshotLinkButton — presenter-only. On a deterministic
 * SensorSnapshot match, opens a slide-over details drawer instead of
 * navigating away. Ambiguous/missing matches render the calm
 * "Sensor snapshot not linked" label.
 *
 * Never writes. Never guesses. Source `ecowitt` is rejected as canonical
 * and displays via CanonicalSourceBadge as "Unknown source".
 */
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { formatVpdKpa } from "@/lib/vpdCalculationRules";
import CanonicalSourceBadge from "@/components/CanonicalSourceBadge";
import SensorSnapshotDetailsDrawer, {
  type SensorSnapshotDetailsDrawerData,
} from "@/components/SensorSnapshotDetailsDrawer";
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
  const [open, setOpen] = useState(false);

  // Source/provider/VPD/soil summary line. Reject non-canonical source values.
  const safeSource =
    entry.source && CANONICAL_SOURCES.has(entry.source) ? entry.source : "unknown";

  const matchedSnapshot =
    result.matchKind !== "none" && result.snapshotId
      ? snapshots.find((s) => s.id === result.snapshotId) ?? null
      : null;

  const drawerData: SensorSnapshotDetailsDrawerData | null = matchedSnapshot
    ? {
        snapshotId: matchedSnapshot.id,
        capturedAt: matchedSnapshot.capturedAt ?? null,
        source: matchedSnapshot.source ?? null,
        provider: matchedSnapshot.provider ?? null,
        transport: matchedSnapshot.transport ?? null,
        tentId: matchedSnapshot.tentId ?? entry.tentId ?? null,
        plantId: matchedSnapshot.plantId ?? entry.plantId ?? null,
        vpdKpa: result.vpdKpa,
        soilMoisturePct: result.soilMoisturePct,
        humidityPct:
          typeof (matchedSnapshot as { humidityPct?: number | null }).humidityPct === "number"
            ? ((matchedSnapshot as { humidityPct?: number | null }).humidityPct as number)
            : null,
        airTemperatureC:
          typeof (matchedSnapshot as { airTemperatureC?: number | null }).airTemperatureC === "number"
            ? ((matchedSnapshot as { airTemperatureC?: number | null }).airTemperatureC as number)
            : null,
        confidence:
          typeof (matchedSnapshot as { confidence?: number | null }).confidence === "number"
            ? ((matchedSnapshot as { confidence?: number | null }).confidence as number)
            : null,
        staleOrInvalid: result.staleOrInvalid,
      }
    : null;

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
      <CanonicalSourceBadge
        testId="env-check-source-badge"
        source={entry.source}
        provider={entry.provider}
      />
      <span data-testid="env-check-vpd">
        VPD: {result.vpdKpa === null ? "Not available" : formatVpdKpa(result.vpdKpa)}
      </span>
      {result.soilMoisturePct !== null && (
        <span>soil: {result.soilMoisturePct}%</span>
      )}
      {result.matchKind !== "none" && drawerData ? (
        <>
          <a
            href={result.href ?? "#"}
            data-testid="env-check-snapshot-cta"
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="inline-flex items-center gap-1 underline text-foreground/90 hover:text-foreground"
          >
            View sensor snapshot <ExternalLink className="h-3 w-3" />
          </a>
          <SensorSnapshotDetailsDrawer
            open={open}
            onOpenChange={setOpen}
            data={drawerData}
            detailsHref={result.href}
          />
        </>
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
