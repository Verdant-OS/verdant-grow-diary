/**
 * Coach → Recent AI Doctor History (read-only mini-list).
 *
 * Reads from `ai_doctor_sessions` via `useGrowAiDoctorSessions` (RLS-scoped).
 * Limited to the latest 5 sessions for the active grow.
 * No writes. No AI re-run. No queue actions.
 */
import { Stethoscope, ShieldAlert, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useGrowAiDoctorSessions,
  type AiDoctorSessionRow,
} from "@/hooks/use-ai-doctor-sessions";
import {
  buildSessionRowCautionIndicator,
  isSessionLimitedContext,
  LIMITED_CONTEXT_LABEL,
  LIMITED_CONTEXT_TITLE,
} from "@/lib/aiDoctorSessionDetailViewModel";

interface Props {
  growId: string | null | undefined;
}

function fmtDate(ts: string | null): string {
  if (!ts) return "";
  try {
    return format(new Date(ts), "PPp");
  } catch {
    return "";
  }
}

function fmtConfidence(val: number | null | undefined): string | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  return `${Math.round(val * 100)}%`;
}

function HistoryRow({ row }: { row: AiDoctorSessionRow }) {
  const d = row.diagnosis;
  const confidence = fmtConfidence(row.displayed_confidence ?? row.raw_confidence);
  const actionCount = Array.isArray(row.suggested_actions) ? row.suggested_actions.length : 0;

  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm space-y-1.5"
      data-testid="coach-ai-doctor-history-row"
      data-session-id={row.id}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {row.created_at ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="coach-ai-doctor-history-date"
          >
            {fmtDate(row.created_at)}
          </span>
        ) : null}
        {d?.riskLevel ? (
          <Badge
            variant="outline"
            className="capitalize text-[11px]"
            data-testid="coach-ai-doctor-history-risk"
          >
            {d.riskLevel}
          </Badge>
        ) : null}
        {confidence ? (
          <Badge
            variant="outline"
            className="text-[11px]"
            data-testid="coach-ai-doctor-history-confidence"
          >
            {confidence}
          </Badge>
        ) : null}
        {actionCount > 0 ? (
          <Badge
            variant="secondary"
            className="text-[11px]"
            data-testid="coach-ai-doctor-history-action-count"
          >
            {actionCount} action{actionCount !== 1 ? "s" : ""}
          </Badge>
        ) : null}
      </div>
      {d?.likelyIssue ? (
        <p
          className="font-medium leading-snug"
          data-testid="coach-ai-doctor-history-likely-issue"
        >
          {d.likelyIssue}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {row.plant_id ? (
          <span data-testid="coach-ai-doctor-history-plant-context">Plant context</span>
        ) : null}
        {row.tent_id ? (
          <span data-testid="coach-ai-doctor-history-tent-context">Tent context</span>
        ) : null}
        <Link
          to={`/doctor/sessions/${row.id}`}
          className="text-primary underline"
          data-testid="coach-ai-doctor-history-view-link"
        >
          View session
        </Link>
      </div>
    </li>
  );
}

export default function CoachAiDoctorHistoryPanel({ growId }: Props) {
  const enabled = !!growId;
  const { data, isLoading } = useGrowAiDoctorSessions(growId);
  const rows: AiDoctorSessionRow[] = enabled ? (data ?? []) : [];

  return (
    <Card data-testid="coach-ai-doctor-history-panel" className="mt-4">
      <CardHeader className="space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Stethoscope className="h-4 w-4" /> Recent AI Doctor History
        </CardTitle>
        <p
          className="text-xs text-muted-foreground pt-0.5"
          data-testid="coach-ai-doctor-history-subtitle"
        >
          Saved AI Doctor snapshots.
        </p>
        <p
          className="text-[11px] text-muted-foreground pt-0.5"
          data-testid="coach-ai-doctor-history-helper"
        >
          These are historical sessions. Opening one does not re-run AI or create actions.
        </p>
        <Link
          to="/doctor/sessions"
          className="text-[11px] text-primary underline pt-0.5"
          data-testid="coach-ai-doctor-history-view-all-link"
        >
          View all sessions
        </Link>
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="coach-ai-doctor-history-empty-no-grow"
          >
            Pick a grow to see saved AI Doctor sessions.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading AI Doctor history…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground" data-testid="coach-ai-doctor-history-empty">
            No saved AI Doctor sessions yet.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="coach-ai-doctor-history-list">
            {rows.map((r) => (
              <HistoryRow key={r.id} row={r} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
