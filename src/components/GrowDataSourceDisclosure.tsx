/**
 * GrowDataSourceDisclosure — generic presenter banner for grower-facing pages
 * (Plants, Tents, etc.) that honestly discloses whether the visible records
 * are Live (Supabase), Demo (mock), Mixed, or Unavailable.
 *
 * Pure presenter. Classification stays in `combineGrowDataMeta` from
 * useGrowData. No queries, no writes.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  combineGrowDataMeta,
  type GrowDataSourceMeta,
} from "@/hooks/useGrowData";
import type { SnapshotSource } from "@/lib/sensorSnapshot";

type Label = "Live" | "Demo" | "Mixed" | "Unavailable";

const LABEL_BY_SOURCE: Record<GrowDataSourceMeta["dataSource"], Label> = {
  supabase: "Live",
  mock: "Demo",
  mixed: "Mixed",
  unavailable: "Unavailable",
};

const VARIANT_BY_LABEL: Record<Label, "default" | "secondary" | "outline" | "destructive"> = {
  Live: "default",
  Demo: "outline",
  Mixed: "secondary",
  Unavailable: "destructive",
};

interface Props {
  /** Resource label, e.g. "plants", "tents". Used in descriptions only. */
  resource: string;
  /** Whether at least one record is visible to the user. */
  hasAnyData: boolean;
  /** Metadata snapshots for the relevant grow data queries. */
  metas: readonly GrowDataSourceMeta[];
  /** Optional welcome action (e.g. create button) for the empty state. */
  welcomeAction?: React.ReactNode;
  /** Optional sensor snapshot source — when "sim", appends a simulated-data
   * notice so the UI never presents simulated readings as live. */
  snapshotSource?: SnapshotSource;
  className?: string;
  testId?: string;
}

export default function GrowDataSourceDisclosure({
  resource,
  hasAnyData,
  metas,
  welcomeAction,
  snapshotSource,
  className,
  testId = "grow-data-source-disclosure",
}: Props) {
  const combined = combineGrowDataMeta(metas);
  const label: Label = LABEL_BY_SOURCE[combined.dataSource];
  const isSimulated = snapshotSource === "sim";
  const simulatedNotice = `Simulated ${resource} sensor data shown — for testing/demo only. Not real tent data and not used for persisted alerts.`;

  const description: Record<Label, string> = {
    Live: `Live ${resource} data from your grow backend.`,
    Demo: `Showing demo ${resource}. Connect real ${resource} to replace it.`,
    Mixed: `Some ${resource} are real, some are demo or manual. Add or connect more to replace the demo data.`,
    Unavailable: `No ${resource} data available yet.`,
  };

  // Welcome / empty state — no usable data anywhere.
  if (!hasAnyData && combined.dataSource === "unavailable") {
    return (
      <section
        data-testid={testId}
        data-source={combined.dataSource}
        className={cn("glass rounded-2xl p-4 mb-4", className)}
        aria-label={`Grow ${resource} data source`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge
            variant="destructive"
            data-testid={`${testId}-badge`}
            data-label="Unavailable"
            className="text-[10px] uppercase tracking-wide"
          >
            Unavailable
          </Badge>
        </div>
        <h2 className="font-display font-semibold">No real {resource} yet</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add your first {resource.replace(/s$/, "")} to start tracking real data.
        </p>
        {welcomeAction && <div className="mt-3">{welcomeAction}</div>}
      </section>
    );
  }

  return (
    <div
      data-testid={testId}
      data-source={combined.dataSource}
      data-snapshot-source={snapshotSource ?? ""}
      className={cn("mb-4 flex items-center gap-2 flex-wrap", className)}
      aria-label={`Grow ${resource} data source`}
    >
      <Badge
        variant={VARIANT_BY_LABEL[label]}
        data-testid={`${testId}-badge`}
        data-label={label}
        className="text-[10px] uppercase tracking-wide"
      >
        {label} data
      </Badge>
      <span className="text-xs text-muted-foreground">{description[label]}</span>
      {isSimulated && (
        <>
          <Badge
            variant="outline"
            data-testid={`${testId}-simulated-badge`}
            data-label="Simulated"
            className="text-[10px] uppercase tracking-wide"
          >
            Simulated
          </Badge>
          <span
            className="text-xs text-muted-foreground basis-full"
            data-testid={`${testId}-simulated-notice`}
          >
            {simulatedNotice}
          </span>
        </>
      )}
    </div>
  );
}
