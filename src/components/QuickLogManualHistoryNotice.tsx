import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  QUICK_LOG_MANUAL_HISTORY_COPY,
  type ManualHistoryReadState,
} from "@/lib/vpdStabilityInputRules";

interface QuickLogManualHistoryNoticeProps {
  state: ManualHistoryReadState;
  onRetry: () => void;
  /** Prefix for `-pending` / `-error` test ids. */
  testIdPrefix: string;
  className?: string;
}

/**
 * Presenter for a pending or failed Quick Log manual-history read that feeds
 * VPD stability. Available stored readings stay visible beside it; this only
 * says the manual part is not confirmed yet. Renders nothing when ready.
 */
export default function QuickLogManualHistoryNotice({
  state,
  onRetry,
  testIdPrefix,
  className,
}: QuickLogManualHistoryNoticeProps) {
  if (state === "ready") return null;
  if (state === "unavailable") {
    return (
      <div
        role="alert"
        data-testid={`${testIdPrefix}-error`}
        className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        <span>{QUICK_LOG_MANUAL_HISTORY_COPY.unavailable}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={onRetry}
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {QUICK_LOG_MANUAL_HISTORY_COPY.retry}
        </Button>
      </div>
    );
  }
  return (
    <p
      role="status"
      data-testid={`${testIdPrefix}-pending`}
      className={`text-xs text-muted-foreground ${className ?? ""}`}
    >
      {state === "paused"
        ? QUICK_LOG_MANUAL_HISTORY_COPY.paused
        : QUICK_LOG_MANUAL_HISTORY_COPY.pending}
    </p>
  );
}
