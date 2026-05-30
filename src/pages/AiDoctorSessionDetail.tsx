/**
 * Historical AI Doctor Session detail.
 *
 * Read-only view of a single saved `ai_doctor_sessions` row.
 * Does NOT re-run AI. Does NOT create Action Queue items. Does NOT mutate data.
 * RLS scopes ownership via auth.uid().
 */
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAiDoctorSession } from "@/hooks/use-ai-doctor-sessions";

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
