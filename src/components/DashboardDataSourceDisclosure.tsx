/**
 * DashboardDataSourceDisclosure — presenter-only banner shown near the top of
 * the Dashboard to honestly disclose whether the visible cards/KPIs/charts
 * are backed by Live (Supabase), Demo (mock), Mixed, or Unavailable data.
 *
 * Pure presenter. Classification stays in `combineGrowDataMeta` /
 * `getGrowDataMeta` from `useGrowData`. No queries, no writes.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  combineGrowDataMeta,
  getGrowDataMeta,
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

const DESCRIPTION: Record<Label, string> = {
  Live: "Live data from your grow backend.",
  Demo: "Showing demo data. Connect real tents, plants, and sensors to replace it.",
  Mixed: "Showing a mix of live and demo data. Some sections are not yet backed by real data.",
  Unavailable: "No grow data available yet.",
};

interface Props {
  scopedGrowId?: string;
  /** True when at least one tent or plant is visible to the user. */
  hasAnyData: boolean;
  /** Test/override hook. When omitted, metadata is read from getGrowDataMeta. */
  metas?: readonly GrowDataSourceMeta[];
  /** Optional sensor snapshot source — when "sim", a simulated-data notice
   * is appended so the UI never presents simulated readings as live. */
  snapshotSource?: SnapshotSource;
  className?: string;
}

export default function DashboardDataSourceDisclosure({
  scopedGrowId,
  hasAnyData,
  metas,
  snapshotSource,
  className,
}: Props) {
  const resolved =
    metas && metas.length > 0
      ? metas
      : [
          getGrowDataMeta(["grow", "tents", scopedGrowId ?? "all"]),
          getGrowDataMeta(["grow", "plants", "all", scopedGrowId ?? "all"]),
        ];
  const combined = combineGrowDataMeta(resolved);
  const label: Label = LABEL_BY_SOURCE[combined.dataSource];
  const isSimulated = snapshotSource === "sim";
  const simulatedNotice =
    "Simulated sensor data shown — for testing/demo only. Not real tent data and not used for persisted alerts.";

  // Welcome / empty state — no usable data anywhere.
  if (!hasAnyData && combined.dataSource === "unavailable") {
    return (
      <section
        data-testid="dashboard-data-source-disclosure"
        data-source={combined.dataSource}
        className={cn("glass rounded-2xl p-4 mb-4", className)}
        aria-label="Grow data source"
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge
            variant="destructive"
            data-testid="dashboard-data-source-badge"
            data-label="Unavailable"
            className="text-[10px] uppercase tracking-wide"
          >
            Unavailable
          </Badge>
        </div>
        <h2 className="font-display font-semibold">Welcome to Verdant Grow OS</h2>
        <p className="text-sm text-muted-foreground mt-1">
          No real grow, tent, plant, or sensor data yet. Create your first grow to get started.
        </p>
      </section>
    );
  }

  return (
    <div
      data-testid="dashboard-data-source-disclosure"
      data-source={combined.dataSource}
      data-snapshot-source={snapshotSource ?? ""}
      className={cn("mb-4 flex items-center gap-2 flex-wrap", className)}
      aria-label="Grow data source"
    >
      <Badge
        variant={VARIANT_BY_LABEL[label]}
        data-testid="dashboard-data-source-badge"
        data-label={label}
        className="text-[10px] uppercase tracking-wide"
      >
        {label} data
      </Badge>
      <span className="text-xs text-muted-foreground">{DESCRIPTION[label]}</span>
      {isSimulated && (
        <>
          <Badge
            variant="outline"
            data-testid="dashboard-data-source-simulated-badge"
            data-label="Simulated"
            className="text-[10px] uppercase tracking-wide"
          >
            Simulated
          </Badge>
          <span
            className="text-xs text-muted-foreground basis-full"
            data-testid="dashboard-data-source-simulated-notice"
          >
            {simulatedNotice}
          </span>
        </>
      )}
    </div>
  );
}
