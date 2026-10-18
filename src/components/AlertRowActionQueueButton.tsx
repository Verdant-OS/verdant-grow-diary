/**
 * AlertRowActionQueueButton — user-initiated "Add to Action Queue" handoff
 * button for open alerts on the Alert Center list (`/alerts`), plus shared
 * queuing helper used when the One-Tent Loop card CTA is clicked with an
 * open alert in scope.
 *
 * Safety contract:
 *  - Creates only via `createActionQueueItem` (`action_queue_create` RPC).
 *  - Never sends `user_id` or `target_device`.
 *  - Items are always `pending_approval` and require grower approval.
 */
import { useState } from "react";
import { Link } from "@/lib/react-router-compat";
import { ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createActionQueueItem } from "@/lib/actionQueueCreateService";
import {
  actionQueueCreateFailureCopy,
  buildEnvironmentAlertDedupeKey,
} from "@/lib/actionQueueCreateRules";
import { buildActionQueueDraftFromAlert, type AlertLike } from "@/lib/alertToActionQueueRules";
import { forwardAlertRefsToActionQueue } from "@/lib/originatingTimelineEventForwardRules";
import { actionDetailPath, actionQueueAlertContextPath } from "@/lib/routes";
import type { AlertLinkedActionsSummary } from "@/lib/alertsLinkedActionsViewModel";

export interface QueueOpenAlertResult {
  ok: boolean;
  actionQueueId?: string;
  reused?: boolean;
}

export async function queueOpenAlertToActionQueue(
  alert: AlertLike & { originating_timeline_events?: unknown },
): Promise<QueueOpenAlertResult> {
  const draftResult = buildActionQueueDraftFromAlert(alert);
  if (!draftResult.ok) return { ok: false };
  const { draft } = draftResult;
  let result: Awaited<ReturnType<typeof createActionQueueItem>>;
  try {
    result = await createActionQueueItem({
      grow_id: draft.grow_id,
      tent_id: draft.tent_id,
      plant_id: draft.plant_id,
      action_type: draft.action_type,
      target_metric: draft.target_metric,
      suggested_change: draft.suggested_change,
      reason: draft.reason,
      risk_level: draft.risk_level,
      source: draft.source,
      dedupe_key: buildEnvironmentAlertDedupeKey(alert.id),
      audit_note: draft.audit_note,
      originating_timeline_events: forwardAlertRefsToActionQueue(alert),
    });
  } catch {
    toast.error(actionQueueCreateFailureCopy(null));
    return { ok: false };
  }
  if (!result.ok) {
    if (result.reason === "plant_not_in_grow" || result.reason === "tent_not_in_grow") {
      toast.error("This action cannot be queued until the plant/tent is assigned to this grow.", {
        description: "Open Lineage Repair to assign tents to this grow.",
      });
      return { ok: false };
    }
    toast.error(actionQueueCreateFailureCopy(result.reason));
    return { ok: false };
  }
  toast.success(
    result.reused ? "Action already in queue for approval." : "Action queued for approval.",
  );
  return {
    ok: true,
    actionQueueId: result.action_queue_id,
    reused: result.reused,
  };
}

export interface AlertRowActionQueueButtonProps {
  alert: AlertLike & { title?: string | null; originating_timeline_events?: unknown };
  linkedSummary: AlertLinkedActionsSummary | undefined;
  onQueued?: (alertId: string, actionQueueId: string) => void;
}

export function AlertRowActionQueueButton({
  alert,
  linkedSummary,
  onQueued,
}: AlertRowActionQueueButtonProps) {
  const [queuing, setQueuing] = useState(false);
  const [queuedActionId, setQueuedActionId] = useState<string | null>(null);

  if (alert.status !== "open") return null;
  const draftResult = buildActionQueueDraftFromAlert(alert);
  if (!draftResult.ok) return null;

  const existingSingleId =
    queuedActionId ??
    (linkedSummary && linkedSummary.count > 0 ? linkedSummary.singleActionId : null);
  const hasLinked = !!queuedActionId || (!!linkedSummary && linkedSummary.count > 0);

  if (hasLinked) {
    const href = existingSingleId
      ? actionDetailPath(existingSingleId)
      : actionQueueAlertContextPath(String(alert.id ?? ""));
    return (
      <Button asChild size="sm" variant="secondary">
        <Link to={href} data-testid="alert-row-already-queued-link">
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Queued for approval</span>
        </Link>
      </Button>
    );
  }

  async function handleClick() {
    if (queuing) return;
    setQueuing(true);
    const res = await queueOpenAlertToActionQueue(alert);
    setQueuing(false);
    if (res.ok && res.actionQueueId) {
      setQueuedActionId(res.actionQueueId);
      if (alert.id) onQueued?.(alert.id, res.actionQueueId);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={queuing}
      onClick={() => void handleClick()}
      aria-label={`Add to Action Queue: ${alert.title || "Untitled alert"}`}
      data-testid="alert-row-add-to-action-queue"
    >
      {queuing ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          <span>Adding…</span>
        </>
      ) : (
        "Add to Action Queue"
      )}
    </Button>
  );
}
