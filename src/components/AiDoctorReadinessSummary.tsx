/**
 * AiDoctorReadinessSummary — presenter for the single Plant Detail AI review
 * readiness verdict. Spec: docs/specs/ai-doctor-readiness-single-summary.md.
 *
 * Presenter only: no fetch, no Supabase, no model or credit calls, no Action
 * Queue writes. The verdict comes from `buildAiDoctorReadinessSummary`.
 */
import { Button } from "@/components/ui/button";
import type { AiDoctorReadinessSummary as Summary } from "@/lib/aiDoctorReadinessSummaryRules";
import {
  AI_DOCTOR_READINESS_SUMMARY_HEADING,
  AI_DOCTOR_READINESS_SUMMARY_MISSING_HEADING,
} from "@/constants/aiDoctorReadinessSummaryCopy";

export interface AiDoctorReadinessSummaryProps {
  summary: Summary;
  /** Re-runs the failed current-sensor read (row 2). */
  onRetry?: () => void;
}

export default function AiDoctorReadinessSummary({
  summary,
  onRetry,
}: AiDoctorReadinessSummaryProps) {
  const { verdict, headline, sensorLine, missing, nextStep } = summary;
  return (
    <section
      aria-labelledby="ai-doctor-readiness-summary-heading"
      aria-live="polite"
      data-testid="ai-doctor-readiness-summary"
      data-verdict={verdict}
      data-row={summary.row}
      className="glass rounded-2xl p-4 space-y-2"
    >
      <h2
        id="ai-doctor-readiness-summary-heading"
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {AI_DOCTOR_READINESS_SUMMARY_HEADING}
      </h2>
      <p className="text-sm font-medium" data-testid="ai-doctor-readiness-summary-headline">
        {headline}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="ai-doctor-readiness-summary-sensor">
        {sensorLine}
      </p>
      {verdict !== "checking" && missing.length > 0 ? (
        <div data-testid="ai-doctor-readiness-summary-missing">
          <p className="text-xs font-medium">{AI_DOCTOR_READINESS_SUMMARY_MISSING_HEADING}</p>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {missing.map((item) => (
              <li key={item.code} data-missing-code={item.code}>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {nextStep.kind === "retry" && onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          data-testid="ai-doctor-readiness-summary-retry"
        >
          {nextStep.label}
        </Button>
      ) : nextStep.kind !== "none" && nextStep.kind !== "add_missing" ? (
        <p className="text-xs" data-testid="ai-doctor-readiness-summary-next-step">
          {nextStep.label}
        </p>
      ) : null}
    </section>
  );
}
