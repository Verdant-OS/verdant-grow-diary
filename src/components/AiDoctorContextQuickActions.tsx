/**
 * AiDoctorContextQuickActions — presenter-only quick-action row for the
 * AI Doctor Context panel. Renders lightweight buttons/links for the
 * descriptors produced by `buildAiDoctorContextQuickActions`.
 *
 * Hard constraints:
 *  - No business rules in JSX; mapping lives in the view-model.
 *  - No Supabase writes, no AI Doctor session creation, no alerts /
 *    action_queue writes, no diary writes.
 *  - Copy is calm; nothing here implies AI confidence is strong.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type {
  AiDoctorContextQuickAction,
  AiDoctorContextQuickActionEventTarget,
} from "@/lib/aiDoctorContextQuickActionsViewModel";

export interface AiDoctorContextQuickActionsProps {
  actions: readonly AiDoctorContextQuickAction[];
  /** Optional test-id prefix so multiple panels can coexist on one page. */
  testIdPrefix?: string;
  className?: string;
}

function dispatchEvent(target: AiDoctorContextQuickActionEventTarget): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(target.eventName, { detail: target.payload }),
  );
}

export default function AiDoctorContextQuickActions({
  actions,
  testIdPrefix,
  className,
}: AiDoctorContextQuickActionsProps) {
  if (!actions || actions.length === 0) return null;
  const containerTestId = testIdPrefix
    ? `${testIdPrefix}-quick-actions`
    : "ai-doctor-context-quick-actions";
  return (
    <div
      data-testid={containerTestId}
      className={`flex flex-wrap gap-2 ${className ?? ""}`}
    >
      {actions.map((action) => {
        const aria = action.disabled && action.disabledReason
          ? `${action.label} (unavailable: ${action.disabledReason})`
          : action.label;
        if (action.target.kind === "link") {
          if (action.disabled) {
            return (
              <Button
                key={action.kind}
                type="button"
                size="sm"
                variant="outline"
                disabled
                aria-label={aria}
                data-testid={action.testId}
                data-action-kind={action.kind}
              >
                {action.label}
              </Button>
            );
          }
          return (
            <Button
              key={action.kind}
              asChild
              size="sm"
              variant="outline"
              data-testid={action.testId}
              data-action-kind={action.kind}
            >
              <Link to={action.target.href} aria-label={aria}>
                {action.label}
              </Link>
            </Button>
          );
        }
        const target = action.target;
        return (
          <Button
            key={action.kind}
            type="button"
            size="sm"
            variant="outline"
            disabled={action.disabled}
            aria-label={aria}
            data-testid={action.testId}
            data-action-kind={action.kind}
            onClick={() => dispatchEvent(target)}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
