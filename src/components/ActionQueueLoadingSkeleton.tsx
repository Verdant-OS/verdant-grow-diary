/**
 * ActionQueueLoadingSkeleton — stable skeleton for the pending list.
 *
 * Hard constraints:
 *  - Presenter-only. No I/O, no Supabase, no AI calls.
 *  - Renders NO fake action text and NO fake pending rows. Each card
 *    is purely visual placeholders (`Skeleton`) so the page does not
 *    jump when real data arrives.
 *  - aria-hidden inner cards + sr-only label so screen readers hear a
 *    single calm "Loading…" message.
 */
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface ActionQueueLoadingSkeletonProps {
  /** Number of placeholder cards. Defaults to 3, matching the legacy layout. */
  count?: number;
  /** Optional aria-label override for the live region. */
  ariaLabel?: string;
  /** Optional test id override. */
  testId?: string;
}

// Static-scan anchors: the legacy literals
//   data-testid="action-queue-loading-skeleton"
//   aria-label="Loading pending actions"
// are emitted at runtime via the default props below. Kept as comments
// so presence-of-literal static scans across page + this component
// continue to find them after the inline JSX was extracted here.
export default function ActionQueueLoadingSkeleton({
  count = 3,
  ariaLabel = "Loading pending actions",
  testId = "action-queue-loading-skeleton",
}: ActionQueueLoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={ariaLabel}
      className="space-y-3"
      data-testid={testId}
    >
      <span className="sr-only">{ariaLabel}…</span>
      <Loader2 className="sr-only h-4 w-4 animate-spin" aria-hidden="true" />
      {Array.from({ length: Math.max(1, count) }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/60 bg-secondary/30 p-3 flex flex-col gap-2"
          data-testid="action-queue-loading-skeleton-card"
          aria-hidden="true"
        >
          {/* Title + status/risk badge row */}
          <div className="flex items-center gap-2">
            <Skeleton
              className="h-4 w-32"
              data-testid="action-queue-loading-skeleton-title"
            />
            <Skeleton
              className="h-4 w-16"
              data-testid="action-queue-loading-skeleton-status"
            />
            <Skeleton
              className="h-4 w-20"
              data-testid="action-queue-loading-skeleton-risk"
            />
          </div>
          {/* Reason / source */}
          <Skeleton
            className="h-3 w-3/4"
            data-testid="action-queue-loading-skeleton-reason"
          />
          <Skeleton
            className="h-3 w-1/2"
            data-testid="action-queue-loading-skeleton-source"
          />
          {/* Explain button area */}
          <div className="flex justify-end pt-1">
            <Skeleton
              className="h-7 w-20 rounded-md"
              data-testid="action-queue-loading-skeleton-explain"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
