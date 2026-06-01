/**
 * PlantDetailDataSourceDisclosure — Plant-Detail-specific data-source
 * banner. Presentation-only: classification stays in the pure
 * `buildPlantDetailDataSourceView` view-model. No queries, no writes, no
 * routing changes. Honestly labels the visible data as one of:
 *
 *   Live | Manual | Demo | Stale | Unavailable
 *
 * Demo / simulated / mixed data is never labeled Live.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import InfoPopover from "@/components/InfoPopover";
import {
  combineGrowDataMeta,
  type GrowDataSourceMeta,
} from "@/hooks/useGrowData";
import type { SnapshotSource } from "@/lib/sensorSnapshot";
import {
  buildPlantDetailDataSourceView,
  type PlantDetailDataSourceLabel,
} from "@/lib/plantDetailDataSourceView";

interface Props {
  /** Metadata snapshots for the relevant grow data queries. */
  metas: readonly GrowDataSourceMeta[];
  /** Optional sensor snapshot source for the assigned tent, if known. */
  snapshotSource?: SnapshotSource | null;
  /** Optional caller-computed stale flag for the latest reading. */
  isStale?: boolean;
  className?: string;
  testId?: string;
}

export default function PlantDetailDataSourceDisclosure({
  metas,
  snapshotSource = null,
  isStale = false,
  className,
  testId = "plant-detail-data-source-disclosure",
}: Props) {
  const combined = combineGrowDataMeta(metas);
  const view = buildPlantDetailDataSourceView({
    recordSource: combined.dataSource,
    snapshotSource,
    isStale,
  });
  const label: PlantDetailDataSourceLabel = view.label;

  return (
    <div
      data-testid={testId}
      data-source={combined.dataSource}
      data-snapshot-source={snapshotSource ?? ""}
      data-label={label}
      className={cn("mb-4 flex items-center gap-2 flex-wrap", className)}
      aria-label="Plant data source status"
    >
      <Badge
        variant={view.variant}
        data-testid={`${testId}-badge`}
        data-label={label}
        className="text-[10px] uppercase tracking-wide"
      >
        {view.badgeText}
      </Badge>
      <span
        className="text-xs text-muted-foreground"
        data-testid={`${testId}-description`}
      >
        {view.description}
      </span>
      <InfoPopover
        title={view.helpTitle}
        body={view.helpBody}
        testKey={`${testId}-source`}
      />
    </div>
  );
}
