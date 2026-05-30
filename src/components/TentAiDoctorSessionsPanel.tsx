/**
 * Render-only panel: recent AI Doctor session snapshots for one tent.
 *
 * Reads from `ai_doctor_sessions` via `useTentAiDoctorSessions` (RLS-scoped).
 * No writes. No queue action buttons. History view only.
 */
import { Stethoscope, ShieldAlert, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useTentAiDoctorSessions, type AiDoctorSessionRow } from "@/hooks/use-ai-doctor-sessions";
import {
  buildSessionRowCautionIndicator,
  isSessionLimitedContext,
  LIMITED_CONTEXT_LABEL,
  LIMITED_CONTEXT_TITLE,
} from "@/lib/aiDoctorSessionDetailViewModel";

interface Props {
  tentId: string | null | undefined;
}

function riskClass(risk: string | null): string {
  switch (risk) {
    case "high":
      return "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30";
    case "medium":
      return "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30";
    case "low":
      return "bg-muted text-muted-foreground border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function fmtDate(ts: string | null): string {
  if (!ts) return "";
  try {
    return format(new Date(ts), "PPp");
  } catch {
    return "";
  }
}

function fmtConfidence(val: number | null): string | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return `${Math.round(val * 100)}%`;
}

function SessionRow({ row }: { row: AiDoctorSessionRow }) {
  const summary = row.diagnosis?.summary ?? null;
  const likelyIssue = row.diagnosis?.likelyIssue ?? null;
  const riskLevel = row.diagnosis?.riskLevel ?? null;
  const confidence = fmtConfidence(row.displayed_confidence ?? row.raw_confidence);
  const actionCount = Array.isArray(row.suggested_actions) ? row.suggested_actions.length : 0;
  const caution = buildSessionRowCautionIndicator(row);
  const limitedContext = isSessionLimitedContext(row);

  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm space-y-1.5"
      data-testid="tent-ai-doctor-session-row"
      data-session-id={row.id}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {row.created_at ? (
          <span className="text-xs text-muted-foreground" data-testid="tent-ai-doctor-session-date">
            {fmtDate(row.created_at)}
          </span>
        ) : null}
        {riskLevel ? (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${riskClass(riskLevel)}`}
            data-testid="tent-ai-doctor-session-risk"
          >
            {riskLevel}
          </span>
        ) : null}
        {confidence ? (
          <Badge
            variant="outline"
            className="text-[11px]"
            data-testid="tent-ai-doctor-session-confidence"
          >
            Confidence: {confidence}
          </Badge>
        ) : null}
        {row.context_confidence_ceiling ? (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground"
            data-testid="tent-ai-doctor-session-context-ceiling"
          >
            Ceiling: {row.context_confidence_ceiling}
          </Badge>
        ) : null}
        {actionCount > 0 ? (
          <Badge
            variant="secondary"
            className="text-[11px]"
            data-testid="tent-ai-doctor-session-action-count"
          >
            {actionCount} suggested action{actionCount !== 1 ? "s" : ""}
          </Badge>
        ) : null}
        {caution.show ? (
          <Badge
            variant="outline"
            className="text-[11px] border-amber-500/50 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
            data-testid="tent-ai-doctor-session-caution-indicator"
            title={caution.title}
            aria-label={`${caution.label}. ${caution.title}`}
          >
            <ShieldAlert className="h-3 w-3" />
            {caution.label}
          </Badge>
        ) : null}
        {limitedContext ? (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground inline-flex items-center gap-1"
            data-testid="tent-ai-doctor-session-limited-context-indicator"
            title={LIMITED_CONTEXT_TITLE}
            aria-label={`${LIMITED_CONTEXT_LABEL}. ${LIMITED_CONTEXT_TITLE}`}
          >
            <Info className="h-3 w-3" />
            {LIMITED_CONTEXT_LABEL}
          </Badge>
        ) : null}
      </div>

      {likelyIssue ? (
        <p className="font-medium leading-snug" data-testid="tent-ai-doctor-session-likely-issue">
          {likelyIssue}
        </p>
      ) : null}
      {summary ? (
        <p
          className="text-xs text-muted-foreground leading-snug"
          data-testid="tent-ai-doctor-session-summary"
        >
          {summary}
        </p>
      ) : null}
      <div className="pt-1">
        <Link
          to={`/doctor/sessions/${row.id}`}
          className="text-xs text-primary underline"
          data-testid="tent-ai-doctor-session-view-link"
        >
          View session
        </Link>
      </div>
    </li>
  );
}

export default function TentAiDoctorSessionsPanel({ tentId }: Props) {
  const enabled = !!tentId;
  const { data, isLoading } = useTentAiDoctorSessions(tentId);
  const rows: AiDoctorSessionRow[] = enabled ? (data ?? []) : [];

  return (
    <Card data-testid="tent-ai-doctor-sessions-panel" className="mt-4">
      <CardHeader className="space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="h-4 w-4" /> AI Doctor History
        </CardTitle>
        <p
          className="text-xs text-muted-foreground pt-0.5"
          data-testid="tent-ai-doctor-sessions-readonly-label"
        >
          Read-only AI Doctor history.
        </p>
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="tent-ai-doctor-sessions-empty-no-tent"
          >
            No tent selected.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading AI Doctor history…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground" data-testid="tent-ai-doctor-sessions-empty">
            No AI Doctor sessions saved for this tent yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="tent-ai-doctor-sessions-list">
            {rows.map((r) => (
              <SessionRow key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
