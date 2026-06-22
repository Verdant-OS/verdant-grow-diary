/**
 * ActionQueueDetailDrawer — slide-over Sheet that explains a single
 * pending Action Queue item to the grower.
 *
 * Hard constraints (presenter-only):
 *  - No I/O, no Supabase, no AI calls in this component. Approve/Reject
 *    callbacks are passed in by the parent and only fire on explicit
 *    grower click.
 *  - Never renders raw payloads, internal UUIDs, bridge tokens, service
 *    keys, or `[alert:<id>]` / `[session:<id>]` back-pointer tokens.
 *  - Always renders the safety reminder so the grower sees that no
 *    equipment is controlled from this surface.
 *  - When status history / context is still loading, renders a stable
 *    skeleton — never placeholder claims like "safe", "healthy", or
 *    "approved".
 */
import { Check, X, ShieldCheck, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildActionDrawerViewModel,
  type ActionDrawerInput,
  type DrawerContextLookups,
} from "@/lib/actionQueueViewModel";
import {
  buildActionQueueSourceLink,
  SOURCE_LINK_UNAVAILABLE_COPY,
} from "@/lib/actionQueueSourceLinkRules";
import {
  STATUS_HISTORY_EMPTY_COPY,
  type ActionQueueStatusHistoryEntry,
} from "@/lib/actionQueueStatusHistoryRules";
import {
  deriveActionTraceBadgeState,
  ACTION_TRACE_BADGE_LABEL,
  ACTION_TRACE_BADGE_HELP,
} from "@/lib/actionQueueTraceStatusRules";
import {
  buildActionDiaryTraceLink,
  TIMELINE_TRACE_UNAVAILABLE_COPY,
} from "@/lib/actionQueueTimelineLinkRules";
import { buildCopyableTraceLinkFromHighlight } from "@/lib/actionQueueTraceLinkCopyRules";
import CopyTraceLinkButton from "@/components/CopyTraceLinkButton";
import { buildRetryTraceViewModel } from "@/lib/actionQueueRetryTraceViewModel";



export interface ActionQueueDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ActionDrawerInput | null;
  lookups?: DrawerContextLookups;
  /** True while a transition (approve/reject) is in flight for this row. */
  busy?: boolean;
  /** True while related context / status history is still loading. */
  loading?: boolean;
  /** Optional gate so terminal rows hide Approve/Reject controls. */
  canApprove?: boolean;
  canReject?: boolean;
  /** Normalized status history rows (already filtered to this action). */
  statusHistory?: ActionQueueStatusHistoryEntry[];
  /** True after approve/reject succeeded but the timeline trace failed. */
  traceFailed?: boolean;
  /** True while a trace-only retry is in flight. */
  retrying?: boolean;
  /**
   * Current /actions URLSearchParams. When provided, the "View diary
   * trace" link adds a safe `actionsReturn` round-trip so the grower
   * returns to their exact /actions URL state — preserving any
   * highlight, search, status, trace, pagination, view, or growId.
   */
  currentActionsParams?: URLSearchParams | null;
  onApprove?: (row: ActionDrawerInput) => void;
  onReject?: (row: ActionDrawerInput) => void;
  onRetryTrace?: (row: ActionDrawerInput) => void;
}

export default function ActionQueueDetailDrawer(props: ActionQueueDetailDrawerProps) {
  const { open, onOpenChange, row, loading = false } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="action-queue-detail-drawer"
      >
        {row ? (
          loading ? (
            <DrawerSkeleton />
          ) : (
            <ActionQueueDetailDrawerBody {...props} row={row} />
          )
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="action-queue-detail-drawer-empty"
          >
            No action selected.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Drawer skeleton — preserves structure (header, source/reason,
 * related context, status history, safety reminder) so the body does
 * not jump when real data arrives. Renders NO claim text.
 */
function DrawerSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Loading action details"
      data-testid="action-queue-detail-drawer-skeleton"
    >
      <span className="sr-only">Loading action details…</span>
      <SheetHeader>
        <Skeleton className="h-5 w-2/3" data-testid="action-queue-detail-drawer-skeleton-title" />
      </SheetHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton
        className="h-3 w-1/3"
        data-testid="action-queue-detail-drawer-skeleton-source"
      />
      <Skeleton
        className="h-12 w-full"
        data-testid="action-queue-detail-drawer-skeleton-reason"
      />
      <div className="space-y-1" data-testid="action-queue-detail-drawer-skeleton-context">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
      <div className="space-y-1" data-testid="action-queue-detail-drawer-skeleton-history">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton
        className="h-10 w-full rounded-lg"
        data-testid="action-queue-detail-drawer-skeleton-safety"
      />
    </div>
  );
}

function formatHistoryTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ActionQueueDetailDrawerBody({
  row,
  lookups,
  busy = false,
  canApprove = true,
  canReject = true,
  statusHistory,
  traceFailed = false,
  retrying = false,
  currentActionsParams = null,
  onApprove,
  onReject,
  onRetryTrace,
}: Required<Pick<ActionQueueDetailDrawerProps, "row">> &
  Pick<
    ActionQueueDetailDrawerProps,
    | "lookups"
    | "busy"
    | "canApprove"
    | "canReject"
    | "statusHistory"
    | "traceFailed"
    | "retrying"
    | "currentActionsParams"
    | "onApprove"
    | "onReject"
    | "onRetryTrace"
  >) {
  const vm = buildActionDrawerViewModel(row, lookups);
  const sourceLink = buildActionQueueSourceLink({
    source: row.source ?? null,
    reason: row.reason ?? null,
    grow_id: row.grow_id ?? null,
    tent_id: row.tent_id ?? null,
    plant_id: row.plant_id ?? null,
  });
  const history = Array.isArray(statusHistory) ? statusHistory : [];
  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle data-testid="action-queue-detail-drawer-title">
          {vm.titleLabel}
        </SheetTitle>
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          data-testid="action-queue-detail-drawer-status"
        >
          {vm.statusLabel}
        </Badge>
        <Badge
          variant="outline"
          data-testid="action-queue-detail-drawer-risk"
        >
          {vm.riskLabel}
        </Badge>
        <Badge
          variant="outline"
          data-testid="action-queue-detail-drawer-source"
        >
          Source: {vm.sourceLabel}
        </Badge>
        {(() => {
          const traceState = deriveActionTraceBadgeState({
            actionId: (row as { id?: string }).id ?? "",
            traceFailureActionId: traceFailed ? ((row as { id?: string }).id ?? null) : null,
            retryingTrace: retrying,
          });
          return (
            <Badge
              variant="outline"
              data-testid={`action-queue-detail-drawer-trace-badge-${traceState}`}
              data-trace-state={traceState}
              title={ACTION_TRACE_BADGE_HELP[traceState]}
              aria-label={`${ACTION_TRACE_BADGE_LABEL[traceState]}. ${ACTION_TRACE_BADGE_HELP[traceState]}`}
            >
              {ACTION_TRACE_BADGE_LABEL[traceState]}
            </Badge>
          );
        })()}
      </div>

      {/* View diary trace — pure helper decides availability. */}
      <div data-testid="action-queue-detail-drawer-diary-trace-row">
        {(() => {
          const rowId = (row as { id?: string }).id;
          const rowStatus = (row as { status?: string }).status;
          if (!rowId) return null;
          const link = buildActionDiaryTraceLink({
            status: rowStatus,
            actionId: rowId,
            traceFailed,
            currentActionsParams,
          });
          if (link) {
            const copy = buildCopyableTraceLinkFromHighlight(link.highlight, {
              actionsReturn: link.actionsReturn ?? null,
            });
            return (
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={link.href}
                  data-testid="action-queue-detail-drawer-diary-trace-link"
                  data-trace-highlight={link.highlight}
                  data-trace-kind={link.kind}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  {link.label}
                </a>
                {copy && (
                  <CopyTraceLinkButton
                    url={copy.url}
                    testIdSuffix="drawer"
                  />
                )}
              </div>
            );
          }
          if (rowStatus === "approved" || rowStatus === "rejected") {
            return (
              <p
                className="text-xs text-muted-foreground"
                data-testid="action-queue-detail-drawer-diary-trace-unavailable"
              >
                {TIMELINE_TRACE_UNAVAILABLE_COPY}
              </p>
            );
          }
          return null;
        })()}
      </div>


      {/* Go to source — pure helper decides safety. */}
      <div data-testid="action-queue-detail-drawer-source-link-row">
        {sourceLink ? (
          <a
            href={sourceLink.href}
            data-testid="action-queue-detail-drawer-source-link"
            data-source-kind={sourceLink.kind}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            {sourceLink.label}
          </a>
        ) : (
          <p
            className="text-xs text-muted-foreground"
            data-testid="action-queue-detail-drawer-source-link-unavailable"
          >
            {SOURCE_LINK_UNAVAILABLE_COPY}
          </p>
        )}
      </div>

      {vm.recommendationText && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Recommendation
          </h3>
          <p
            className="text-sm mt-1"
            data-testid="action-queue-detail-drawer-recommendation"
          >
            {vm.recommendationText}
          </p>
        </section>
      )}

      {vm.reasonText && (
        <section>
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
            Reason
          </h3>
          <p
            className="text-sm mt-1"
            data-testid="action-queue-detail-drawer-reason"
          >
            {vm.reasonText}
          </p>
        </section>
      )}

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Target
        </h3>
        <p
          className="text-sm mt-1"
          data-testid="action-queue-detail-drawer-target"
        >
          {vm.targetLabel}
        </p>
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Related context
        </h3>
        {vm.hasRelatedContext ? (
          <ul
            className="text-sm mt-1 space-y-1"
            data-testid="action-queue-detail-drawer-context"
          >
            {vm.growLabel && (
              <li data-testid="action-queue-detail-drawer-grow">
                Grow: {vm.growLabel}
              </li>
            )}
            {vm.tentLabel && (
              <li data-testid="action-queue-detail-drawer-tent">
                Tent: {vm.tentLabel}
              </li>
            )}
            {vm.plantLabel && (
              <li data-testid="action-queue-detail-drawer-plant">
                Plant: {vm.plantLabel}
              </li>
            )}
          </ul>
        ) : (
          <p
            className="text-sm mt-1 text-muted-foreground"
            data-testid="action-queue-detail-drawer-no-context"
          >
            {vm.noContextHelpText}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
          Status history
        </h3>
        {history.length === 0 ? (
          <p
            className="text-sm mt-1 text-muted-foreground"
            data-testid="action-queue-detail-drawer-history-empty"
          >
            {STATUS_HISTORY_EMPTY_COPY}
          </p>
        ) : (
          <ul
            className="text-sm mt-1 space-y-1"
            data-testid="action-queue-detail-drawer-history"
          >
            {history.map((h) => (
              <li
                key={h.idempotency_key}
                data-testid="action-queue-detail-drawer-history-item"
                data-trace-kind={h.kind}
                className="flex items-center justify-between gap-2"
              >
                <span>{h.label}</span>
                <span className="text-xs text-muted-foreground">
                  {formatHistoryTimestamp(h.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(() => {
        const retryVm = buildRetryTraceViewModel({
          traceFailed: !!traceFailed,
          retrying: !!retrying,
        });
        if (!retryVm.showFailureRegion) return null;
        return (
          <div
            role="alert"
            data-testid="action-queue-detail-drawer-trace-failure"
            data-trace-state={retryVm.state}
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-foreground"
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-destructive"
              aria-hidden
            />
            <div className="flex-1 space-y-1">
              {retryVm.explanationLines.map((line, i) => (
                <p
                  key={i}
                  data-testid={
                    i === 0
                      ? "action-queue-detail-drawer-trace-explain-primary"
                      : "action-queue-detail-drawer-trace-explain-secondary"
                  }
                >
                  {line}
                </p>
              ))}
              {!retryVm.buttonHidden && retryVm.buttonLabel && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retryVm.buttonDisabled}
                  onClick={() => onRetryTrace?.(row)}
                  data-testid="action-queue-detail-drawer-retry-trace"
                  aria-label="Retry diary trace"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {retryVm.buttonLabel}
                </Button>
              )}
            </div>
          </div>
        );
      })()}


      <div
        className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground"
        role="note"
        data-testid="action-queue-detail-drawer-safety-reminder"
      >
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>{vm.safetyReminder}</span>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {canApprove && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => onApprove?.(row)}
            className="gradient-leaf text-primary-foreground"
            data-testid="action-queue-detail-drawer-approve"
            aria-label="Approve action"
          >
            <Check className="h-4 w-4" /> Approve
          </Button>
        )}
        {canReject && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onReject?.(row)}
            data-testid="action-queue-detail-drawer-reject"
            aria-label="Reject action"
          >
            <X className="h-4 w-4" /> Reject
          </Button>
        )}
      </div>
    </div>
  );
}
