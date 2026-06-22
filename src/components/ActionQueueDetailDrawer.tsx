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
 */
import { Check, X, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  buildActionDrawerViewModel,
  type ActionDrawerInput,
  type DrawerContextLookups,
} from "@/lib/actionQueueViewModel";

export interface ActionQueueDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ActionDrawerInput | null;
  lookups?: DrawerContextLookups;
  /** True while a transition (approve/reject) is in flight for this row. */
  busy?: boolean;
  /** Optional gate so terminal rows hide Approve/Reject controls. */
  canApprove?: boolean;
  canReject?: boolean;
  onApprove?: (row: ActionDrawerInput) => void;
  onReject?: (row: ActionDrawerInput) => void;
}

export default function ActionQueueDetailDrawer({
  open,
  onOpenChange,
  row,
  lookups,
  busy = false,
  canApprove = true,
  canReject = true,
  onApprove,
  onReject,
}: ActionQueueDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="action-queue-detail-drawer"
      >
        {row ? (
          <ActionQueueDetailDrawerBody
            row={row}
            lookups={lookups}
            busy={busy}
            canApprove={canApprove}
            canReject={canReject}
            onApprove={onApprove}
            onReject={onReject}
          />
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

function ActionQueueDetailDrawerBody({
  row,
  lookups,
  busy,
  canApprove,
  canReject,
  onApprove,
  onReject,
}: Required<
  Pick<ActionQueueDetailDrawerProps, "row" | "busy" | "canApprove" | "canReject">
> &
  Pick<ActionQueueDetailDrawerProps, "lookups" | "onApprove" | "onReject">) {
  const vm = buildActionDrawerViewModel(row as ActionDrawerInput, lookups);
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
            onClick={() => onApprove?.(row as ActionDrawerInput)}
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
            onClick={() => onReject?.(row as ActionDrawerInput)}
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
