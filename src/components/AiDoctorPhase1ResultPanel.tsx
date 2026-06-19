/**
 * AI Doctor Phase 1 — Read-Only Result Panel.
 *
 * Presenter-only. Renders a precomputed `AiDoctorPhase1ResultViewModel`
 * along with the sensor-summary drilldown and review-gated action
 * suggestion. No save / attach / send / execute buttons. No Supabase,
 * no fetch, no model calls, no device control.
 */
import * as React from "react";
import { AiDoctorSensorSummaryDrilldown } from "@/components/AiDoctorSensorSummaryDrilldown";
import { AiDoctorActionSuggestionReviewGate } from "@/components/AiDoctorActionSuggestionReviewGate";
import {
  buildAiDoctorPhase1ResultViewModel,
  type AiDoctorPhase1ResultViewModel,
} from "@/lib/aiDoctorPhase1ResultViewModel";
import type {
  AiDoctorContextPayload,
  AiDoctorDiagnosisResult,
} from "@/lib/aiDoctorEnginePhase1Foundation";

export interface AiDoctorPhase1ResultPanelProps {
  context: AiDoctorContextPayload;
  result: AiDoctorDiagnosisResult;
}

function StringList(props: {
  items: readonly string[];
  testId: string;
  emptyLabel: string;
}) {
  if (props.items.length === 0) {
    return (
      <p data-testid={`${props.testId}-empty`} className="text-xs text-muted-foreground">
        {props.emptyLabel}
      </p>
    );
  }
  return (
    <ul data-testid={props.testId} className="list-disc space-y-1 pl-5 text-sm text-foreground">
      {props.items.map((item, idx) => (
        <li key={`${idx}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

export function AiDoctorPhase1ResultPanel(
  props: AiDoctorPhase1ResultPanelProps,
): JSX.Element {
  const vm: AiDoctorPhase1ResultViewModel =
    buildAiDoctorPhase1ResultViewModel({
      context: props.context,
      result: props.result,
    });

  return (
    <article
      data-testid="ai-doctor-phase1-result-panel"
      aria-label="AI Doctor Phase 1 result (read-only)"
      className="space-y-4 rounded-md border border-border bg-background p-4"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">AI Doctor — Result</h2>
        <p data-testid="ai-doctor-result-readonly-note" className="text-xs text-muted-foreground">
          Read-only. No diary, timeline, alert, or Action Queue write is performed by this view.
        </p>
      </header>

      <section className="space-y-1" aria-label="Summary">
        <p data-testid="ai-doctor-result-summary" className="text-sm text-foreground">
          {vm.summary}
        </p>
        <p data-testid="ai-doctor-result-likely-issue" className="text-sm text-muted-foreground">
          Likely issue: {vm.likely_issue}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span
            data-testid="ai-doctor-result-confidence"
            data-confidence={vm.confidence}
            className="rounded border border-border bg-muted px-2 py-1 text-muted-foreground"
          >
            {vm.confidence_copy}
          </span>
          <span
            data-testid="ai-doctor-result-risk"
            data-risk={vm.risk_level}
            className="rounded border border-border bg-muted px-2 py-1 text-muted-foreground"
          >
            {vm.risk_copy}
          </span>
        </div>
        {vm.autoflower_caution && (
          <p
            data-testid="ai-doctor-result-autoflower-caution"
            className="text-xs text-muted-foreground"
          >
            Autoflower caution: avoid heavy defoliation, transplant, or high-stress recovery tactics.
          </p>
        )}
      </section>

      <section aria-label="Evidence">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Evidence</h3>
        <StringList
          items={vm.evidence}
          testId="ai-doctor-result-evidence"
          emptyLabel="No evidence collected."
        />
      </section>

      <section aria-label="Missing information">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Missing information</h3>
        <StringList
          items={vm.missing_information}
          testId="ai-doctor-result-missing-information"
          emptyLabel="No missing context recorded."
        />
      </section>

      <section aria-label="Possible causes">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Possible causes</h3>
        <StringList
          items={vm.possible_causes}
          testId="ai-doctor-result-possible-causes"
          emptyLabel="No possible causes recorded."
        />
      </section>

      <section aria-label="Immediate action">
        <h3 className="mb-1 text-sm font-semibold text-foreground">Immediate action</h3>
        <p data-testid="ai-doctor-result-immediate-action" className="text-sm text-foreground">
          {vm.immediate_action}
        </p>
      </section>

      <section aria-label="What not to do">
        <h3 className="mb-1 text-sm font-semibold text-foreground">What not to do</h3>
        <StringList
          items={vm.what_not_to_do}
          testId="ai-doctor-result-what-not-to-do"
          emptyLabel="No avoid-actions recorded."
        />
      </section>

      <section aria-label="24-hour follow-up">
        <h3 className="mb-1 text-sm font-semibold text-foreground">24-hour follow-up</h3>
        <p data-testid="ai-doctor-result-follow-up-24h" className="text-sm text-foreground">
          {vm.follow_up_24h}
        </p>
      </section>

      <section aria-label="3-day recovery plan">
        <h3 className="mb-1 text-sm font-semibold text-foreground">3-day recovery plan</h3>
        <p data-testid="ai-doctor-result-recovery-plan-3-day" className="text-sm text-foreground">
          {vm.recovery_plan_3_day}
        </p>
      </section>

      <AiDoctorSensorSummaryDrilldown context={props.context} />

      <AiDoctorActionSuggestionReviewGate suggestion={vm.action_queue_suggestion} />
    </article>
  );
}
