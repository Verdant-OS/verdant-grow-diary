/**
 * SensorProvenanceLegend — presenter-only in-app legend for the six
 * canonical Post-Grow sensor provenance labels.
 *
 * All copy (labels, descriptions, review note, canonical order) comes
 * from `src/lib/postGrowReportRules.ts`. No I/O, no writes, no AI, no
 * device control. Safe to render alongside empty sensor state.
 */
import { forwardRef } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  POST_GROW_SENSOR_PROVENANCE_LEGEND,
  POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE,
  POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE,
  provenanceBadgeAriaLabel,
} from "@/lib/postGrowReportRules";

export interface SensorProvenanceLegendProps {
  readonly id?: string;
  readonly headingId?: string;
  readonly className?: string;
  /** Optional testid override. */
  readonly testId?: string;
}

const SensorProvenanceLegend = forwardRef<
  HTMLElement,
  SensorProvenanceLegendProps
>(function SensorProvenanceLegend(
  {
    id,
    headingId,
    className,
    testId = "post-grow-sensor-provenance-legend",
  },
  ref,
) {
  const resolvedHeadingId = headingId ?? `${id ?? testId}-heading`;
  return (
    <section
      ref={ref}
      id={id}
      tabIndex={-1}
      data-testid={testId}
      aria-labelledby={resolvedHeadingId}
      className={cn(
        "glass rounded-2xl p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <h3
        id={resolvedHeadingId}
        className="font-display font-semibold text-sm"
      >
        {POST_GROW_SENSOR_PROVENANCE_LEGEND_TITLE}
      </h3>
      <ul
        className="mt-3 space-y-3 list-none p-0"
        data-testid={`${testId}-rows`}
      >
        {POST_GROW_SENSOR_PROVENANCE_LEGEND.map((row) => {
          const ariaLabel = provenanceBadgeAriaLabel(row);
          return (
            <li
              key={row.kind}
              className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-start sm:gap-2"
              data-testid={`${testId}-row-${row.kind}`}
            >
              <Badge
                variant={row.healthy ? "outline" : "secondary"}
                className="self-start text-[10px] shrink-0 max-w-full break-words focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title={row.description}
                aria-label={ariaLabel}
                tabIndex={0}
                data-testid={`${testId}-badge-${row.kind}`}
              >
                {row.label}
              </Badge>
              <span className="min-w-0 flex-1 break-words">
                {row.description}
              </span>
            </li>
          );
        })}
      </ul>
      <p
        className="mt-3 text-[11px] text-muted-foreground"
        data-testid={`${testId}-review-note`}
      >
        {POST_GROW_SENSOR_PROVENANCE_REVIEW_NOTE}
      </p>
    </section>
  );
});

export default SensorProvenanceLegend;
