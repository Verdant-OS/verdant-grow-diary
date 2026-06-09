/**
 * AI Doctor Phase 1 Preview — internal static page.
 *
 * Renders the read-only AiDoctorPhase1PreviewPanel against a precomputed
 * library of static view models (see aiDoctorPhase1PreviewFixtures).
 *
 * Does NOT call Supabase, models, Edge Functions, or any external APIs.
 * Does NOT write to alerts, Action Queue, or any database table.
 * Does NOT trigger automation or device control.
 *
 * Case selection is a native <select> (no buttons) so this page remains
 * presenter-only with zero action surface.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { AiDoctorPhase1PreviewPanel } from "@/components/AiDoctorPhase1PreviewPanel";
import {
  AI_DOCTOR_PHASE1_PREVIEW_CASES,
  AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID,
  getAiDoctorPhase1PreviewCase,
} from "@/lib/aiDoctorPhase1PreviewFixtures";

export default function AiDoctorPhase1Preview(): JSX.Element {
  const [selectedId, setSelectedId] = React.useState<string>(
    AI_DOCTOR_PHASE1_PREVIEW_DEFAULT_CASE_ID,
  );
  const current = getAiDoctorPhase1PreviewCase(selectedId);

  return (
    <div className="mx-auto max-w-3xl p-4 space-y-6">
      <div className="rounded-md border border-border bg-muted/30 p-4 space-y-2">
        <h1 className="text-lg font-semibold">Internal preview</h1>
        <p className="text-sm text-muted-foreground">
          Static demo data · No model calls · No database writes · No device
          control
        </p>
        <p className="text-xs text-muted-foreground">
          This preview renders a precomputed Phase 1 view model. It does not
          run diagnosis, does not score confidence, does not write alerts, and
          does not create Action Queue items.
        </p>
      </div>

      <div
        data-testid="ai-doctor-confidence-audit-link-card"
        className="rounded-md border border-border bg-card p-4 space-y-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h2
            data-testid="ai-doctor-confidence-audit-link-title"
            className="text-sm font-semibold"
          >
            View confidence audit
          </h2>
          <span className="rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            Internal
          </span>
          <span className="rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            Static reference
          </span>
          <span className="rounded border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
            Read-only
          </span>
        </div>
        <p
          data-testid="ai-doctor-confidence-audit-link-description"
          className="text-xs text-muted-foreground"
        >
          Review the hard caps, source-quality rules, and safety flags that
          keep weak AI Doctor context from becoming overconfident.
        </p>
        <Link
          to="/internal/ai-doctor-confidence-audit"
          data-testid="ai-doctor-confidence-audit-link"
          className="inline-block text-sm text-primary underline-offset-2 hover:underline"
        >
          Open AI Doctor Confidence Audit
        </Link>
      </div>

      <div
        data-testid="ai-doctor-phase1-preview-case-selector"
        className="rounded-md border border-border bg-card p-4 space-y-2"
      >
        <label
          htmlFor="ai-doctor-phase1-preview-case-select"
          className="text-sm font-medium text-foreground"
        >
          Preview case
        </label>
        <select
          id="ai-doctor-phase1-preview-case-select"
          data-testid="ai-doctor-phase1-preview-case-select"
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {AI_DOCTOR_PHASE1_PREVIEW_CASES.map((c) => (
            <option
              key={c.id}
              value={c.id}
              data-testid={`ai-doctor-phase1-preview-case-option-${c.id}`}
            >
              {c.label}
            </option>
          ))}
        </select>
        <p
          data-testid="ai-doctor-phase1-preview-case-description"
          className="text-xs text-muted-foreground"
        >
          {current.description}
        </p>
        <p
          data-testid="ai-doctor-phase1-preview-case-source-mode"
          className="text-xs text-muted-foreground"
        >
          Source mode: {current.sourceMode}
        </p>
      </div>

      <AiDoctorPhase1PreviewPanel
        viewModel={current.viewModel}
        title={current.viewModel.summaryCard.title}
        mode="internal"
      />
    </div>
  );
}
