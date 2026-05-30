/**
 * Read-only AI Doctor Sessions index page.
 *
 * Lists saved `ai_doctor_sessions` rows scoped to the current user via RLS.
 * Paginated (25 per page), newest first.
 *
 * Safety:
 *   - No AI generation. No functions.invoke.
 *   - No writes. No action_queue. No alerts.
 *   - Rows deep-link to the existing historical detail page.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Stethoscope } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useAiDoctorSessionsIndex,
  type AiDoctorSessionRow,
} from "@/hooks/use-ai-doctor-sessions";

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

function summaryPreview(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= 140) return trimmed;
  return `${trimmed.slice(0, 140)}…`;
}

function IndexRow({ row }: { row: AiDoctorSessionRow }) {
  const d = row.diagnosis;
  const confidence = fmtConfidence(row.displayed_confidence ?? row.raw_confidence);
  const actionCount = Array.isArray(row.suggested_actions) ? row.suggested_actions.length : 0;
  const preview = summaryPreview(d?.summary ?? null);

  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm space-y-1.5"
      data-testid="ai-doctor-sessions-index-row"
      data-session-id={row.id}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {row.created_at ? (
          <span
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-sessions-index-date"
          >
            {fmtDate(row.created_at)}
          </span>
        ) : null}
        {d?.riskLevel ? (
          <Badge
            variant="outline"
            className="capitalize text-[11px]"
            data-testid="ai-doctor-sessions-index-risk"
          >
            {d.riskLevel}
          </Badge>
        ) : null}
        {confidence ? (
          <Badge
            variant="outline"
            className="text-[11px]"
            data-testid="ai-doctor-sessions-index-confidence"
          >
            {confidence}
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className="text-[11px]"
          data-testid="ai-doctor-sessions-index-action-count"
        >
          {actionCount} action{actionCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      {d?.likelyIssue ? (
        <p
          className="font-medium leading-snug"
          data-testid="ai-doctor-sessions-index-likely-issue"
        >
          {d.likelyIssue}
        </p>
      ) : null}

      {preview ? (
        <p
          className="text-xs text-muted-foreground leading-snug"
          data-testid="ai-doctor-sessions-index-summary"
        >
          {preview}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
        {row.grow_id ? (
          <span data-testid="ai-doctor-sessions-index-grow-context">Grow context</span>
        ) : null}
        {row.plant_id ? (
          <span data-testid="ai-doctor-sessions-index-plant-context">Plant context</span>
        ) : null}
        {row.tent_id ? (
          <span data-testid="ai-doctor-sessions-index-tent-context">Tent context</span>
        ) : null}
        <Link
          to={`/doctor/sessions/${row.id}`}
          className="text-primary underline"
          data-testid="ai-doctor-sessions-index-view-link"
        >
          View session
        </Link>
      </div>
    </li>
  );
}

export default function AiDoctorSessionsIndex() {
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useAiDoctorSessionsIndex(page);
  const rows = data?.rows ?? [];
  const hasMore = !!data?.hasMore;

  return (
    <div data-testid="ai-doctor-sessions-index-page" className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle
            className="text-lg flex items-center gap-2"
            data-testid="ai-doctor-sessions-index-title"
          >
            <Stethoscope className="h-4 w-4" /> AI Doctor Sessions
          </CardTitle>
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-sessions-index-helper"
          >
            Saved diagnosis snapshots. Opening a session does not re-run AI or create actions.
          </p>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading AI Doctor sessions…</p>
          ) : error ? (
            <p
              className="text-muted-foreground"
              data-testid="ai-doctor-sessions-index-error"
            >
              Unable to load AI Doctor sessions.
            </p>
          ) : rows.length === 0 && page === 0 ? (
            <p
              className="text-muted-foreground"
              data-testid="ai-doctor-sessions-index-empty"
            >
              No saved AI Doctor sessions yet.
            </p>
          ) : (
            <>
              <ul
                className="space-y-2"
                data-testid="ai-doctor-sessions-index-list"
              >
                {rows.map((r) => (
                  <IndexRow key={r.id} row={r} />
                ))}
              </ul>
              <div
                className="flex items-center justify-between pt-2"
                data-testid="ai-doctor-sessions-index-pager"
              >
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  data-testid="ai-doctor-sessions-index-prev"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="ai-doctor-sessions-index-next"
                >
                  Next
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
