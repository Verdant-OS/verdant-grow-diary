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
  buildReviewSummaryViewModel,
  EMPTY_FALLBACKS,
  formatDoctorReviewSummaryText,
  type ReviewRiskTone,
  type ReviewSummaryViewModel,
} from "@/lib/aiDoctorSessionDetailViewModel";

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

const RISK_TONE_CLASSES: Record<ReviewRiskTone, string> = {
  neutral: "border-border bg-muted/30",
  info: "border-border bg-muted/20",
  warn: "border-amber-500/40 bg-amber-500/5",
  danger: "border-destructive/50 bg-destructive/5",
};

function ReviewSummarySection({ vm }: { vm: ReviewSummaryViewModel }) {
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
            {vm.suggestedActions.map((a, i) => (
              <li
                key={i}
                className="rounded border bg-card/40 px-2 py-1"
                data-testid="ai-doctor-session-detail-review-action"
              >
                <span className="font-medium">{a.title}</span>
                {a.detail ? (
                  <span className="text-muted-foreground"> — {a.detail}</span>
                ) : null}
              </li>
            ))}
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

function fmtDate(ts: string | null): string {
  if (!ts) return "";
  try {
    return format(new Date(ts), "PPpp");
  } catch {
    return "";
  }
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
            {sessionId ? <CopyLinkButton sessionId={sessionId} /> : null}
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

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {row.plant_id ? (
          <Link
            to={`/plants/${row.plant_id}`}
            className="underline"
            data-testid="ai-doctor-session-detail-plant-link"
          >
            View plant
          </Link>
        ) : null}
        {row.tent_id ? (
          <Link
            to={`/tents/${row.tent_id}`}
            className="underline"
            data-testid="ai-doctor-session-detail-tent-link"
          >
            View tent
          </Link>
        ) : null}
      </div>

      <ReviewSummarySection vm={reviewVm} />



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

      {d?.evidence && d.evidence.length > 0 ? (
        <div data-testid="ai-doctor-session-detail-evidence">
          <h3 className="text-sm font-semibold">Evidence</h3>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            {d.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {d?.missingInformation && d.missingInformation.length > 0 ? (
        <div data-testid="ai-doctor-session-detail-missing-info">
          <h3 className="text-sm font-semibold">Missing information</h3>
          <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
            {d.missingInformation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

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
