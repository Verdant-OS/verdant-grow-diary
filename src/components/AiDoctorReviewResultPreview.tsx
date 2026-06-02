/**
 * AiDoctorReviewResultPreview — presenter-only safe preview of an
 * AI Doctor review result.
 *
 * Hard constraints:
 *  - No model/API calls, no Supabase writes, no AI Doctor session
 *    creation, no alerts/action_queue/sensor_readings writes.
 *  - Validation/copy lives in the view-model and contract, never here.
 *  - Invalid input → empty state, no partial content.
 */
import { useMemo } from "react";
import { buildAiDoctorReviewResultView } from "@/lib/aiDoctorReviewResultViewModel";

export interface AiDoctorReviewResultPreviewProps {
  /** Unknown payload — validated by the contract. Null/undefined → empty. */
  result?: unknown;
  className?: string;
  testIdPrefix?: string;
}

export default function AiDoctorReviewResultPreview({
  result,
  className,
  testIdPrefix,
}: AiDoctorReviewResultPreviewProps) {
  const view = useMemo(
    () => buildAiDoctorReviewResultView(result ?? null),
    [result],
  );
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : s);

  if (!view.hasResult || view.result == null) {
    return (
      <section
        aria-labelledby={tid("ai-doctor-review-result-heading")}
        data-testid={tid("ai-doctor-review-result-preview")}
        data-state="empty"
        className={`glass rounded-2xl p-4 my-3 space-y-2 ${className ?? ""}`}
      >
        <h2
          id={tid("ai-doctor-review-result-heading")}
          className="text-base font-semibold tracking-tight"
        >
          Review result
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid={tid("ai-doctor-review-result-empty-state")}
        >
          {view.emptyState}
        </p>
      </section>
    );
  }

  const r = view.result;
  return (
    <section
      aria-labelledby={tid("ai-doctor-review-result-heading")}
      data-testid={tid("ai-doctor-review-result-preview")}
      data-state="result"
      className={`glass rounded-2xl p-4 my-3 space-y-3 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h2
          id={tid("ai-doctor-review-result-heading")}
          className="text-base font-semibold tracking-tight"
        >
          Review result
        </h2>
        <span
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200"
          data-testid={tid("ai-doctor-review-result-preview-label")}
        >
          {view.previewLabel}
        </span>
      </header>

      <p
        className="text-sm"
        data-testid={tid("ai-doctor-review-result-summary")}
      >
        {r.summary}
      </p>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span
          className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5"
          data-testid={tid("ai-doctor-review-result-confidence")}
        >
          {view.confidenceLabel}
        </span>
        <span
          className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5"
          data-testid={tid("ai-doctor-review-result-risk")}
        >
          {view.riskLabel}
        </span>
      </div>

      <div
        className="text-xs"
        data-testid={tid("ai-doctor-review-result-likely-issue")}
      >
        <span className="font-semibold">Likely issue: </span>
        <span className="text-muted-foreground">{r.likely_issue}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div data-testid={tid("ai-doctor-review-result-evidence")}>
          <h3 className="font-semibold mb-1">Evidence</h3>
          {r.evidence.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {r.evidence.map((e, i) => (
                <li key={`${i}-${e}`}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid={tid("ai-doctor-review-result-missing")}>
          <h3 className="font-semibold mb-1">Missing information</h3>
          {r.missing_information.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="list-disc pl-4 space-y-0.5">
              {r.missing_information.map((m, i) => (
                <li key={`${i}-${m}`}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {r.possible_causes.length > 0 ? (
        <div
          className="text-xs"
          data-testid={tid("ai-doctor-review-result-possible-causes")}
        >
          <h3 className="font-semibold mb-1">Possible causes</h3>
          <ul className="list-disc pl-4 space-y-0.5">
            {r.possible_causes.map((c, i) => (
              <li key={`${i}-${c}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="grid grid-cols-1 gap-1 text-xs">
        <div data-testid={tid("ai-doctor-review-result-immediate-action")}>
          <dt className="font-semibold inline">Immediate action: </dt>
          <dd className="inline text-muted-foreground">{r.immediate_action}</dd>
        </div>
        <div data-testid={tid("ai-doctor-review-result-what-not-to-do")}>
          <dt className="font-semibold inline">What not to do: </dt>
          <dd className="inline text-muted-foreground">{r.what_not_to_do}</dd>
        </div>
        <div data-testid={tid("ai-doctor-review-result-follow-up")}>
          <dt className="font-semibold inline">24-hour follow-up: </dt>
          <dd className="inline text-muted-foreground">
            {r.twenty_four_hour_follow_up}
          </dd>
        </div>
        <div data-testid={tid("ai-doctor-review-result-recovery-plan")}>
          <dt className="font-semibold inline">3-day recovery plan: </dt>
          <dd className="inline text-muted-foreground">
            {r.three_day_recovery_plan}
          </dd>
        </div>
      </dl>

      {r.action_queue_suggestion ? (
        <div
          className="rounded-md border border-border/40 bg-background/30 p-3 text-xs space-y-1"
          data-testid={tid("ai-doctor-review-result-suggestion")}
        >
          <p
            className="font-semibold"
            data-testid={tid("ai-doctor-review-result-suggestion-title")}
          >
            {r.action_queue_suggestion.title}
          </p>
          <p
            className="text-muted-foreground"
            data-testid={tid("ai-doctor-review-result-suggestion-rationale")}
          >
            {r.action_queue_suggestion.rationale}
          </p>
          <p
            className="text-amber-300"
            data-testid={tid("ai-doctor-review-result-suggestion-notice")}
          >
            {view.suggestionNotice}
          </p>
        </div>
      ) : null}
    </section>
  );
}
