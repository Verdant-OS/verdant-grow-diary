/**
 * Historical AI Doctor Session detail.
 *
 * Read-only view of a single saved `ai_doctor_sessions` row.
 * Does NOT re-run AI. Does NOT create Action Queue items. Does NOT mutate data.
 * RLS scopes ownership via auth.uid().
 */
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Stethoscope, Copy, Check, AlertCircle, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAiDoctorSession } from "@/hooks/use-ai-doctor-sessions";
import {
  buildCautionNote,
  buildCautionReasonTokens,
  buildCautionReviewChecklist,
  buildReviewSummaryViewModel,
  EMPTY_FALLBACKS,
  formatCautionChecklistDescription,
  formatCautionChecklistSummary,
  formatDoctorReviewSummaryText,
  formatSessionRowCautionReasonText,
  type CautionNote,
  type ReviewRiskTone,
  type ReviewSummaryViewModel,
} from "@/lib/aiDoctorSessionDetailViewModel";
import {
  buildSessionReviewHistoryViewModel,
  buildSessionReviewActionsCopy,
  type AiDoctorSessionReviewHistoryViewModel,
  type AiDoctorSessionReviewPanelTone,
} from "@/lib/aiDoctorSessionReviewStatusRules";
import { useAiDoctorSessionReviews } from "@/hooks/useAiDoctorSessionReviews";
import {
  REVIEW_NOTE_MAX_LENGTH,
  useMarkAiDoctorSessionReview,
} from "@/hooks/useMarkAiDoctorSessionReview";
import { plantDetailPath, tentDetailPath } from "@/lib/routes";
import { AiDoctorSessionActionQueueButton } from "@/components/AiDoctorSessionActionQueueButton";
import type { AiDoctorSessionLike } from "@/lib/aiDoctorSessionToActionQueueRules";
import { useAiDoctorSessionLinkedActionQueueItems } from "@/hooks/useAiDoctorSessionLinkedActionQueueItems";
import {
  findLinkedActionForSuggestion,
  type LinkedActionItem,
  type LinkedActionsViewModel,
} from "@/lib/aiDoctorSessionLinkedActionsViewModel";

async function copyPlainText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to execCommand fallback
  }
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyReviewSummaryButton({ vm }: { vm: ReviewSummaryViewModel }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const onClick = async () => {
    const text = formatDoctorReviewSummaryText(vm);
    const ok = await copyPlainText(text);
    setState(ok ? "copied" : "error");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      data-testid="ai-doctor-session-detail-copy-review-button"
      aria-label="Copy review summary"
    >
      {state === "copied" ? (
        <>
          <Check className="h-4 w-4" />
          <span data-testid="ai-doctor-session-detail-copy-review-success">Copied</span>
        </>
      ) : state === "error" ? (
        <>
          <AlertCircle className="h-4 w-4" />
          <span data-testid="ai-doctor-session-detail-copy-review-error">Copy failed</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>Copy review summary</span>
        </>
      )}
    </Button>
  );
}

export function buildSessionDetailCanonicalUrl(sessionId: string, origin?: string | null): string {
  const path = `/doctor/sessions/${sessionId}`;
  const o = (origin ?? "").trim();
  if (!o) return path;
  return `${o.replace(/\/+$/, "")}${path}`;
}

function CopyLinkButton({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const onClick = async () => {
    const origin =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : null;
    const url = buildSessionDetailCanonicalUrl(sessionId, origin);
    const ok = await copyPlainText(url);
    setState(ok ? "copied" : "error");
    setTimeout(() => setState("idle"), 2000);
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      data-testid="ai-doctor-session-detail-copy-link-button"
      aria-label="Copy link to this session"
    >
      {state === "copied" ? (
        <>
          <Check className="h-4 w-4" />
          <span data-testid="ai-doctor-session-detail-copy-link-success">Link copied</span>
        </>
      ) : state === "error" ? (
        <>
          <AlertCircle className="h-4 w-4" />
          <span data-testid="ai-doctor-session-detail-copy-link-error">Copy failed</span>
        </>
      ) : (
        <>
          <LinkIcon className="h-4 w-4" />
          <span>Copy link</span>
        </>
      )}
    </Button>
  );
}

function OpenInNewTabLink({ sessionId }: { sessionId: string }) {
  const href = buildSessionDetailCanonicalUrl(sessionId);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="ai-doctor-session-detail-open-new-tab-link"
      aria-label="Open session in new tab"
      className="inline-flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <ExternalLink className="h-4 w-4" />
      <span>Open in new tab</span>
    </a>
  );
}

function SessionQuickJumpLinks({
  plantId,
  tentId,
}: {
  plantId: string | null | undefined;
  tentId: string | null | undefined;
}) {
  const hasPlant = typeof plantId === "string" && plantId.length > 0;
  const hasTent = typeof tentId === "string" && tentId.length > 0;
  if (!hasPlant && !hasTent) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="ai-doctor-session-detail-quick-jump"
    >
      {hasPlant ? (
        <Link
          to={plantDetailPath(plantId!)}
          aria-label="View related plant"
          data-testid="ai-doctor-session-detail-plant-link"
          className="inline-flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          View plant
        </Link>
      ) : null}
      {hasTent ? (
        <Link
          to={tentDetailPath(tentId!)}
          aria-label="View related tent"
          data-testid="ai-doctor-session-detail-tent-link"
          className="inline-flex items-center gap-2 h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          View tent
        </Link>
      ) : null}
    </div>
  );
}

const RISK_TONE_CLASSES: Record<ReviewRiskTone, string> = {
  neutral: "border-border bg-muted/30",
  info: "border-border bg-muted/20",
  warn: "border-amber-500/40 bg-amber-500/5",
  danger: "border-destructive/50 bg-destructive/5",
};

function ReviewSummarySection({
  vm,
  session,
  linkedActions,
}: {
  vm: ReviewSummaryViewModel;
  session?: AiDoctorSessionLike;
  linkedActions?: LinkedActionsViewModel;
}) {
  return (
    <section
      data-testid="ai-doctor-session-detail-review-summary"
      aria-label="Review summary"
      className={`rounded-lg border p-3 space-y-3 ${RISK_TONE_CLASSES[vm.risk.tone]}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Review Summary</h3>
        <Badge
          variant={vm.isHighRisk ? "destructive" : "outline"}
          className="capitalize text-[11px]"
          data-testid="ai-doctor-session-detail-review-risk"
        >
          {vm.risk.label}
        </Badge>
        {vm.confidencePct != null ? (
          <Badge
            variant="outline"
            className="text-[11px]"
            data-testid="ai-doctor-session-detail-review-confidence"
          >
            Confidence: {vm.confidencePct}%
          </Badge>
        ) : null}
        <div className="ml-auto">
          <CopyReviewSummaryButton vm={vm} />
        </div>
      </header>

      <ReviewBlock
        title="Likely issue"
        testid="ai-doctor-session-detail-review-likely-issue"
        empty={EMPTY_FALLBACKS.likelyIssue}
      >
        {vm.likelyIssue}
      </ReviewBlock>

      <ReviewBlock
        title="Summary"
        testid="ai-doctor-session-detail-review-summary-text"
        empty={EMPTY_FALLBACKS.summary}
      >
        {vm.summary}
      </ReviewBlock>

      <ReviewList
        title="Evidence"
        items={vm.evidence}
        testid="ai-doctor-session-detail-review-evidence"
        empty={EMPTY_FALLBACKS.evidence}
      />

      <ReviewList
        title="Missing information"
        items={vm.missingInformation}
        testid="ai-doctor-session-detail-review-missing-info"
        empty={EMPTY_FALLBACKS.missingInformation}
      />

      <div data-testid="ai-doctor-session-detail-review-actions">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Suggested actions
        </h4>
        {vm.suggestedActions.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-session-detail-review-actions-empty"
          >
            {EMPTY_FALLBACKS.suggestedActions}
          </p>
        ) : (
          <ul className="space-y-1 mt-1 text-xs">
            {vm.suggestedActions.map((a, i) => {
              const linkedMatch: LinkedActionItem | null = linkedActions
                ? findLinkedActionForSuggestion(linkedActions.items, a)
                : null;
              return (
                <li
                  key={i}
                  className="rounded border bg-card/40 px-2 py-1"
                  data-testid="ai-doctor-session-detail-review-action"
                  data-linked-action-queue-id={linkedMatch?.id ?? undefined}
                >
                  <span className="font-medium">{a.title}</span>
                  {a.detail ? (
                    <span className="text-muted-foreground"> — {a.detail}</span>
                  ) : null}
                  {linkedMatch ? (
                    <div
                      className="mt-1 flex flex-wrap items-center gap-2"
                      data-testid="ai-doctor-session-detail-review-action-created-from-session"
                      data-action-queue-id={linkedMatch.id}
                    >
                      <Badge
                        variant="outline"
                        className="text-[11px]"
                        title="This suggestion already has an approval-required Action Queue item."
                        data-testid="ai-doctor-session-detail-review-action-created-from-session-chip"
                      >
                        Created from this session
                      </Badge>
                      <Link
                        to={linkedMatch.focusHref}
                        className="text-xs underline text-primary"
                        data-testid="ai-doctor-session-detail-review-action-created-from-session-link"
                        data-action-queue-id={linkedMatch.id}
                      >
                        View in Action Queue
                      </Link>
                    </div>
                  ) : null}
                  {session ? (
                    <AiDoctorSessionActionQueueButton
                      session={session}
                      action={a}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>


      <ReviewList
        title="What not to do"
        items={vm.whatNotToDo}
        testid="ai-doctor-session-detail-review-what-not-to-do"
        empty={EMPTY_FALLBACKS.whatNotToDo}
      />

      <div data-testid="ai-doctor-session-detail-review-followup">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-up guidance
        </h4>
        {!vm.followUp24h && !vm.recoveryPlan3d ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-session-detail-review-followup-empty"
          >
            {EMPTY_FALLBACKS.followUp}
          </p>
        ) : (
          <div className="space-y-2 mt-1 text-xs">
            {vm.followUp24h ? (
              <div data-testid="ai-doctor-session-detail-review-followup-24h">
                <div className="font-medium">Next 24 hours</div>
                {vm.followUp24h.summary ? (
                  <p className="text-muted-foreground">{vm.followUp24h.summary}</p>
                ) : null}
                {vm.followUp24h.checklist.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {vm.followUp24h.checklist.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {vm.recoveryPlan3d ? (
              <div data-testid="ai-doctor-session-detail-review-followup-3d">
                <div className="font-medium">3-day recovery</div>
                {vm.recoveryPlan3d.summary ? (
                  <p className="text-muted-foreground">{vm.recoveryPlan3d.summary}</p>
                ) : null}
                {vm.recoveryPlan3d.checklist.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {vm.recoveryPlan3d.checklist.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewBlock({
  title,
  children,
  empty,
  testid,
}: {
  title: string;
  children: string | null;
  empty: string;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <p className={children ? "text-sm" : "text-xs text-muted-foreground"}>
        {children ?? empty}
      </p>
    </div>
  );
}

function ReviewList({
  title,
  items,
  empty,
  testid,
}: {
  title: string;
  items: string[];
  empty: string;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {items.length === 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`${testid}-empty`}
        >
          {empty}
        </p>
      ) : (
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
          {items.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CautionBanner({
  note,
  description,
  checklistSummary,
  checklistDescription,
}: {
  note: CautionNote;
  description: string | null;
  checklistSummary: string | null;
  checklistDescription: string | null;
}) {
  if (!note.show) return null;
  const ariaLabel = description ?? "Review before acting";
  return (
    <div
      role="note"
      aria-label={ariaLabel}
      title={description ?? undefined}
      data-testid="ai-doctor-session-detail-caution-note"
      className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium" data-testid="ai-doctor-session-detail-caution-note-text">
              {note.text}
            </p>
            {checklistSummary ? (
              <span
                className="text-xs text-muted-foreground"
                data-testid="ai-doctor-session-detail-caution-checklist-summary"
                title={checklistDescription ?? undefined}
                aria-label={checklistDescription ?? checklistSummary}
              >
                {checklistSummary}
              </span>
            ) : null}
          </div>
          {description ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="ai-doctor-session-detail-caution-reason"
            >
              {description}
            </p>
          ) : null}
          {note.reasons.length > 0 ? (
            <ul
              className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5"
              data-testid="ai-doctor-session-detail-caution-note-reasons"
            >
              {note.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EvidenceSection({ items }: { items: string[] }) {
  return (
    <div data-testid="ai-doctor-session-detail-evidence">
      <h3 className="text-sm font-semibold">Evidence</h3>
      {items.length === 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-doctor-session-detail-evidence-empty"
        >
          {EMPTY_FALLBACKS.evidence}
        </p>
      ) : (
        <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
          {items.map((e, i) => (
            <li key={i} data-testid="ai-doctor-session-detail-evidence-item">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MissingInformationSection({ items }: { items: string[] }) {
  return (
    <div data-testid="ai-doctor-session-detail-missing-info">
      <h3 className="text-sm font-semibold">Missing information</h3>
      {items.length === 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="ai-doctor-session-detail-missing-info-empty"
        >
          {EMPTY_FALLBACKS.missingInformation}
        </p>
      ) : (
        <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
          {items.map((e, i) => (
            <li key={i} data-testid="ai-doctor-session-detail-missing-info-item">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const REVIEW_PANEL_TONE_CLASSES: Record<AiDoctorSessionReviewPanelTone, string> = {
  neutral: "border-border bg-muted/20",
  muted: "border-border bg-muted/30",
  amber: "border-amber-500/40 bg-amber-500/5",
};

const REVIEW_PANEL_BADGE_CLASSES: Record<AiDoctorSessionReviewPanelTone, string> = {
  neutral: "text-muted-foreground",
  muted: "text-muted-foreground",
  amber: "border-amber-500/40 text-amber-700 dark:text-amber-300",
};

function SessionReviewStatusPanel({
  sessionId,
  vm,
}: {
  sessionId: string;
  vm: AiDoctorSessionReviewHistoryViewModel;
}) {
  const containerClass = REVIEW_PANEL_TONE_CLASSES[vm.statusTone];
  const badgeClass = REVIEW_PANEL_BADGE_CLASSES[vm.statusTone];
  return (
    <div
      data-testid="ai-doctor-session-detail-review-status-panel"
      data-session-id={sessionId}
      data-review-status={vm.status}
      className={`rounded-lg border p-3 text-sm ${containerClass}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Review status</h3>
        <Badge
          variant="outline"
          className={`text-[11px] ${badgeClass}`}
          data-testid="ai-doctor-session-detail-review-status-badge"
        >
          {vm.statusLabel}
        </Badge>
      </div>
      <div
        className="mt-2"
        data-testid="ai-doctor-session-detail-review-status-history"
      >
        {vm.isEmpty ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-session-detail-review-status-empty"
          >
            {vm.emptyText}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {vm.items.map((item) => (
              <li
                key={item.id}
                className="rounded border bg-card/40 px-2 py-1.5 text-xs"
                data-testid="ai-doctor-session-detail-review-status-event"
                data-event-type={item.eventType}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="font-medium">{item.eventLabel}</span>
                  <span
                    className="text-muted-foreground"
                    data-testid="ai-doctor-session-detail-review-status-event-time"
                  >
                    {fmtDate(item.createdAt)}
                  </span>
                </div>
                {item.note ? (
                  <p
                    className="mt-0.5 text-muted-foreground"
                    data-testid="ai-doctor-session-detail-review-status-event-note"
                  >
                    {item.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <SessionReviewActions sessionId={sessionId} status={vm.status} />
    </div>
  );
}

function SessionReviewActions({
  sessionId,
  status,
}: {
  sessionId: string;
  status: AiDoctorSessionReviewHistoryViewModel["status"];
}) {
  const [note, setNote] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const mutation = useMarkAiDoctorSessionReview();
  const submitting = mutation.isPending;

  const handle = async (
    eventType: "marked_reviewed" | "needs_follow_up" | "cleared",
  ) => {
    setErrorText(null);
    try {
      await mutation.mutateAsync({
        sessionId,
        eventType,
        note: note.length > 0 ? note : null,
      });
      setNote("");
    } catch (e) {
      const raw =
        typeof e === "object" && e !== null && "message" in e
          ? (e as { message?: unknown }).message
          : null;
      const message =
        typeof raw === "string" && raw.length > 0
          ? raw
          : "Could not save review event.";
      setErrorText(message);
    }
  };

  const copy = buildSessionReviewActionsCopy(status);
  const disableMarkReviewed = submitting || copy.isMarkReviewedDisabledByStatus;
  const disableNeedsFollowUp =
    submitting || copy.isNeedsFollowUpDisabledByStatus;
  const disableClear = submitting || copy.isClearDisabledByStatus;

  return (
    <div
      className="mt-3 space-y-2 border-t pt-3"
      data-testid="ai-doctor-session-detail-review-status-actions"
    >
      <label
        className="block text-xs font-medium text-muted-foreground"
        htmlFor={`review-note-${sessionId}`}
      >
        Note (optional)
      </label>
      <textarea
        id={`review-note-${sessionId}`}
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, REVIEW_NOTE_MAX_LENGTH))}
        rows={2}
        maxLength={REVIEW_NOTE_MAX_LENGTH}
        placeholder="Add context for this review event…"
        className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
        data-testid="ai-doctor-session-detail-review-status-note-input"
        disabled={submitting}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handle("marked_reviewed")}
          disabled={disableMarkReviewed}
          title={copy.markReviewedDisabledReason ?? undefined}
          aria-label={
            copy.markReviewedDisabledReason
              ? `${copy.markReviewedLabel} — ${copy.markReviewedDisabledReason}`
              : copy.markReviewedLabel
          }
          data-testid="ai-doctor-session-detail-review-mark-reviewed"
        >
          {copy.markReviewedLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handle("needs_follow_up")}
          disabled={disableNeedsFollowUp}
          title={copy.needsFollowUpDisabledReason ?? undefined}
          aria-label={
            copy.needsFollowUpDisabledReason
              ? `${copy.needsFollowUpLabel} — ${copy.needsFollowUpDisabledReason}`
              : copy.needsFollowUpLabel
          }
          data-testid="ai-doctor-session-detail-review-needs-follow-up"
        >
          {copy.needsFollowUpLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => handle("cleared")}
          disabled={disableClear}
          title={copy.clearDisabledReason ?? undefined}
          aria-label={
            copy.clearDisabledReason
              ? `${copy.clearLabel} — ${copy.clearDisabledReason}`
              : copy.clearLabel
          }
          data-testid="ai-doctor-session-detail-review-clear"
        >
          {copy.clearLabel}
        </Button>
      </div>
      <div
        className="space-y-0.5 text-[11px] leading-snug text-muted-foreground"
        data-testid="ai-doctor-session-detail-review-helper"
      >
        <p data-testid="ai-doctor-session-detail-review-helper-append-only">
          {copy.appendOnlyHelperText}
        </p>
        <p data-testid="ai-doctor-session-detail-review-helper-no-side-effects">
          {copy.noSideEffectsHelperText}
        </p>
      </div>
      {errorText ? (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="ai-doctor-session-detail-review-error"
        >
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

function fmtDate(ts: string | null): string {
  if (!ts) return "";
  try {
    return format(new Date(ts), "PPpp");
  } catch {
    return "";
  }
}

function LinkedActionQueueSection({ vm }: { vm: LinkedActionsViewModel }) {
  if (vm.count === 0) return null;
  const countLabel = `${vm.count} open ${vm.count === 1 ? "item" : "items"}`;
  return (
    <section
      data-testid="ai-doctor-session-detail-linked-action-queue"
      aria-label="Linked Action Queue items"
      className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Linked Action Queue items</h3>
        <Badge
          variant="outline"
          className="text-[11px]"
          data-testid="ai-doctor-session-detail-linked-action-queue-count"
        >
          {countLabel}
        </Badge>
      </header>
      <p
        className="text-xs text-muted-foreground"
        data-testid="ai-doctor-session-detail-linked-action-queue-helper"
      >
        These approval-required items were created from this AI Doctor review.
      </p>
      {vm.primaryFocusHref ? (
        <Link
          to={vm.primaryFocusHref}
          className="inline-flex items-center gap-1 text-xs underline text-primary"
          data-testid="ai-doctor-session-detail-linked-action-queue-primary-link"
          data-action-queue-id={vm.items[0].id}
        >
          View in Action Queue
        </Link>
      ) : (
        <ul
          className="space-y-1"
          data-testid="ai-doctor-session-detail-linked-action-queue-list"
        >
          {vm.items.map((item) => (
            <li
              key={item.id}
              className="rounded border bg-card/40 px-2 py-1 text-xs"
              data-testid="ai-doctor-session-detail-linked-action-queue-item"
              data-action-queue-id={item.id}
            >
              <Link
                to={item.focusHref}
                className="underline text-primary"
                data-testid="ai-doctor-session-detail-linked-action-queue-item-link"
              >
                View in Action Queue
              </Link>
              {item.reasonText ? (
                <span className="ml-2 text-muted-foreground">
                  — {item.reasonText}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


function fmtConfidence(val: number | null | undefined): string | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return `${Math.round(val * 100)}%`;
}

export default function AiDoctorSessionDetail() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useAiDoctorSession(sessionId);

  return (
    <div data-testid="ai-doctor-session-detail-page" className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card>
        <CardHeader className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle
                className="text-lg flex items-center gap-2"
                data-testid="ai-doctor-session-detail-title"
              >
                <Stethoscope className="h-4 w-4" /> Historical AI Doctor Session
              </CardTitle>
              <p
                className="text-xs text-muted-foreground"
                data-testid="ai-doctor-session-detail-helper"
              >
                This is a saved diagnosis snapshot. It does not re-run AI or execute actions.
              </p>
            </div>
            {sessionId ? (
              <div className="flex flex-wrap items-center gap-2">
                <SessionQuickJumpLinks
                  plantId={data?.plant_id ?? null}
                  tentId={data?.tent_id ?? null}
                />
                <CopyLinkButton sessionId={sessionId} />
                <OpenInNewTabLink sessionId={sessionId} />
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading session…</p>
          ) : error || !data ? (
            <div
              className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
              data-testid="ai-doctor-session-detail-not-found"
            >
              This AI Doctor session is unavailable. It may have been removed or is not accessible
              to your account.
            </div>
          ) : (
            <SessionDetailBody row={data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionDetailBody({
  row,
}: {
  row: NonNullable<ReturnType<typeof useAiDoctorSession>["data"]>;
}) {
  const d = row.diagnosis;
  const confidence = fmtConfidence(row.displayed_confidence ?? row.raw_confidence);
  const actions = Array.isArray(row.suggested_actions) ? row.suggested_actions : [];
  const reviewVm = buildReviewSummaryViewModel({
    diagnosis: d,
    rawConfidence: row.raw_confidence,
    displayedConfidence: row.displayed_confidence,
    suggestedActions: actions,
  });
  const reviewsQuery = useAiDoctorSessionReviews([row.id]);
  const reviewState = reviewsQuery.data?.stateBySession.get(row.id) ?? null;
  const reviewHistoryVm = buildSessionReviewHistoryViewModel(
    reviewsQuery.data?.events ?? [],
    reviewState,
  );
  const linkedActions = useAiDoctorSessionLinkedActionQueueItems(row.id);


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {row.created_at ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-session-detail-date"
          >
            {fmtDate(row.created_at)}
          </span>
        ) : null}
        {d?.riskLevel ? (
          <Badge
            variant="outline"
            className="capitalize text-[11px]"
            data-testid="ai-doctor-session-detail-risk"
          >
            Risk: {d.riskLevel}
          </Badge>
        ) : null}
        {confidence ? (
          <Badge
            variant="outline"
            className="text-[11px]"
            data-testid="ai-doctor-session-detail-confidence"
          >
            Confidence: {confidence}
          </Badge>
        ) : null}
        {row.context_confidence_ceiling ? (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground"
            data-testid="ai-doctor-session-detail-context-ceiling"
          >
            Ceiling: {row.context_confidence_ceiling}
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className="text-[11px]"
          data-testid="ai-doctor-session-detail-action-count"
        >
          {actions.length} suggested action{actions.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {(() => {
        const cautionNote = buildCautionNote(reviewVm);
        const tokens = buildCautionReasonTokens(reviewVm);
        const description = formatSessionRowCautionReasonText(tokens);
        const checklist = buildCautionReviewChecklist(tokens);
        const checklistSummary = formatCautionChecklistSummary(checklist.length);
        const checklistDescription = formatCautionChecklistDescription(checklist);
        return (
          <>
            <CautionBanner
              note={cautionNote}
              description={description}
              checklistSummary={checklistSummary}
              checklistDescription={checklistDescription}
            />
            {cautionNote.show && checklist.length > 0 ? (
              <div
                data-testid="ai-doctor-session-detail-caution-checklist"
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"
              >
                <p className="font-medium text-xs text-muted-foreground mb-1">
                  Review checklist
                </p>
                <ul className="list-disc pl-5 text-sm space-y-0.5">
                  {checklist.map((item, i) => (
                    <li
                      key={i}
                      data-testid="ai-doctor-session-detail-caution-checklist-item"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        );
      })()}

      <SessionReviewStatusPanel sessionId={row.id} vm={reviewHistoryVm} />

      <LinkedActionQueueSection vm={linkedActions.vm} />

      <ReviewSummarySection
        vm={reviewVm}
        session={{
          id: row.id,
          grow_id: row.grow_id,
          tent_id: row.tent_id,
          plant_id: row.plant_id,
          diagnosis: d ? { riskLevel: d.riskLevel } : null,
        }}
        linkedActions={linkedActions.vm}
      />




      {d?.likelyIssue ? (
        <div>
          <h3 className="text-sm font-semibold">Likely issue</h3>
          <p data-testid="ai-doctor-session-detail-likely-issue">{d.likelyIssue}</p>
        </div>
      ) : null}

      {d?.summary ? (
        <div>
          <h3 className="text-sm font-semibold">Summary</h3>
          <p
            className="text-muted-foreground"
            data-testid="ai-doctor-session-detail-summary"
          >
            {d.summary}
          </p>
        </div>
      ) : null}

      {row.question ? (
        <div>
          <h3 className="text-sm font-semibold">Question asked</h3>
          <p className="text-muted-foreground" data-testid="ai-doctor-session-detail-question">
            {row.question}
          </p>
        </div>
      ) : null}

      <EvidenceSection items={reviewVm.evidence} />

      <MissingInformationSection items={reviewVm.missingInformation} />


      <div>
        <h3 className="text-sm font-semibold">
          Suggested actions (read-only snapshot)
        </h3>
        {actions.length === 0 ? (
          <p
            className="text-muted-foreground text-xs"
            data-testid="ai-doctor-session-detail-actions-empty"
          >
            No suggested actions saved.
          </p>
        ) : (
          <ul
            className="space-y-2 mt-1"
            data-testid="ai-doctor-session-detail-actions-list"
          >
            {actions.map((a, i) => (
              <li
                key={i}
                className="rounded-md border bg-card/40 p-2 text-xs"
                data-testid="ai-doctor-session-detail-action"
              >
                <div className="font-medium text-sm">{a.title}</div>
                {a.detail ? (
                  <p className="text-muted-foreground">{a.detail}</p>
                ) : null}
                {a.reason ? (
                  <p className="text-muted-foreground italic">Reason: {a.reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
