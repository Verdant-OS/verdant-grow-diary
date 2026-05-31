/**
 * ReportsReviewQueueSection — compact "What to review next" section for the
 * Grow Learning Hub. Renders the prioritized list of follow-up items built
 * by `buildReportsReviewQueue`, plus a calm empty-state line when there are
 * no priority items.
 *
 * SAFETY:
 *  - Presentational only. No I/O, no writes, no automation.
 *  - All ranking/priority/help/why-this-is-here logic lives in
 *    `src/lib/reportsHubReviewQueue.ts`.
 *  - Copy is observational. Never claims an action fixed or healed anything.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, HelpCircle } from "lucide-react";
import {
  REPORTS_REVIEW_QUEUE_EMPTY_COPY,
  REPORTS_REVIEW_QUEUE_SUBTITLE,
  REPORTS_REVIEW_QUEUE_TITLE,
  type ReportsReviewItem,
} from "@/lib/reportsHubReviewQueue";

interface Props {
  items: readonly ReportsReviewItem[];
  /** When true, render the calm empty-state copy instead of returning null. */
  showEmptyState?: boolean;
}

export default function ReportsReviewQueueSection({
  items,
  showEmptyState = false,
}: Props) {
  const hasItems = items && items.length > 0;
  if (!hasItems && !showEmptyState) return null;
  return (
    <section
      className="glass rounded-2xl p-4 mb-4"
      aria-label={REPORTS_REVIEW_QUEUE_TITLE}
      data-testid="reports-review-queue"
    >
      <header className="flex items-center gap-2 mb-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">{REPORTS_REVIEW_QUEUE_TITLE}</h2>
          <p className="text-xs text-muted-foreground">
            {REPORTS_REVIEW_QUEUE_SUBTITLE}
          </p>
        </div>
      </header>
      {hasItems ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-border/60 p-3 flex flex-col gap-1.5"
              data-testid={`reports-review-item-${item.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <span
                  title={item.helpText}
                  aria-label={item.helpText}
                  data-testid={`reports-review-help-${item.id}`}
                  className="text-muted-foreground shrink-0"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
              <p
                className="text-[11px] text-muted-foreground/80 italic"
                data-testid={`reports-review-why-${item.id}`}
              >
                Why this is here: {item.whyThisIsHere}
              </p>
              <Link
                to={item.href}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-auto pt-1"
                data-testid={`reports-review-link-${item.id}`}
              >
                {item.hrefLabel}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="text-xs text-muted-foreground"
          data-testid="reports-review-empty"
        >
          {REPORTS_REVIEW_QUEUE_EMPTY_COPY}
        </p>
      )}
    </section>
  );
}
