/**
 * AiDoctorDiagnosisPanel — presenter-only display for an AI Doctor 2.0
 * DiagnosisResult, routed through `adaptDiagnosisResultToViewModel`.
 *
 * Hard constraints:
 *  - No model/API calls, no Supabase writes, no alerts, no Action Queue,
 *    no device control, no automation, no scheduler.
 *  - Final user-facing confidence ALWAYS sourced from the automated
 *    ConfidenceResult (never the raw LLM self-report).
 *  - Raw model confidence appears only in the audit/debug subsection.
 *  - Missing / malformed input must not crash — empty state is preserved.
 */
import { useMemo, useState, useCallback } from "react";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import {
  adaptDiagnosisResultToViewModel,
  type DiagnosisDisplayConfidence,
} from "@/lib/aiDoctorDiagnosisViewModel";
import type { DiagnosisEvidenceAlignmentVM } from "@/lib/aiDoctorDiagnosisEvidenceAlignmentRules";
import {
  citeRecommendations,
  type CitationContext,
  type EvidenceCitation,
} from "@/lib/aiDoctorEvidenceCitationRules";
import {
  buildAiDoctorReportPdfBytes,
  downloadAiDoctorReportPdf,
  type AiDoctorReportInput,
} from "@/lib/aiDoctorReportRules";

export const AI_DOCTOR_DIAGNOSIS_EMPTY_COPY =
  "No AI Doctor 2.0 diagnosis available yet.";
export const AI_DOCTOR_DIAGNOSIS_LOADING_COPY =
  "Preparing AI Doctor 2.0 diagnosis…";
export const AI_DOCTOR_DIAGNOSIS_FALLBACK_CONFIDENCE_COPY =
  "Automated confidence is using a conservative fallback.";
export const AI_DOCTOR_DIAGNOSIS_REVIEW_FIRST_COPY =
  "Review these signals before taking any action.";

export interface AiDoctorDiagnosisPanelProps {
  diagnosis?: DiagnosisResult | null;
  isLoading?: boolean;
  className?: string;
  testIdPrefix?: string;
  evidenceAlignment?: DiagnosisEvidenceAlignmentVM | null;
  /** Optional citation context for inline recommendation citations. */
  citationContext?: CitationContext | null;
  /**
   * Optional partial report input (without recommendations — those are
   * derived from the diagnosis + citationContext). When provided alongside
   * a diagnosis a "Download report" action is rendered.
   */
  reportInput?: Omit<AiDoctorReportInput, "recommendations"> | null;
}

function isFallbackConfidence(c: DiagnosisDisplayConfidence): boolean {
  return c.level === "Low" && c.score === 40 && /conservative default/i.test(c.explanation);
}

export default function AiDoctorDiagnosisPanel({
  diagnosis,
  isLoading,
  className,
  testIdPrefix,
  evidenceAlignment,
  citationContext,
  reportInput,
}: AiDoctorDiagnosisPanelProps) {
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : s);
  const hasDiagnosis = diagnosis != null;
  const view = useMemo(
    () => (hasDiagnosis ? adaptDiagnosisResultToViewModel(diagnosis) : null),
    [hasDiagnosis, diagnosis],
  );

  const citedRecs = useMemo(() => {
    if (!view || !citationContext) return null;
    return citeRecommendations(view.recommended_actions, citationContext);
  }, [view, citationContext]);

  const postureDefaultsOpen =
    !evidenceAlignment ||
    evidenceAlignment.posture === "weak_context" ||
    evidenceAlignment.posture === "insufficient_context";
  const [basisOpen, setBasisOpen] = useState<boolean>(postureDefaultsOpen);

  const handleDownloadReport = useCallback(() => {
    if (!view || !reportInput) return;
    const recs =
      citedRecs ??
      view.recommended_actions.map((r) => ({
        text: r,
        citation: {
          label: "Needs more evidence",
          kind: "none" as const,
          healthy: false,
          targetId: "evidence-missing-general",
          ariaLabel: "No direct evidence supports this recommendation yet.",
        } as EvidenceCitation,
      }));
    const bytes = buildAiDoctorReportPdfBytes({
      ...reportInput,
      summary: reportInput.summary || view.summary,
      recommendations: recs,
    });
    downloadAiDoctorReportPdf(bytes, "ai-doctor-report.pdf");
  }, [view, citedRecs, reportInput]);
  const tid = (s: string) => (testIdPrefix ? `${testIdPrefix}-${s}` : s);
  const hasDiagnosis = diagnosis != null;
  const view = useMemo(
    () => (hasDiagnosis ? adaptDiagnosisResultToViewModel(diagnosis) : null),
    [hasDiagnosis, diagnosis],
  );

  if (!view) {
    return (
      <section
        aria-labelledby={tid("ai-doctor-diagnosis-heading")}
        data-testid={tid("ai-doctor-diagnosis-panel")}
        data-state={isLoading ? "loading" : "empty"}
        className={`glass rounded-2xl p-4 my-3 space-y-2 ${className ?? ""}`}
      >
        <h2
          id={tid("ai-doctor-diagnosis-heading")}
          className="text-base font-semibold tracking-tight"
        >
          AI Doctor diagnosis
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid={
            isLoading
              ? tid("ai-doctor-diagnosis-loading")
              : tid("ai-doctor-diagnosis-empty")
          }
          role={isLoading ? "status" : undefined}
          aria-live={isLoading ? "polite" : undefined}
        >
          {isLoading
            ? AI_DOCTOR_DIAGNOSIS_LOADING_COPY
            : AI_DOCTOR_DIAGNOSIS_EMPTY_COPY}
        </p>
      </section>
    );
  }

  const fallback = isFallbackConfidence(view.confidence);

  return (
    <section
      aria-labelledby={tid("ai-doctor-diagnosis-heading")}
      data-testid={tid("ai-doctor-diagnosis-panel")}
      data-state="result"
      data-confidence-level={view.confidence.level}
      data-confidence-fallback={fallback ? "true" : "false"}
      className={`glass rounded-2xl p-4 my-3 space-y-3 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <h2
          id={tid("ai-doctor-diagnosis-heading")}
          className="text-base font-semibold tracking-tight"
        >
          AI Doctor diagnosis
        </h2>
        <span
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium"
          data-testid={tid("ai-doctor-diagnosis-confidence")}
          data-confidence-level={view.confidence.level}
          data-confidence-score={view.confidence.score}
        >
          Confidence: {view.confidence.level} ({view.confidence.score})
        </span>
      </header>

      <p
        className="text-sm"
        data-testid={tid("ai-doctor-diagnosis-summary")}
      >
        {view.summary}
      </p>

      <p
        className="text-xs text-muted-foreground"
        data-testid={tid("ai-doctor-diagnosis-confidence-explanation")}
      >
        {view.confidence.explanation}
      </p>

      {fallback ? (
        <p
          className="text-xs text-amber-200"
          data-testid={tid("ai-doctor-diagnosis-confidence-fallback")}
        >
          {AI_DOCTOR_DIAGNOSIS_FALLBACK_CONFIDENCE_COPY}
        </p>
      ) : null}

      {view.confidence.conflicts.length > 0 ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1"
          data-testid={tid("ai-doctor-diagnosis-conflicts")}
        >
          <p className="font-semibold text-amber-200">
            Conflicts detected
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            {view.confidence.conflicts.map((c, i) => (
              <li
                key={`${i}-${c}`}
                data-testid={tid(`ai-doctor-diagnosis-conflict-${i}`)}
                data-severity="review"
              >
                <span className="text-muted-foreground">{c}</span>
                <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-300">
                  · review first
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            {AI_DOCTOR_DIAGNOSIS_REVIEW_FIRST_COPY}
          </p>
        </div>
      ) : null}

      {evidenceAlignment ? (
        <section
          className="rounded-md border border-border/60 bg-background/30 p-3 text-xs space-y-2"
          data-testid={tid("ai-doctor-diagnosis-evidence-alignment")}
          data-posture={evidenceAlignment.posture}
          aria-label="Evidence basis"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xs font-semibold">Evidence basis</h3>
            <span
              className="inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium"
              data-testid={tid("ai-doctor-diagnosis-posture-label")}
              data-posture={evidenceAlignment.posture}
            >
              {evidenceAlignment.postureLabel}
            </span>
          </div>
          <p
            className="text-[11px] text-muted-foreground"
            data-testid={tid("ai-doctor-diagnosis-posture-copy")}
          >
            {evidenceAlignment.postureCopy}
          </p>
          {evidenceAlignment.basisCopy.length > 0 ? (
            <ul
              className="list-disc pl-4 space-y-0.5"
              data-testid={tid("ai-doctor-diagnosis-basis-copy")}
            >
              {evidenceAlignment.basisCopy.map((b, i) => (
                <li key={`${i}-${b}`} className="text-[11px]">
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
          {evidenceAlignment.guardrailWarning ? (
            <p
              className="text-[11px] text-amber-300"
              data-testid={tid("ai-doctor-diagnosis-guardrail-warning")}
              role="note"
            >
              {evidenceAlignment.guardrailWarning}
            </p>
          ) : null}
          {evidenceAlignment.moreDataReminder ? (
            <p
              className="text-[11px] text-amber-200"
              data-testid={tid("ai-doctor-diagnosis-more-data-reminder")}
            >
              {evidenceAlignment.moreDataReminder}{" "}
              <a
                href="#ai-doctor-evidence-panel"
                className="underline"
                aria-label="Jump to Evidence used panel"
              >
                See Evidence used.
              </a>
            </p>
          ) : null}
        </section>
      ) : null}



      <Section
        title="Key observations"
        items={view.key_observations}
        testId={tid("ai-doctor-diagnosis-key-observations")}
      />
      <Section
        title="Contributing factors"
        items={view.contributing_factors}
        testId={tid("ai-doctor-diagnosis-contributing-factors")}
      />
      <Section
        title="Recommended actions"
        items={view.recommended_actions}
        testId={tid("ai-doctor-diagnosis-recommended-actions")}
      />
      <Section
        title="What not to do"
        items={view.what_not_to_do}
        testId={tid("ai-doctor-diagnosis-what-not-to-do")}
      />
      <Section
        title="Monitoring priorities"
        items={view.monitoring_priorities}
        testId={tid("ai-doctor-diagnosis-monitoring-priorities")}
      />
      <Section
        title="Questions for grower"
        items={view.questions_for_grower}
        testId={tid("ai-doctor-diagnosis-questions-for-grower")}
      />

      <details
        className="text-[11px] text-muted-foreground"
        data-testid={tid("ai-doctor-diagnosis-audit")}
      >
        <summary className="cursor-pointer">Audit / debug</summary>
        <p
          className="mt-1"
          data-testid={tid("ai-doctor-diagnosis-audit-raw-model-confidence")}
          data-raw-model-confidence={view.audit.raw_model_confidence_level}
        >
          Raw model confidence (not used as final):{" "}
          {view.audit.raw_model_confidence_level}
        </p>
        {view.audit.automated_downgraded_model ? (
          <p
            className="mt-0.5"
            data-testid={tid("ai-doctor-diagnosis-audit-downgrade")}
          >
            Automated layer downgraded the raw model confidence.
          </p>
        ) : null}
      </details>
    </section>
  );
}

function Section({
  title,
  items,
  testId,
}: {
  title: string;
  items: readonly string[];
  testId: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="text-xs" data-testid={testId}>
      <h3 className="font-semibold mb-1">{title}</h3>
      <ul className="list-disc pl-4 space-y-0.5">
        {items.map((it, i) => (
          <li key={`${i}-${it}`}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
