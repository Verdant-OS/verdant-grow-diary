/**
 * SafeByDesignNotice — small presentational badge/banner that
 * communicates Verdant's safety posture wherever recommendations or
 * sensor intelligence appear.
 *
 * Hard constraints:
 *  - Display only. No I/O. No writes.
 *  - Never implies any automation or device-control behavior.
 *  - Copy is sourced from `SAFE_BY_DESIGN_COPY` in
 *    `dashboardActionQueueViewModel.ts` so the static safety scanner
 *    can locate it.
 */
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SAFE_BY_DESIGN_COPY } from "@/lib/dashboardActionQueueViewModel";

export interface SafeByDesignNoticeProps {
  variant?: "compact" | "full";
  className?: string;
  testId?: string;
}

export default function SafeByDesignNotice({
  variant = "full",
  className,
  testId = "safe-by-design-notice",
}: SafeByDesignNoticeProps) {
  const compact = variant === "compact";
  return (
    <div
      data-testid={testId}
      data-variant={variant}
      role="note"
      aria-label="Safe by Design, Read-Only, Approval Required"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground",
        className,
      )}
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="leading-snug">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
          <span>{SAFE_BY_DESIGN_COPY.badge}</span>
          <span aria-hidden className="opacity-50">·</span>
          <span>{SAFE_BY_DESIGN_COPY.readOnly}</span>
          <span aria-hidden className="opacity-50">·</span>
          <span>{SAFE_BY_DESIGN_COPY.approvalRequired}</span>
        </div>
        {compact ? null : (
          <p className="mt-0.5 text-muted-foreground">
            {SAFE_BY_DESIGN_COPY.explainer}
          </p>
        )}
      </div>
    </div>
  );
}
