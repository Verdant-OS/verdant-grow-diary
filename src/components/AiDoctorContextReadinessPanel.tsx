/**
 * AiDoctorContextReadinessPanel — read-only presenter for the AI Doctor
 * Phase 1 readiness check.
 *
 * Hard constraints:
 *  - No model/API calls. No Supabase writes. No alerts. No Action Queue writes.
 *  - Uses the deterministic Phase 1 engine + view-model only.
 *  - Demo / stale / invalid data is shown honestly — never as live.
 *  - Preview output is clearly labeled "Preview only — not saved."
 */
import { useMemo } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Database,
  Beaker,
} from "lucide-react";
import {
  buildAiDoctorReadinessView,
  type AiDoctorReadinessState,
} from "@/lib/aiDoctorReadinessViewModel";
import type { AiDoctorContext } from "@/lib/aiDoctorEngine";
import AiDoctorImportedHistoryDisclosurePanel from "@/components/AiDoctorImportedHistoryDisclosurePanel";
import {
  ACTION_SUGGESTION_INVALID_FIELD_LABELS,
  ACTION_SUGGESTION_MISSING_FIELD_LABELS,
  ACTION_SUGGESTION_PREVIEW_LABEL,
  ACTION_SUGGESTION_PREVIEW_STATUS_LABELS,
  deriveActionSuggestionPreviewInput,
  isUnsafePreviewText,
  previewActionSuggestion,
} from "@/lib/aiDoctorActionSuggestionPreviewRules";
import {
  deriveCurrentSnapshotFromAiDoctorContext,
  evaluateManualSensorSnapshotQuality,
} from "@/lib/manualSensorSnapshotQualityRules";
import ManualSensorSnapshotQualityBadge from "@/components/ManualSensorSnapshotQualityBadge";

export interface AiDoctorContextReadinessPanelProps {
  context: AiDoctorContext;
  openAlertsCount?: number;
  className?: string;
}

const STATE_STYLES: Record<
  AiDoctorReadinessState,
  { badge: string; icon: JSX.Element }
> = {
  ready: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  },
  needs_more_context: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    icon: <Info className="h-4 w-4" aria-hidden="true" />,
  },
  sensor_missing: {
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    icon: <Database className="h-4 w-4" aria-hidden="true" />,
  },
  telemetry_limited: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  },
  demo_only: {
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    icon: <Beaker className="h-4 w-4" aria-hidden="true" />,
  },
};

export default function AiDoctorContextReadinessPanel({
  context,
  openAlertsCount,
  className,
}: AiDoctorContextReadinessPanelProps) {
  const view = useMemo(
    () => buildAiDoctorReadinessView({ context, openAlertsCount }),
    [context, openAlertsCount],
  );
  const style = STATE_STYLES[view.state];

  const actionPreview = useMemo(
    () => previewActionSuggestion(deriveActionSuggestionPreviewInput(view)),
    [view],
  );

  const currentSnapshotQuality = useMemo(
    () =>
      evaluateManualSensorSnapshotQuality(
        deriveCurrentSnapshotFromAiDoctorContext(context),
      ),
    [context],
  );

  return (
    <section
      aria-labelledby="ai-doctor-context-readiness-panel-heading"
      data-testid="ai-doctor-context-readiness-panel"
      data-readiness-state={view.state}
      className={`glass rounded-2xl p-4 space-y-3 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2
            id="ai-doctor-context-readiness-panel-heading"
            className="text-base font-semibold tracking-tight"
          >
            AI Doctor Context Readiness
          </h2>
          <p className="text-xs text-muted-foreground">
            Cautious, read-only check. No diagnoses are saved.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${style.badge}`}
          data-testid="ai-doctor-context-readiness-panel-state-badge"
        >
          {style.icon}
          {view.stateLabel}
        </span>
      </header>

      <dl
        className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
        data-testid="ai-doctor-context-readiness-panel-counts"
      >
        <div className="rounded-md border border-border/40 p-2">
          <dt className="text-muted-foreground">Stage</dt>
          <dd
            className="font-medium"
            data-testid="ai-doctor-context-readiness-panel-stage"
          >
            {view.plantIdentity.stage ?? "—"}
          </dd>
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <dt className="text-muted-foreground">Recent logs</dt>
          <dd
            className="font-medium"
            data-testid="ai-doctor-context-readiness-panel-count-recent-logs"
          >
            {view.counts.recentLogs}
          </dd>
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <dt className="text-muted-foreground">Sensor readings (7d)</dt>
          <dd
            className="font-medium"
            data-testid="ai-doctor-context-readiness-panel-count-sensor-readings"
          >
            {view.counts.recentSensorReadings}
          </dd>
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <dt className="text-muted-foreground">Open alerts</dt>
          <dd
            className="font-medium"
            data-testid="ai-doctor-context-readiness-panel-count-open-alerts"
          >
            {view.counts.openAlerts}
          </dd>
        </div>
      </dl>

      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-1">
          Sensor source labels
        </h3>
        {view.sourceBadges.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-context-readiness-panel-no-sources"
          >
            No sensor data classified in the last 7 days.
          </p>
        ) : (
          <ul
            className="flex flex-wrap gap-1.5"
            data-testid="ai-doctor-context-readiness-panel-sources"
          >
            {view.sourceBadges.map((b) => (
              <li
                key={b.source}
                data-testid={`ai-doctor-context-readiness-panel-source-${b.source}`}
                data-source={b.source}
                data-trustworthy={b.isTrustworthy ? "true" : "false"}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                  b.isTrustworthy
                    ? "border-emerald-500/30 text-emerald-200"
                    : "border-amber-500/30 text-amber-200"
                }`}
              >
                {b.label} · {b.sampleCount}
              </li>
            ))}
          </ul>
        )}
      </div>

      {view.limitations.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">
            Limitations
          </h3>
          <ul
            className="list-disc pl-4 space-y-0.5 text-xs"
            data-testid="ai-doctor-context-readiness-panel-limitations"
          >
            {view.limitations.map((l) => (
              <li
                key={l.code}
                data-testid={`ai-doctor-context-readiness-panel-limitation-${l.code}`}
              >
                {l.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view.missingInformation.length > 0 ? (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">
            Missing information
          </h3>
          <ul
            className="list-disc pl-4 space-y-0.5 text-xs"
            data-testid="ai-doctor-context-readiness-panel-missing"
          >
            {view.missingInformation.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AiDoctorImportedHistoryDisclosurePanel context={context} />

      <div
        className="rounded-lg border border-border/50 bg-background/30 p-3 space-y-2"
        data-testid="ai-doctor-context-readiness-panel-preview"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Preview AI Doctor output</h3>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            data-testid="ai-doctor-context-readiness-panel-preview-notice"
          >
            {view.preview.notice}
          </span>
        </div>
        <p className="text-xs">{view.preview.summary}</p>
        <p className="text-xs">
          <span className="text-muted-foreground">Immediate action: </span>
          {view.preview.immediateAction}
        </p>
        <p
          className="text-xs"
          data-testid="ai-doctor-context-readiness-panel-preview-confidence"
        >
          <span className="text-muted-foreground">Confidence: </span>
          {view.preview.confidenceBand} ({view.preview.confidence.toFixed(2)})
        </p>
      </div>

      <section
        aria-labelledby="ai-doctor-action-suggestion-preview-heading"
        aria-describedby="ai-doctor-action-suggestion-preview-summary ai-doctor-action-suggestion-preview-sr-status"
        className="rounded-lg border border-border/50 bg-background/30 p-3 space-y-2"
        data-testid="ai-doctor-action-suggestion-preview"
        data-status={actionPreview.status}
        data-eligible={actionPreview.eligible ? "true" : "false"}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3
            id="ai-doctor-action-suggestion-preview-heading"
            className="text-sm font-semibold"
          >
            {ACTION_SUGGESTION_PREVIEW_LABEL}
          </h3>
          <span
            className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            data-testid="ai-doctor-action-suggestion-preview-status"
          >
            {ACTION_SUGGESTION_PREVIEW_STATUS_LABELS[actionPreview.status]}
          </span>
        </div>

        {/* Screen-reader status: combines eligibility + safety posture so SR users hear it in one pass. */}
        <p
          id="ai-doctor-action-suggestion-preview-sr-status"
          className="sr-only"
          role="status"
          data-testid="ai-doctor-action-suggestion-preview-sr-status"
        >
          {ACTION_SUGGESTION_PREVIEW_LABEL}:{" "}
          {ACTION_SUGGESTION_PREVIEW_STATUS_LABELS[actionPreview.status]}.
          Approval required. No device control. Preview only — no Action
          Queue item is created.
        </p>

        {!isUnsafePreviewText(actionPreview.summary) ? (
          <p
            id="ai-doctor-action-suggestion-preview-summary"
            className="text-xs"
            data-testid="ai-doctor-action-suggestion-preview-summary"
          >
            {actionPreview.summary}
          </p>
        ) : null}

        {actionPreview.reasons.length > 0 ? (
          <ul
            className="list-disc pl-4 space-y-0.5 text-xs"
            data-testid="ai-doctor-action-suggestion-preview-reasons"
          >
            {actionPreview.reasons
              .filter((r) => !isUnsafePreviewText(r))
              .map((r) => (
                <li key={r}>{r}</li>
              ))}
          </ul>
        ) : null}

        {actionPreview.missingFields.length > 0 ? (
          <div data-testid="ai-doctor-action-suggestion-preview-missing">
            <h4 className="text-xs font-medium text-muted-foreground mb-1">
              Missing context
            </h4>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {actionPreview.missingFields.map((field) => (
                <li
                  key={field}
                  data-field={field}
                  data-testid={`ai-doctor-action-suggestion-preview-missing-${field}`}
                  className="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200"
                >
                  {ACTION_SUGGESTION_MISSING_FIELD_LABELS[field]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {actionPreview.invalidFields.length > 0 ? (
          <div data-testid="ai-doctor-action-suggestion-preview-invalid">
            <h4 className="text-xs font-medium text-muted-foreground mb-1">
              Needs review
            </h4>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {actionPreview.invalidFields.map((field) => (
                <li
                  key={field}
                  data-field={field}
                  data-testid={`ai-doctor-action-suggestion-preview-invalid-${field}`}
                  className="inline-flex items-center rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-rose-200"
                >
                  {ACTION_SUGGESTION_INVALID_FIELD_LABELS[field]}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {actionPreview.suggestedActionPreview &&
        !isUnsafePreviewText(actionPreview.suggestedActionPreview) ? (
          <p
            className="text-xs"
            data-testid="ai-doctor-action-suggestion-preview-action"
          >
            <span className="text-muted-foreground">Cautious next step: </span>
            {actionPreview.suggestedActionPreview}
          </p>
        ) : null}

        <ul
          className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-wide"
          data-testid="ai-doctor-action-suggestion-preview-safety-notes"
          aria-label="Action Queue suggestion preview safety posture"
        >
          {actionPreview.safetyNotes
            .filter((note) => !isUnsafePreviewText(note))
            .map((note) => (
              <li
                key={note}
                className="inline-flex items-center rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground"
              >
                {note}
              </li>
            ))}
        </ul>
      </section>
    </section>
  );
}
