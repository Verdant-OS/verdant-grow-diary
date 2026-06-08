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
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { DiagnosisResult } from "@/lib/aiDoctorEngine";
import {
  adaptDiagnosisResultToViewModel,
  type DiagnosisDisplayConfidence,
} from "@/lib/aiDoctorDiagnosisViewModel";
import type { DiagnosisEvidenceAlignmentVM } from "@/lib/aiDoctorDiagnosisEvidenceAlignmentRules";
import {
  citeRecommendations,
  buildCitationDetail,
  type CitationContext,
  type EvidenceCitation,
  type CitationDetail,
} from "@/lib/aiDoctorEvidenceCitationRules";
import {
  buildAiDoctorReportPdfBytes,
  downloadAiDoctorReportPdf,
  buildPerMetricStatusTable,
  type AiDoctorReportInput,
  type PerMetricReportRow,
} from "@/lib/aiDoctorReportRules";
import {
  buildAiDoctorEvidenceCsv,
  downloadAiDoctorEvidenceCsv,
} from "@/lib/aiDoctorEvidenceCsvExportRules";
import { navigateToEvidenceTarget } from "@/lib/aiDoctorEvidenceNavigationRules";
import {
  downloadAiDoctorReportPackage,
  buildPackageFilenames,
} from "@/lib/aiDoctorReportPackageRules";
import {
  filterEvidenceSearchItems,
  EVIDENCE_SEARCH_EMPTY_COPY,
  EVIDENCE_SEARCH_INPUT_LABEL,
  type EvidenceSearchItem,
} from "@/lib/aiDoctorEvidenceSearchRules";

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

  const [activeCitation, setActiveCitation] = useState<EvidenceCitation | null>(
    null,
  );
  const citationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handleOpenCitation = useCallback(
    (c: EvidenceCitation, trigger: HTMLButtonElement | null) => {
      citationTriggerRef.current = trigger;
      setActiveCitation(c);
    },
    [],
  );
  const handleCloseCitation = useCallback(() => {
    setActiveCitation(null);
    // Return focus to the trigger on next tick (after dialog unmounts).
    queueMicrotask(() => {
      try {
        citationTriggerRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
  }, []);
  const handleJumpToEvidence = useCallback(() => {
    if (activeCitation) {
      navigateToEvidenceTarget(activeCitation.targetId);
    }
    setActiveCitation(null);
  }, [activeCitation]);

  const buildRecsForReport = useCallback(() => {
    if (!view) return [];
    return (
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
      }))
    );
  }, [view, citedRecs]);

  const handleDownloadReport = useCallback(() => {
    if (!view || !reportInput) return;
    const bytes = buildAiDoctorReportPdfBytes({
      ...reportInput,
      summary: reportInput.summary || view.summary,
      recommendations: buildRecsForReport(),
    });
    downloadAiDoctorReportPdf(bytes, "ai-doctor-report.pdf");
  }, [view, reportInput, buildRecsForReport]);

  const handleDownloadCsv = useCallback(() => {
    if (!view || !reportInput) return;
    const csv = buildAiDoctorEvidenceCsv({
      ...reportInput,
      summary: reportInput.summary || view.summary,
      recommendations: buildRecsForReport(),
    });
    downloadAiDoctorEvidenceCsv(csv);
  }, [view, reportInput, buildRecsForReport]);

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
          aria-labelledby={tid("ai-doctor-diagnosis-evidence-heading")}
          role="region"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id={tid("ai-doctor-diagnosis-evidence-heading")}
              className="text-xs font-semibold"
            >
              Evidence basis
            </h3>
            <span
              className="inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium"
              data-testid={tid("ai-doctor-diagnosis-posture-label")}
              data-posture={evidenceAlignment.posture}
              aria-label={`Recommendation posture: ${evidenceAlignment.postureLabel}`}
            >
              {evidenceAlignment.postureLabel}
            </span>
            <button
              type="button"
              onClick={() => setBasisOpen((v) => !v)}
              aria-expanded={basisOpen}
              aria-controls={tid("ai-doctor-diagnosis-evidence-body")}
              data-testid={tid("ai-doctor-diagnosis-evidence-toggle")}
              className="ml-auto inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            >
              {basisOpen ? "Hide details" : "Show details"}
            </button>
          </div>
          <p
            className="text-[11px] text-muted-foreground"
            data-testid={tid("ai-doctor-diagnosis-posture-copy")}
          >
            {evidenceAlignment.postureCopy}
          </p>
          {!basisOpen && evidenceAlignment.moreDataReminder ? (
            <p
              className="text-[11px] text-amber-200"
              data-testid={tid("ai-doctor-diagnosis-more-data-summary")}
            >
              {evidenceAlignment.moreDataReminder}
            </p>
          ) : null}
          <div
            id={tid("ai-doctor-diagnosis-evidence-body")}
            hidden={!basisOpen}
            data-state={basisOpen ? "open" : "collapsed"}
            className="space-y-2"
          >
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
          </div>
        </section>
      ) : null}

      {reportInput ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleDownloadReport}
            data-testid={tid("ai-doctor-diagnosis-download-report")}
            className="inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            aria-label="Download AI Doctor Report as PDF"
          >
            Download AI Doctor Report
          </button>
          <button
            type="button"
            onClick={handleDownloadCsv}
            data-testid={tid("ai-doctor-diagnosis-download-csv")}
            className="inline-flex items-center rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
            aria-label="Download AI Doctor Evidence CSV"
          >
            Download Evidence CSV
          </button>
        </div>
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
      {citedRecs ? (
        <CitedSection
          title="Recommended actions"
          items={citedRecs}
          testId={tid("ai-doctor-diagnosis-recommended-actions")}
          onOpenCitation={handleOpenCitation}
        />
      ) : (
        <Section
          title="Recommended actions"
          items={view.recommended_actions}
          testId={tid("ai-doctor-diagnosis-recommended-actions")}
        />
      )}
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

      {activeCitation && citationContext ? (
        <CitationDetailModal
          citation={activeCitation}
          ctx={citationContext}
          onClose={handleCloseCitation}
          onJump={handleJumpToEvidence}
          testId={tid("ai-doctor-diagnosis-citation-modal")}
        />
      ) : null}
    </section>
  );
}

function CitationDetailModal({
  citation,
  ctx,
  onClose,
  onJump,
  testId,
}: {
  citation: EvidenceCitation;
  ctx: CitationContext;
  onClose: () => void;
  onJump: () => void;
  testId: string;
}) {
  const detail: CitationDetail = useMemo(
    () => buildCitationDetail(citation, ctx),
    [citation, ctx],
  );
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // Initial focus into the dialog.
    try {
      closeRef.current?.focus();
    } catch {
      /* ignore */
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence details: ${detail.citation.label}`}
      data-testid={testId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-lg bg-background border border-border p-4 space-y-2 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-sm font-semibold"
            data-testid={`${testId}-label`}
          >
            {detail.citation.label}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close evidence details"
            data-testid={`${testId}-close`}
            className="rounded-md border border-border/60 px-2 py-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Close
          </button>
        </div>
        <dl
          className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1"
          data-testid={`${testId}-details`}
        >
          <dt className="text-muted-foreground">Evidence type</dt>
          <dd data-testid={`${testId}-kind`}>{detail.kindLabel}</dd>
          <dt className="text-muted-foreground">Source</dt>
          <dd data-testid={`${testId}-source`}>{detail.sourceLabel}</dd>
          {detail.metricKey ? (
            <>
              <dt className="text-muted-foreground">Metric</dt>
              <dd data-testid={`${testId}-metric`}>{detail.metricKey}</dd>
            </>
          ) : null}
          {detail.value != null ? (
            <>
              <dt className="text-muted-foreground">Value</dt>
              <dd data-testid={`${testId}-value`}>{detail.value}</dd>
            </>
          ) : null}
          {detail.statusLabel ? (
            <>
              <dt className="text-muted-foreground">Status</dt>
              <dd data-testid={`${testId}-status`}>{detail.statusLabel}</dd>
            </>
          ) : null}
          {detail.reason ? (
            <>
              <dt className="text-muted-foreground">Reason</dt>
              <dd>{detail.reason}</dd>
            </>
          ) : null}
          {detail.capturedAt ? (
            <>
              <dt className="text-muted-foreground">Captured at</dt>
              <dd>{detail.capturedAt}</dd>
            </>
          ) : null}
        </dl>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid={`${testId}-honesty`}
        >
          {detail.sourceHonestyNote}
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onJump}
            data-testid={`${testId}-jump`}
            className="rounded-md border border-border/60 bg-background/40 px-2.5 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Jump to Evidence used
          </button>
        </div>
      </div>
    </div>
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

function CitedSection({
  title,
  items,
  testId,
  onOpenCitation,
}: {
  title: string;
  items: ReadonlyArray<{
    text: string;
    citation: EvidenceCitation;
  }>;
  testId: string;
  onOpenCitation: (
    c: EvidenceCitation,
    trigger: HTMLButtonElement | null,
  ) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="text-xs" data-testid={testId}>
      <h3 className="font-semibold mb-1">{title}</h3>
      <ul className="list-disc pl-4 space-y-1">
        {items.map((it, i) => (
          <li key={`${i}-${it.text}`} data-testid={`${testId}-item-${i}`}>
            <span>{it.text}</span>{" "}
            <button
              type="button"
              data-testid={`${testId}-citation-${i}`}
              data-citation-kind={it.citation.kind}
              data-citation-healthy={it.citation.healthy ? "true" : "false"}
              data-citation-target={it.citation.targetId}
              aria-label={it.citation.ariaLabel}
              aria-haspopup="dialog"
              onClick={(e) =>
                onOpenCitation(
                  it.citation,
                  e.currentTarget as HTMLButtonElement,
                )
              }
              className={
                "inline-flex items-center rounded border px-1 py-0 text-[10px] font-medium align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 " +
                (it.citation.healthy
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200")
              }
            >
              [{it.citation.label}]
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
