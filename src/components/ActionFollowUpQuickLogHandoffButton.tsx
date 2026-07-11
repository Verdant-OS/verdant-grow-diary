/**
 * ActionFollowUpQuickLogHandoffButton — presenter-only CTA that opens
 * the existing Quick Log photo flow with the action's grow/tent/plant
 * context, then refreshes the follow-up form's existing-photo
 * candidates once Quick Log reports a save.
 *
 * SAFETY:
 *  - No file-input element, no camera capture attribute, no uploader,
 *    and no signed URL are introduced here.
 *  - Dispatches ONLY the existing `verdant:open-quicklog` event that
 *    AppShell already listens for. Never navigates.
 *  - Listens for the existing `verdant:entry-created` event to know
 *    when to refresh candidates. Cancel = no event = no refresh, so
 *    the follow-up evidence is left unchanged.
 *  - Never auto-selects the new photo, never auto-saves the follow-up.
 */
import { useCallback, useEffect, useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACTION_FOLLOWUP_QUICKLOG_CTA_HELP,
  ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL,
  ACTION_FOLLOWUP_QUICKLOG_EVENT,
  buildActionFollowUpQuickLogPrefill,
  buildActionFollowUpReturnPath,
  type ActionFollowUpQuickLogHandoffInput,
} from "@/lib/actionFollowUpQuickLogHandoffRules";

export interface ActionFollowUpQuickLogHandoffButtonProps {
  action: ActionFollowUpQuickLogHandoffInput;
  disabled?: boolean;
  /** Called after Quick Log dispatches `verdant:entry-created` while
   *  this handoff is active — parent should refresh photo candidates. */
  onPhotoCreated: () => void;
}

const ENTRY_CREATED_EVENT = "verdant:entry-created";

export default function ActionFollowUpQuickLogHandoffButton({
  action,
  disabled,
  onPhotoCreated,
}: ActionFollowUpQuickLogHandoffButtonProps) {
  const armed = useRef(false);
  const onPhotoCreatedRef = useRef(onPhotoCreated);
  useEffect(() => {
    onPhotoCreatedRef.current = onPhotoCreated;
  }, [onPhotoCreated]);

  useEffect(() => {
    function onCreated() {
      if (!armed.current) return;
      armed.current = false;
      onPhotoCreatedRef.current();
    }
    window.addEventListener(ENTRY_CREATED_EVENT, onCreated as EventListener);
    return () => window.removeEventListener(ENTRY_CREATED_EVENT, onCreated as EventListener);
  }, []);

  const handleClick = useCallback(() => {
    const prefill = buildActionFollowUpQuickLogPrefill(action);
    if (!prefill) return;
    // Defensive: pre-compute the safe internal return path. The modal
    // handoff itself never navigates, but validating here guarantees
    // that any future URL-driven flow would be blocked from smuggling
    // an unsafe path through this component.
    if (!buildActionFollowUpReturnPath(action.actionId)) return;
    armed.current = true;
    window.dispatchEvent(
      new CustomEvent(ACTION_FOLLOWUP_QUICKLOG_EVENT, { detail: prefill }),
    );
  }, [action]);

  return (
    <div className="space-y-1" data-testid="action-followup-quicklog-handoff">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
        aria-label={ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL}
        data-testid="action-followup-quicklog-handoff-btn"
        className="min-h-[44px] gap-2"
      >
        <ImagePlus className="h-4 w-4" aria-hidden="true" />
        {ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL}
      </Button>
      <p
        className="text-xs text-muted-foreground"
        data-testid="action-followup-quicklog-handoff-help"
      >
        {ACTION_FOLLOWUP_QUICKLOG_CTA_HELP}
      </p>
    </div>
  );
}
