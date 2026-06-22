/**
 * ActionQueueTraceStatusAnnouncer — tiny presenter that announces
 * meaningful trace-status changes to screen readers via an aria-live
 * polite region.
 *
 * Presenter-only:
 *  - No I/O, no Supabase, no AI calls.
 *  - Never renders internal IDs.
 *  - Avoids noisy initial-render announcements for the idle state.
 */
import { useEffect, useRef, useState } from "react";
import type { ActionTraceBadgeState } from "@/lib/actionQueueTraceStatusRules";
import {
  buildTraceStatusAnnouncement,
  TRACE_STATUS_ANNOUNCEMENT_TESTID,
} from "@/lib/actionQueueTraceStatusA11yRules";

export interface ActionQueueTraceStatusAnnouncerProps {
  state: ActionTraceBadgeState;
}

export default function ActionQueueTraceStatusAnnouncer({
  state,
}: ActionQueueTraceStatusAnnouncerProps) {
  const prevRef = useRef<ActionTraceBadgeState | null>(null);
  const initialRef = useRef(true);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const next = buildTraceStatusAnnouncement({
      state,
      previousState: prevRef.current,
      isInitial: initialRef.current,
    });
    prevRef.current = state;
    initialRef.current = false;
    if (next !== null) setMessage(next);
  }, [state]);

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid={TRACE_STATUS_ANNOUNCEMENT_TESTID}
      data-trace-state={state}
    >
      {message}
    </span>
  );
}
