import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  classifyGrowDataSource,
  type GrowDataSourceInput,
  type GrowDataSourceLabelOptions,
  type GrowDataSourceLabelResult,
} from "@/lib/growDataSourceLabelRules";

interface Props {
  /** Pre-classified result. If omitted, pass `input` to classify here. */
  classification?: GrowDataSourceLabelResult;
  input?: GrowDataSourceInput | null;
  options?: GrowDataSourceLabelOptions;
  className?: string;
  /** When false, hides the badge for "Live" readings. Default true. */
  alwaysShow?: boolean;
}

const VARIANT_BY_LABEL: Record<
  GrowDataSourceLabelResult["label"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  Live: "default",
  Manual: "secondary",
  Simulated: "outline",
  Demo: "outline",
  Stale: "destructive",
  Unavailable: "destructive",
};

export default function GrowDataSourceBadge({
  classification,
  input,
  options,
  className,
  alwaysShow = true,
}: Props) {
  const c =
    classification ?? classifyGrowDataSource(input ?? null, options ?? {});
  if (!alwaysShow && !c.shouldDisplayBadge) return null;
  return (
    <Badge
      variant={VARIANT_BY_LABEL[c.label]}
      className={cn("text-[10px] uppercase tracking-wide", className)}
      data-testid="grow-data-source-badge"
      data-label={c.label}
      data-severity={c.severity}
      title={c.message}
    >
      {c.label}
    </Badge>
  );
}
