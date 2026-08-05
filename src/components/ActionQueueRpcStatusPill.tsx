import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY,
  ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY,
  ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY,
  type ActionQueueRpcAvailability,
} from "@/lib/actionQueueRpcAvailability";

/**
 * Presenter-only status pill for the `action_queue_transition` RPC. Renders
 * a tri-state indicator (unknown / available / unavailable) with grower-safe
 * copy and matching iconography. Kept as a pure presenter so it can be
 * exercised in isolation without mounting the full ActionQueue page.
 */
export interface ActionQueueRpcStatusPillProps {
  availability: ActionQueueRpcAvailability;
}

export function ActionQueueRpcStatusPill({ availability }: ActionQueueRpcStatusPillProps) {
  const pillClass =
    availability === "unavailable"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : availability === "available"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
  const pillTitle =
    availability === "unavailable"
      ? ACTION_QUEUE_TRANSITION_RPC_UNAVAILABLE_COPY.title
      : availability === "available"
        ? ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.title
        : ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.title;
  const pillLabel =
    availability === "unavailable"
      ? "Transitions unavailable"
      : availability === "available"
        ? ACTION_QUEUE_TRANSITION_RPC_AVAILABLE_COPY.label
        : ACTION_QUEUE_TRANSITION_RPC_CHECKING_COPY.label;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy={availability === "unknown"}
      data-testid="action-queue-transition-rpc-status-pill"
      data-state={availability}
      title={pillTitle}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${pillClass}`}
    >
      {availability === "unavailable" ? (
        <AlertTriangle
          className="h-3 w-3"
          aria-hidden="true"
          data-testid="action-queue-transition-rpc-status-pill-icon-unavailable"
        />
      ) : availability === "available" ? (
        <CheckCircle2
          className="h-3 w-3"
          aria-hidden="true"
          data-testid="action-queue-transition-rpc-status-pill-icon-available"
        />
      ) : (
        <Loader2
          className="h-3 w-3 animate-spin"
          aria-hidden="true"
          data-testid="action-queue-transition-rpc-status-pill-icon-checking"
        />
      )}
      <span>{pillLabel}</span>
    </span>
  );
}
