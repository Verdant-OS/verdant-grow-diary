/**
 * Read-only AI Doctor Sessions index page.
 *
 * Lists saved `ai_doctor_sessions` rows scoped to the current user via RLS.
 * Paginated (25 per page), newest first.
 *
 * Safety:
 *   - No AI generation. No edge function invocations.
 *   - No writes. No action_queue. No alerts.
 *   - Rows deep-link to the existing historical detail page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Stethoscope, Link2, Check, AlertCircle, Bookmark, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  copyShareLink,
  readCurrentShareUrl,
  type CopyLinkStatus,
} from "@/lib/aiDoctorSessionsShareLinkRules";
import { Button } from "@/components/ui/button";
import {
  useAiDoctorSessionsIndex,
  type AiDoctorSessionRow,
} from "@/hooks/use-ai-doctor-sessions";
import {
  DEFAULT_FILTERS,
  FILTER_PARAM_KEYS,
  formatActiveFilterLabels,
  isFiltersActive,
  parseFilters,
  parsePageParam,
  serializeFilters,
  serializePageParam,
  type DateRangeFilter,
  type HasActionsFilter,
  type RiskFilter,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  addSavedView,
  findSavedView,
  readSavedViews,
  removeSavedView,
  savedViewToSearchParams,
  writeSavedViews,
  type SavedView,
  type SaveViewError,
} from "@/lib/aiDoctorSessionsSavedViewsRules";

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
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive filters + page from URL (single source of truth).
  const filters = useMemo<SessionsIndexFilters>(
    () =>
      parseFilters({
        risk: searchParams.get(FILTER_PARAM_KEYS.risk) ?? undefined,
        hasActions: searchParams.get(FILTER_PARAM_KEYS.hasActions) ?? undefined,
        dateRange: searchParams.get(FILTER_PARAM_KEYS.dateRange) ?? undefined,
      }),
    [searchParams],
  );
  const page = useMemo(
    () => parsePageParam(searchParams.get(FILTER_PARAM_KEYS.page) ?? undefined),
    [searchParams],
  );

  const { data, isLoading, error } = useAiDoctorSessionsIndex(page, filters);
  const rows = data?.rows ?? [];
  const hasMore = !!data?.hasMore;
  const filtersActive = isFiltersActive(filters);
  const activeLabels = formatActiveFilterLabels(filters);

  const writeParams = (next: SessionsIndexFilters, nextPage: number) => {
    const params = new URLSearchParams();
    // Preserve any unrelated params already on the URL.
    searchParams.forEach((value, key) => {
      if (
        key !== FILTER_PARAM_KEYS.risk &&
        key !== FILTER_PARAM_KEYS.hasActions &&
        key !== FILTER_PARAM_KEYS.dateRange &&
        key !== FILTER_PARAM_KEYS.page
      ) {
        params.set(key, value);
      }
    });
    for (const [k, v] of Object.entries(serializeFilters(next))) params.set(k, v);
    const pageStr = serializePageParam(nextPage);
    if (pageStr) params.set(FILTER_PARAM_KEYS.page, pageStr);
    setSearchParams(params, { replace: true });
  };

  const updateFilter = <K extends keyof SessionsIndexFilters>(
    key: K,
    value: SessionsIndexFilters[K],
  ) => {
    writeParams({ ...filters, [key]: value }, 0);
  };

  const clearFilters = () => {
    writeParams(DEFAULT_FILTERS, 0);
  };

  const goToPage = (nextPage: number) => {
    writeParams(filters, Math.max(0, nextPage));
  };

  const [copyStatus, setCopyStatus] = useState<CopyLinkStatus>("idle");
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCopyLink = async () => {
    const url = readCurrentShareUrl();
    if (!url) {
      setCopyStatus("error");
      return;
    }
    try {
      await copyShareLink(url);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    } finally {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopyStatus("idle"), 2000);
    }
  };

  return (
    <div data-testid="ai-doctor-sessions-index-page" className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <CardTitle
              className="text-lg flex items-center gap-2"
              data-testid="ai-doctor-sessions-index-title"
            >
              <Stethoscope className="h-4 w-4" /> AI Doctor Sessions
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              data-testid="ai-doctor-sessions-index-copy-link"
              aria-live="polite"
            >
              {copyStatus === "success" ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span data-testid="ai-doctor-sessions-index-copy-link-success">
                    Copied
                  </span>
                </>
              ) : copyStatus === "error" ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span data-testid="ai-doctor-sessions-index-copy-link-error">
                    Copy failed
                  </span>
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  <span>Copy link</span>
                </>
              )}
            </Button>
          </div>
          <p
            className="text-xs text-muted-foreground"
            data-testid="ai-doctor-sessions-index-helper"
          >
            Saved diagnosis snapshots. Opening a session does not re-run AI or create actions.
          </p>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <div
            className="flex flex-wrap items-end gap-3"
            data-testid="ai-doctor-sessions-index-filters"
          >
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Risk</span>
              <select
                value={filters.risk}
                onChange={(e) => updateFilter("risk", e.target.value as RiskFilter)}
                data-testid="ai-doctor-sessions-index-filter-risk"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Suggested actions</span>
              <select
                value={filters.hasActions}
                onChange={(e) =>
                  updateFilter("hasActions", e.target.value as HasActionsFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-has-actions"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Has actions</option>
                <option value="no">No actions</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Date range</span>
              <select
                value={filters.dateRange}
                onChange={(e) =>
                  updateFilter("dateRange", e.target.value as DateRangeFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-date-range"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
              </select>
            </label>
            {filtersActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="ai-doctor-sessions-index-clear-filters"
              >
                Clear filters
              </Button>
            ) : null}
          </div>

          {filtersActive ? (
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="ai-doctor-sessions-index-active-filters"
            >
              {activeLabels.map((label) => (
                <Badge
                  key={label}
                  variant="secondary"
                  className="text-[11px]"
                  data-testid="ai-doctor-sessions-index-active-filter-label"
                >
                  {label}
                </Badge>
              ))}
            </div>
          ) : null}

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
            filtersActive ? (
              <p
                className="text-muted-foreground"
                data-testid="ai-doctor-sessions-index-empty-filtered"
              >
                No sessions match these filters.
              </p>
            ) : (
              <p
                className="text-muted-foreground"
                data-testid="ai-doctor-sessions-index-empty"
              >
                No saved AI Doctor sessions yet.
              </p>
            )
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
                  onClick={() => goToPage(page - 1)}
                  data-testid="ai-doctor-sessions-index-prev"
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasMore}
                  onClick={() => goToPage(page + 1)}
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
