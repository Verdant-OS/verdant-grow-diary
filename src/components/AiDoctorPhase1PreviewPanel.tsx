/**
 * AI Doctor Phase 1 Read-Only Preview Panel.
 *
 * Presenter-only. Renders a precomputed `AiDoctorPhase1ViewModel`.
 *
 * Hard rules (enforced by tests):
 *   - No Supabase, no model client, no Edge Function calls.
 *   - No writes, no alerts, no Action Queue mutations, no device control.
 *   - No approve / execute / run / create buttons.
 *   - Source-truth and overdiagnosis warnings are never hidden.
 *
 * The component performs only display branching on the provided view model.
 */
import * as React from "react";
import type { AiDoctorPhase1ViewModel } from "@/lib/aiDoctorPhase1ViewModel";

export type AiDoctorPhase1PreviewMode = "demo" | "manual" | "internal";

export interface AiDoctorPhase1PreviewPanelProps {
  viewModel: AiDoctorPhase1ViewModel;
  title?: string;
  mode?: AiDoctorPhase1PreviewMode;
}

const MODE_LABEL: Record<AiDoctorPhase1PreviewMode, string> = {
  demo: "Demo preview",
  manual: "Manual preview",
  internal: "Internal preview",
};

function Section({
  heading,
  children,
  testId,
}: {
  heading: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-md border border-border bg-card p-4 space-y-2"
    >
      <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
      {children}
    </section>
  );
}

function BulletList({
  items,
  emptyMessage,
  testId,
}: {
  items: readonly string[];
  emptyMessage: string;
  testId: string;
}) {
  if (!items || items.length === 0) {
    return (
      <p data-testid={`${testId}-empty`} className="text-xs text-muted-foreground italic">
        {emptyMessage}
      </p>
    );
  }
  return (
    <ul data-testid={testId} className="list-disc pl-5 text-sm text-foreground space-y-1">
      {items.map((item, i) => (
        <li key={`${testId}-${i}`}>{item}</li>
      ))}
    </ul>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground mr-2 mb-1">
      {children}
    </span>
  );
}

export function AiDoctorPhase1PreviewPanel({
  viewModel,
  title,
  mode = "internal",
}: AiDoctorPhase1PreviewPanelProps): JSX.Element {
  const {
    summaryCard,
    evidencePanel,
    missingInfoPanel,
    recommendationsPanel,
    actionQueuePanel,
    safetyPanel,
    debugMeta,
  } = viewModel;

  const modeLabel = MODE_LABEL[mode];

  return (
    <div
      data-testid="ai-doctor-phase1-preview-panel"
      className="space-y-4 text-foreground"
    >
      {/* Header banner — read-only / no model / no writes / no device control */}
      <header
        data-testid="ai-doctor-phase1-preview-header"
        className="rounded-md border border-border bg-muted/40 p-4 space-y-1"
      >
        <h2 className="text-base font-semibold">
          {title ?? "AI Doctor Phase 1 Preview"}
        </h2>
        <p className="text-xs text-muted-foreground">
          Read-only · No model calls · No database writes · No device control
        </p>
        <p data-testid="ai-doctor-phase1-preview-mode" className="text-xs text-muted-foreground">
          {modeLabel}
        </p>
      </header>

      {/* Summary card */}
      <Section heading={summaryCard.title} testId="ai-doctor-phase1-preview-summary">
        <div className="flex flex-wrap">
          {summaryCard.status_badges.map((b, i) => (
            <Badge key={`badge-${i}`}>{b}</Badge>
          ))}
        </div>
        <p className="text-sm">
          <span className="font-medium">Summary: </span>
          {summaryCard.summary}
        </p>
        <p className="text-sm">
          <span className="font-medium">Likely issue: </span>
          {summaryCard.likely_issue}
        </p>
        <p className="text-sm">
          <span className="font-medium">Risk level: </span>
          {summaryCard.risk_level}
        </p>
        <p className="text-sm">
          <span className="font-medium">{summaryCard.confidence_label}</span>
          <span className="text-muted-foreground"> (score {summaryCard.confidence_score})</span>
        </p>
        <p className="text-xs text-muted-foreground">{summaryCard.confidence_explanation}</p>
      </Section>

      {/* Evidence */}
      <Section heading="Evidence" testId="ai-doctor-phase1-preview-evidence">
        <p className="text-xs font-medium text-muted-foreground">Evidence items</p>
        <BulletList
          items={evidencePanel.evidence_items}
          emptyMessage="No evidence items supplied."
          testId="ai-doctor-phase1-preview-evidence-items"
        />
        <p className="text-xs font-medium text-muted-foreground">Context</p>
        <BulletList
          items={evidencePanel.context_items}
          emptyMessage="No context items supplied."
          testId="ai-doctor-phase1-preview-context-items"
        />
        <p className="text-xs font-medium text-muted-foreground">Source quality</p>
        <BulletList
          items={evidencePanel.source_quality_items}
          emptyMessage="No source quality items supplied."
          testId="ai-doctor-phase1-preview-source-quality"
        />
        <p className="text-xs font-medium text-muted-foreground">Limitations</p>
        <BulletList
          items={evidencePanel.limitations}
          emptyMessage="No limitations supplied."
          testId="ai-doctor-phase1-preview-limitations"
        />
      </Section>

      {/* Missing info */}
      <Section heading="Missing information" testId="ai-doctor-phase1-preview-missing-info">
        <p className="text-xs text-muted-foreground">
          Severity: <span data-testid="ai-doctor-phase1-preview-missing-severity">{missingInfoPanel.severity}</span>
        </p>
        <BulletList
          items={missingInfoPanel.items}
          emptyMessage="No missing information listed."
          testId="ai-doctor-phase1-preview-missing-items"
        />
      </Section>

      {/* Recommendations */}
      <Section heading="Recommendations" testId="ai-doctor-phase1-preview-recommendations">
        <p className="text-sm">
          <span className="font-medium">Immediate action: </span>
          {recommendationsPanel.immediate_action}
        </p>
        <p className="text-xs font-medium text-muted-foreground">What not to do</p>
        <BulletList
          items={recommendationsPanel.what_not_to_do}
          emptyMessage="No cautions supplied."
          testId="ai-doctor-phase1-preview-what-not-to-do"
        />
        <p className="text-sm">
          <span className="font-medium">24-hour follow-up: </span>
          {recommendationsPanel.twenty_four_hour_follow_up}
        </p>
        <p className="text-sm">
          <span className="font-medium">3-day recovery plan: </span>
          {recommendationsPanel.three_day_recovery_plan}
        </p>
        <p className="text-xs font-medium text-muted-foreground">Monitoring priorities</p>
        <BulletList
          items={recommendationsPanel.monitoring_priorities}
          emptyMessage="No monitoring priorities supplied."
          testId="ai-doctor-phase1-preview-monitoring"
        />
      </Section>

      {/* Advisory Action Queue */}
      {actionQueuePanel.should_show ? (
        <Section
          heading="Advisory Action Queue (read-only preview)"
          testId="ai-doctor-phase1-preview-action-queue"
        >
          <p className="text-sm font-medium">Suggested advisory action</p>
          <p className="text-sm">{actionQueuePanel.label}</p>
          <p className="text-sm text-muted-foreground">{actionQueuePanel.reason}</p>
          <p className="text-xs font-medium text-foreground">
            Grower approval is required.
          </p>
          {actionQueuePanel.disabled_reason ? (
            <p
              data-testid="ai-doctor-phase1-preview-action-disabled-reason"
              className="text-xs text-muted-foreground"
            >
              Disabled: {actionQueuePanel.disabled_reason}
            </p>
          ) : null}
        </Section>
      ) : null}

      {/* Safety */}
      <Section heading="Safety" testId="ai-doctor-phase1-preview-safety">
        <p
          data-testid="ai-doctor-phase1-preview-automation-warning"
          className="text-sm"
        >
          {safetyPanel.automation_warning}
        </p>
        {safetyPanel.overdiagnosis_warning ? (
          <p
            data-testid="ai-doctor-phase1-preview-overdiagnosis-warning"
            className="text-sm"
          >
            {safetyPanel.overdiagnosis_warning}
          </p>
        ) : null}
        {safetyPanel.source_truth_warning ? (
          <p
            data-testid="ai-doctor-phase1-preview-source-truth-warning"
            className="text-sm"
          >
            {safetyPanel.source_truth_warning}
          </p>
        ) : null}
        <p className="text-xs font-medium text-muted-foreground">Safety flags</p>
        <BulletList
          items={safetyPanel.safety_flags}
          emptyMessage="No safety flags supplied."
          testId="ai-doctor-phase1-preview-safety-flags"
        />
      </Section>

      {/* Debug / source meta */}
      <Section heading="Source / debug meta" testId="ai-doctor-phase1-preview-debug">
        <ul className="text-xs text-muted-foreground space-y-0.5">
          <li>has_live_data: {String(debugMeta.has_live_data)}</li>
          <li>has_manual_data: {String(debugMeta.has_manual_data)}</li>
          <li>has_demo_or_csv_only: {String(debugMeta.has_demo_or_csv_only)}</li>
          <li>has_stale_or_invalid: {String(debugMeta.has_stale_or_invalid)}</li>
          <li>live_count: {debugMeta.source_counts.live_count}</li>
          <li>manual_count: {debugMeta.source_counts.manual_count}</li>
          <li>csv_count: {debugMeta.source_counts.csv_count}</li>
          <li>demo_count: {debugMeta.source_counts.demo_count}</li>
          <li>stale_count: {debugMeta.source_counts.stale_count}</li>
          <li>invalid_count: {debugMeta.source_counts.invalid_count}</li>
          <li>raw_confidence_level: {debugMeta.raw_confidence_level}</li>
          <li>displayed_confidence_level: {debugMeta.displayed_confidence_level}</li>
          <li>generated_at: {debugMeta.generated_at}</li>
        </ul>
      </Section>
    </div>
  );
}

export default AiDoctorPhase1PreviewPanel;
