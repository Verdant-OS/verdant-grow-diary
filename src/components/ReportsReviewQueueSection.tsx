/**
 * ReportsReviewQueueSection — compact "What to review next" section for the
 * Grow Learning Hub. Renders the prioritized list of follow-up items built
 * by `buildReportsReviewQueue`.
 *
 * SAFETY:
 *  - Presentational only. No I/O, no writes, no automation.
 *  - All ranking/priority logic lives in `src/lib/reportsHubReviewQueue.ts`.
 *  - Copy is observational. Never claims an action fixed or healed anything.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import {
  REPORTS_REVIEW_QUEUE_SUBTITLE,
  REPORTS_REVIEW_QUEUE_TITLE,
  type ReportsReviewItem,
} from "@/lib/reportsHubReviewQueue";

interface Props {
  items: readonly ReportsReviewItem[];
}

export default function ReportsReviewQueueSection({ items }: Props) {
  if (!items || items.length === 0) return null;
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
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-xl border border-border/60 p-3 flex flex-col gap-1.5"
            data-testid={`reports-review-item-${item.id}`}
          >
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
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
    </section>
  );
}
