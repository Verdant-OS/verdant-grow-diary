/**
 * StructuredDiagnosisCard — read-first presenter for AI Doctor v1 structured
 * diagnoses with a manual, approval-required "Add to Action Queue" affordance.
 *
 * Safety contract:
 *   - Renders the sanitized diagnosis only — never re-derives medical/grow
 *     rules in JSX.
 *   - No Action Queue insertion happens on render.
 *   - Each suggested action requires an explicit user click; the parent owns
 *     the actual queue insert through the `onAddToQueue` callback.
 *   - The card never references device-control concepts. The sanitizer
 *     strips them before they ever reach this component.
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, ShieldCheck, Sparkles } from "lucide-react";
import {
  DIAGNOSIS_SAFETY_COPY,
  SUGGESTION_APPROVAL_COPY,
  type Diagnosis,
  type DiagnosisSuggestedAction,
} from "@/lib/aiDoctorDiagnosisRules";
import type { AiContextConfidenceCeiling } from "@/lib/aiContextSufficiencyRules";
import {
  harmonizeDiagnosisConfidence,
  isDisplayedConfidenceLow,
} from "@/lib/aiDoctorConfidenceRules";
import { useAiDoctorSessionLinkedActionQueueItems } from "@/hooks/useAiDoctorSessionLinkedActionQueueItems";
import { findLinkedActionForSuggestion } from "@/lib/aiDoctorSessionLinkedActionsViewModel";

export interface StructuredDiagnosisCardProps {
  diagnosis: Diagnosis;
  /**
   * Called on explicit user click. Must perform the approval-required
   * Action Queue insert. The card disables the button while the promise
   * is pending and marks the item as queued on success.
   */
  onAddToQueue?: (
    action: DiagnosisSuggestedAction,
    index: number,
  ) => Promise<void> | void;
  /** Disables every queue button (e.g. no active grow). */
  disableQueueing?: boolean;
  /**
   * Optional categorical ceiling from `evaluateAiContextSufficiency`. When
   * supplied, the displayed confidence is harmonized against it so the
   * structured card never claims more certainty than the legacy
   * sufficiency surface allows.
   */
  contextCeiling?: AiContextConfidenceCeiling | null;
  /**
   * Optional AI Doctor session id. When provided, the card surfaces a
   * read-only "Created from this session" chip beside any suggestion that
   * already has a linked open Action Queue item. If absent, no chip is
   * rendered (no fetch is issued).
   */
  aiDoctorSessionId?: string | null;
  testId?: string;
}

function confidencePct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

function riskTone(level: Diagnosis["riskLevel"]): string {
  switch (level) {
    case "high":
      return "border-destructive text-destructive";
    case "medium":
      return "border-[hsl(var(--warning))] text-foreground";
    case "low":
    default:
      return "border-border text-muted-foreground";
  }
}

function Section({
  title,
  items,
  testId,
}: {
  title: string;
  items: string[];
  testId?: string;
}) {
  if (!items?.length) return null;
  return (
    <div data-testid={testId}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </p>
      <ul className="list-disc list-inside space-y-0.5 text-sm">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function FollowUpBlock({
  title,
  followUp,
  testId,
}: {
  title: string;
  followUp: Diagnosis["followUp24h"];
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border/40 bg-secondary/10 p-2 text-xs"
    >
      <p className="uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </p>
      <p className="text-sm">{followUp.summary}</p>
      {followUp.checklist.length > 0 && (
        <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
          {followUp.checklist.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StructuredDiagnosisCard({
  diagnosis,
  onAddToQueue,
  disableQueueing,
  contextCeiling,
  aiDoctorSessionId,
  testId = "ai-doctor-diagnosis",
}: StructuredDiagnosisCardProps) {
  const [queuedIdx, setQueuedIdx] = useState<Set<number>>(new Set());
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  // Ref-backed guards so synchronous duplicate clicks (before React commits
  // the state update) cannot enqueue twice.
  const inFlightRef = useRef<Set<number>>(new Set());
  const queuedRef = useRef<Set<number>>(new Set());

  // Linked Action Queue items are fetched only when an AI Doctor session id
  // is supplied — see `<LinkedActionChip />` below. This keeps the hook out
  // of the render tree for the live Coach flow (which currently does not
  // thread a session id back into state), so the card stays usable without
  // a QueryClientProvider in that path.


  async function handleClick(action: DiagnosisSuggestedAction, idx: number) {
    if (!onAddToQueue) return;
    if (queuedRef.current.has(idx) || inFlightRef.current.size > 0) return;
    inFlightRef.current.add(idx);
    setBusyIdx(idx);
    try {
      await onAddToQueue(action, idx);
      queuedRef.current.add(idx);
      setQueuedIdx((s) => new Set(s).add(idx));
    } finally {
      inFlightRef.current.delete(idx);
      setBusyIdx(null);
    }
  }

  // Harmonize the structured confidence with the legacy context ceiling.
  const harmonized = harmonizeDiagnosisConfidence(
    diagnosis.confidence,
    contextCeiling ?? "high",
  );
  // If the cap pushed confidence below the low-confidence threshold and the
  // model did not already provide missing-information guidance, surface a
  // cautious default so the grower still sees what's missing.
  const displayedMissing =
    diagnosis.missingInformation.length === 0 &&
    isDisplayedConfidenceLow(harmonized)
      ? [
          "Evidence is limited — add a fresh photo, recent diary note, or sensor snapshot before acting.",
        ]
      : diagnosis.missingInformation;

  return (
    <div
      data-testid={testId}
      className="glass rounded-2xl p-4 space-y-3 text-sm"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        <span>AI Doctor</span>
        <Badge
          variant="outline"
          className="text-[10px] uppercase border-muted-foreground"
        >
          Structured v1
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] uppercase ml-auto ${riskTone(
            diagnosis.riskLevel,
          )}`}
          data-testid={`${testId}-risk`}
        >
          Risk: {diagnosis.riskLevel}
        </Badge>
        <span
          className="text-[10px] uppercase tracking-wider"
          data-testid={`${testId}-confidence`}
          data-capped={String(harmonized.wasCapped)}
          data-raw-confidence={String(harmonized.rawConfidence)}
        >
          Confidence: {confidencePct(harmonized.displayedConfidence)}
        </span>
      </div>

      {harmonized.limitedCopy && (
        <p
          className="text-[11px] text-muted-foreground rounded-lg border border-border/40 bg-secondary/10 p-2"
          data-testid={`${testId}-confidence-limited-copy`}
        >
          {harmonized.limitedCopy}
        </p>
      )}

      <p
        className="flex items-start gap-1.5 text-[11px] text-muted-foreground rounded-lg border border-border/40 bg-secondary/10 p-2"
        data-testid={`${testId}-safety-copy`}
      >
        <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
        <span>{DIAGNOSIS_SAFETY_COPY}</span>
      </p>

      <div data-testid={`${testId}-summary`}>
        <p className="font-medium">{diagnosis.summary}</p>
        {diagnosis.likelyIssue && (
          <p className="text-xs mt-1" data-testid={`${testId}-likely-issue`}>
            <span className="text-muted-foreground">Likely issue:</span>{" "}
            {diagnosis.likelyIssue}
          </p>
        )}
      </div>

      <Section
        title="Evidence"
        items={diagnosis.evidence}
        testId={`${testId}-evidence`}
      />
      <Section
        title="Missing information"
        items={displayedMissing}
        testId={`${testId}-missing-info`}
      />
      <Section
        title="Possible causes"
        items={diagnosis.possibleCauses}
        testId={`${testId}-possible-causes`}
      />

      {diagnosis.immediateAction && (
        <div data-testid={`${testId}-immediate-action`}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Immediate action
          </p>
          <p className="text-sm">{diagnosis.immediateAction}</p>
        </div>
      )}

      <Section
        title="What not to do"
        items={diagnosis.whatNotToDo}
        testId={`${testId}-what-not-to-do`}
      />

      <FollowUpBlock
        title="24h follow-up"
        followUp={diagnosis.followUp24h}
        testId={`${testId}-follow-up-24h`}
      />
      <FollowUpBlock
        title="3-day recovery plan"
        followUp={diagnosis.recoveryPlan3d}
        testId={`${testId}-recovery-3d`}
      />

      <div data-testid={`${testId}-suggested-actions`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
          Suggested actions
        </p>
        {diagnosis.suggestedActions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No draft actions — review the diagnosis and decide your next step.
          </p>
        ) : (
          <ul className="space-y-2">
            {diagnosis.suggestedActions.map((a, i) => {
              const isQueued = queuedIdx.has(i);
              const isBusy = busyIdx === i;
              return (
                <li
                  key={i}
                  data-testid={`${testId}-suggested-action-${i}`}
                  className="rounded-lg border border-border/40 bg-secondary/10 p-2 space-y-1"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.detail}
                      </p>
                      {a.reason && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Reason: {a.reason}
                        </p>
                      )}
                      <p
                        className="text-[11px] text-muted-foreground mt-1"
                        data-testid={`${testId}-suggested-action-${i}-approval-copy`}
                      >
                        {SUGGESTION_APPROVAL_COPY}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 shrink-0"
                      disabled={
                        !onAddToQueue ||
                        !!disableQueueing ||
                        isQueued ||
                        busyIdx !== null
                      }
                      onClick={() => handleClick(a, i)}
                      data-testid={`${testId}-suggested-action-${i}-add-button`}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isQueued ? (
                        "Queued"
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          Add to Action Queue
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {a.type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Priority: {a.priority}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      Approval required
                    </Badge>
                  </div>
                  {aiDoctorSessionId ? (
                    <LinkedSuggestionChip
                      sessionId={aiDoctorSessionId}
                      action={a}
                      testId={testId}
                      index={i}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
