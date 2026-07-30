/**
 * TimelineEmptyState — presenter for the Operator Mode diary timeline's
 * empty states, with inline fast-add actions.
 *
 * Hard constraints:
 *  - Presenter only. No Supabase, no fetch, no writes. Every action is a
 *    handoff to the existing Quick Log / AI Doctor surfaces, which still
 *    own explicit grower confirmation and save.
 *  - All wording and action selection comes from
 *    `@/lib/timelineEmptyStateRules`. No copy is invented here.
 *  - Never rendered for a failed/incomplete read — that case is a separate
 *    surface owned by Timeline.tsx and must never be shown as "empty".
 */
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Sprout } from "lucide-react";
import {
  FAST_ADD_PICKER_CTAS,
  resolveFastAddIntent,
  type FastAddActionId,
  type FastAddSelectionContext,
} from "@/lib/fastAddActionRules";
import type { TimelineEmptyStateView } from "@/lib/timelineEmptyStateRules";

export interface TimelineEmptyStateProps {
  view: TimelineEmptyStateView;
  context?: FastAddSelectionContext | null;
  /** Rendered when the view offers a clear-filters control. */
  onClearFilters?: () => void;
  /** Test seam: override navigate. */
  onNavigate?: (to: string) => void;
  /** Test seam: override window event dispatch. */
  onDispatchEvent?: (eventName: string, detail: unknown) => void;
}

export default function TimelineEmptyState({
  view,
  context,
  onClearFilters,
  onNavigate,
  onDispatchEvent,
}: TimelineEmptyStateProps) {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);

  const go = useCallback(
    (to: string) => {
      if (onNavigate) onNavigate(to);
      else navigate(to);
    },
    [navigate, onNavigate],
  );

  const handle = useCallback(
    (actionId: FastAddActionId) => {
      const intent = resolveFastAddIntent(actionId, context ?? null);
      if (intent.kind === "needs-context") {
        setNotice(intent.message);
        return;
      }
      setNotice(null);
      if (intent.kind === "navigate") {
        go(intent.to);
        return;
      }
      const detail = intent.kind === "open-quicklog-v2" ? intent.detail : intent.prefill;
      if (onDispatchEvent) {
        onDispatchEvent(intent.eventName, detail);
      } else if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(intent.eventName, { detail }));
      }
    },
    [context, go, onDispatchEvent],
  );

  return (
    <div
      data-testid="timeline-empty-state"
      data-empty-kind={view.kind}
      data-needs-context={view.needsContext ? "true" : "false"}
      className="py-14 text-center"
    >
      <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4">
        <Sprout className="h-7 w-7 text-primary" aria-hidden="true" />
      </div>
      <h2 data-testid="timeline-empty-state-title" className="font-display text-lg font-semibold">
        {view.title}
      </h2>
      <p
        data-testid="timeline-empty-state-desc"
        className="text-sm text-muted-foreground mt-1 mb-5 max-w-md mx-auto leading-relaxed"
      >
        {view.description}
      </p>

      {view.actions.length > 0 ? (
        <div
          data-testid="timeline-empty-state-actions"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {view.actions.map((action) => (
            <button
              key={action.actionId}
              type="button"
              onClick={() => handle(action.actionId)}
              data-testid={`timeline-empty-state-action-${action.actionId}`}
              data-action-id={action.actionId}
              className="inline-flex items-center rounded-lg border border-border/60 bg-secondary/40 px-4 min-h-11 text-sm font-medium hover:bg-secondary/70 active:bg-secondary/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background touch-manipulation"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      {view.resourceLink ? (
        <Link
          to={view.resourceLink.href}
          data-testid="timeline-empty-state-resource-link"
          className="mx-auto mt-4 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {view.resourceLink.label}
        </Link>
      ) : null}

      {view.offersClearFilters && onClearFilters ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onClearFilters}
            data-testid="timeline-empty-state-clear-filters"
            className="inline-flex items-center rounded-lg border border-border/60 px-4 min-h-11 text-sm hover:bg-secondary/60 active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
          >
            Clear filters
          </button>
        </div>
      ) : null}

      {notice ? (
        <div data-testid="timeline-empty-state-needs-context-wrap" className="mt-5 space-y-3">
          <p
            role="status"
            aria-live="polite"
            data-testid="timeline-empty-state-needs-context"
            className="text-sm text-amber-200 leading-snug"
          >
            {notice}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {FAST_ADD_PICKER_CTAS.map((cta) => (
              <button
                key={cta.id}
                type="button"
                data-testid={`timeline-empty-state-cta-${cta.id}`}
                onClick={() => go(cta.to)}
                className="text-sm px-3 min-h-11 inline-flex items-center rounded-md border border-border/60 hover:bg-secondary/60 active:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
              >
                {cta.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
