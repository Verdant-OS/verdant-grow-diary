/**
 * AI Doctor Session → Action Queue button.
 *
 * Presenter-only wrapper around the existing safety envelope:
 *   - `isSessionSuggestionEligibleForActionQueue` gates render.
 *   - `useAddAiDoctorSessionSuggestionToActionQueue` performs the insert.
 *
 * The button only ever produces ONE approval-required `action_queue` row per
 * (session, suggestion). It never executes anything, never controls devices,
 * never mentions device targets in copy, and never exposes raw session tokens
 * to the UI surface.
 */
import { useState } from "react";
import { Link } from "@/lib/react-router-compat";
import { Button } from "@/components/ui/button";
import {
  isSessionSuggestionEligibleForActionQueue,
  type AiDoctorSessionLike,
  type AiDoctorSuggestedActionLike,
} from "@/lib/aiDoctorSessionToActionQueueRules";
import {
  useAddAiDoctorSessionSuggestionToActionQueue,
  type AddAiDoctorSessionSuggestionResult,
} from "@/hooks/useAddAiDoctorSessionSuggestionToActionQueue";

export interface AiDoctorSessionActionQueueButtonProps {
  session: AiDoctorSessionLike;
  action: AiDoctorSuggestedActionLike;
  /** Optional override for the Action Queue list/detail route. */
  actionQueueHref?: string;
  /**
   * Id of an open Action Queue item the page already matched to this
   * suggestion. When set, the button renders as already added instead of
   * offering an add that the dedupe probe would only skip. The page owns the
   * link to that item, so the button renders none of its own.
   */
  existingActionQueueId?: string | null;
}

type LocalState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "inserted"; id: string }
  | { kind: "duplicate"; id: string }
  | { kind: "error" };

const HELPER_COPY = "Creates an approval-required Action Queue item for grower review.";
const ERROR_COPY = "Couldn't add this suggestion. No equipment changes were made.";
const DEFAULT_ACTION_QUEUE_HREF = "/actions";

export function AiDoctorSessionActionQueueButton({
  session,
  action,
  actionQueueHref = DEFAULT_ACTION_QUEUE_HREF,
  existingActionQueueId = null,
}: AiDoctorSessionActionQueueButtonProps) {
  const [localState, setState] = useState<LocalState>({ kind: "idle" });
  // A click result (loading / inserted / duplicate) outranks the page's match;
  // otherwise a known linked item means there is nothing left to add.
  const knownExisting =
    existingActionQueueId && (localState.kind === "idle" || localState.kind === "error");
  const state: LocalState = knownExisting
    ? { kind: "duplicate", id: existingActionQueueId }
    : localState;
  const mutation = useAddAiDoctorSessionSuggestionToActionQueue();

  if (!isSessionSuggestionEligibleForActionQueue(session, action)) {
    return null;
  }

  const onClick = () => {
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    mutation.mutate(
      { session, action },
      {
        onSuccess: (result: AddAiDoctorSessionSuggestionResult) => {
          if (result.status === "inserted") {
            setState({ kind: "inserted", id: result.actionQueueId });
          } else if (result.status === "duplicate_skipped") {
            setState({ kind: "duplicate", id: result.existingActionQueueId });
          } else {
            // Ineligible at server-evaluation time (race) — treat as error copy.
            setState({ kind: "error" });
          }
        },
        onError: () => {
          setState({ kind: "error" });
        },
      },
    );
  };

  let label: string;
  let disabled = false;
  switch (state.kind) {
    case "loading":
      label = "Adding…";
      disabled = true;
      break;
    case "inserted":
      label = "Added to Action Queue";
      disabled = true;
      break;
    case "duplicate":
      label = "Already in Action Queue";
      disabled = true;
      break;
    case "error":
      label = "Could not add";
      break;
    case "idle":
    default:
      label = "Add to Action Queue";
  }

  const linkId =
    !knownExisting && (state.kind === "inserted" || state.kind === "duplicate") ? state.id : null;

  return (
    <div
      className="mt-2 space-y-1"
      data-testid="ai-doctor-session-detail-add-to-action-queue"
      data-state={state.kind}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={state.kind === "error" ? "destructive" : "secondary"}
          onClick={onClick}
          disabled={disabled}
          data-testid="ai-doctor-session-detail-add-to-action-queue-button"
        >
          {label}
        </Button>
        {linkId ? (
          <Link
            to={`${actionQueueHref}?focus=${encodeURIComponent(linkId)}`}
            className="text-xs underline text-primary"
            data-testid="ai-doctor-session-detail-add-to-action-queue-link"
            data-action-queue-id={linkId}
          >
            {state.kind === "duplicate" ? "View existing item" : "View item"}
          </Link>
        ) : null}
      </div>
      {state.kind === "error" ? (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="ai-doctor-session-detail-add-to-action-queue-error"
        >
          {ERROR_COPY}
        </p>
      ) : (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-doctor-session-detail-add-to-action-queue-helper"
        >
          {HELPER_COPY}
        </p>
      )}
    </div>
  );
}

export default AiDoctorSessionActionQueueButton;
