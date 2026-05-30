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
import { Stethoscope, Link2, Check, AlertCircle, Bookmark, Trash2, ShieldAlert, Info } from "lucide-react";
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
  buildSessionRowCautionIndicator,
  isSessionLimitedContext,
  LIMITED_CONTEXT_LABEL,
  LIMITED_CONTEXT_TITLE,
} from "@/lib/aiDoctorSessionDetailViewModel";
import {
  applyClientSideFilters,
  applyNeedsAttentionPreset,
  clearNeedsAttentionPreset,
  countNeedsAttentionVisible,
  DEFAULT_FILTERS,
  FILTER_PARAM_KEYS,
  formatActiveFilterLabels,
  isFiltersActive,
  isNeedsAttentionPresetActive,
  NEEDS_ATTENTION_PRESET_LABEL,
  parseFilters,
  parsePageParam,
  serializeFilters,
  serializePageParam,
  sessionNeedsReview,
  type CautionFilter,
  type ConfidenceFilter,
  type DateRangeFilter,
  type HasActionsFilter,
  type HasChecklistFilter,
  type NeedsReviewFilter,
  type RiskFilter,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";
import {
  addSavedView,
  exportSavedViewsToJson,
  findSavedView,
  formatSavedViewSummary,
  importSavedViewsFromJson,
  readSavedViews,
  removeSavedView,
  savedViewToSearchParams,
  writeSavedViews,
  type ImportError,
  type SavedView,
  type SaveViewError,
} from "@/lib/aiDoctorSessionsSavedViewsRules";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const needsReview = sessionNeedsReview(row);
  const caution = buildSessionRowCautionIndicator(row);
  const limitedContext = isSessionLimitedContext(row);

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
        {needsReview ? (
          <Badge
            variant="destructive"
            className="text-[11px]"
            data-testid="ai-doctor-sessions-index-needs-review-badge"
            title="High risk or suggested actions present."
            aria-label="High risk or suggested actions present."
          >
            Needs review
          </Badge>
        ) : null}
        {caution.show ? (
          <>
            <Badge
              variant="outline"
              className="text-[11px] border-amber-500/50 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1"
              data-testid="ai-doctor-sessions-index-caution-indicator"
              title={caution.description ?? caution.title}
              aria-label={`${caution.label}. ${caution.description ?? caution.title}`}
            >
              <ShieldAlert className="h-3 w-3" />
              {caution.label}
            </Badge>
            {caution.description ? (
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="ai-doctor-sessions-index-caution-reason"
              >
                {caution.description}
              </span>
            ) : null}
            {caution.checklistSummary ? (
              <span
                className="text-[11px] text-muted-foreground"
                data-testid="ai-doctor-sessions-index-caution-checklist-summary"
                title={caution.checklistDescription ?? undefined}
                aria-label={caution.checklistDescription ?? undefined}
              >
                {caution.checklistSummary}
              </span>
            ) : null}
          </>
        ) : null}
        {limitedContext ? (
          <Badge
            variant="outline"
            className="text-[11px] text-muted-foreground inline-flex items-center gap-1"
            data-testid="ai-doctor-sessions-index-limited-context-indicator"
            title={LIMITED_CONTEXT_TITLE}
            aria-label={`${LIMITED_CONTEXT_LABEL}. ${LIMITED_CONTEXT_TITLE}`}
          >
            <Info className="h-3 w-3" />
            {LIMITED_CONTEXT_LABEL}
          </Badge>
        ) : null}
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
        needsReview: searchParams.get(FILTER_PARAM_KEYS.needsReview) ?? undefined,
        caution: searchParams.get(FILTER_PARAM_KEYS.caution) ?? undefined,
        hasChecklist: searchParams.get(FILTER_PARAM_KEYS.hasChecklist) ?? undefined,
        confidence: searchParams.get(FILTER_PARAM_KEYS.confidence) ?? undefined,
      }),
    [searchParams],
  );
  const page = useMemo(
    () => parsePageParam(searchParams.get(FILTER_PARAM_KEYS.page) ?? undefined),
    [searchParams],
  );

  const { data, isLoading, error } = useAiDoctorSessionsIndex(page, filters);
  const rawRows = data?.rows ?? [];
  // Apply derived (client-side) filters: caution / hasChecklist / confidence.
  // Server-side filters (risk, hasActions, dateRange, needsReview) already
  // applied in the hook. Note: pagination reflects the raw query; rows hidden
  // by client-side filters do not regress hasMore for the next page.
  const rows = useMemo(
    () => applyClientSideFilters(rawRows, filters),
    [rawRows, filters],
  );
  const hasMore = !!data?.hasMore;
  const filtersActive = isFiltersActive(filters);
  const activeLabels = formatActiveFilterLabels(filters);
  const needsAttentionActive = isNeedsAttentionPresetActive(filters);
  const needsAttentionVisible = useMemo(
    () => countNeedsAttentionVisible(rawRows),
    [rawRows],
  );

  const writeParams = (next: SessionsIndexFilters, nextPage: number) => {
    const params = new URLSearchParams();
    // Preserve any unrelated params already on the URL.
    const managed = new Set<string>([
      FILTER_PARAM_KEYS.risk,
      FILTER_PARAM_KEYS.hasActions,
      FILTER_PARAM_KEYS.dateRange,
      FILTER_PARAM_KEYS.needsReview,
      FILTER_PARAM_KEYS.caution,
      FILTER_PARAM_KEYS.hasChecklist,
      FILTER_PARAM_KEYS.confidence,
      FILTER_PARAM_KEYS.page,
    ]);
    searchParams.forEach((value, key) => {
      if (!managed.has(key)) params.set(key, value);
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

  const applyNeedsAttention = () => {
    writeParams(applyNeedsAttentionPreset(filters), 0);
  };

  const clearNeedsAttention = () => {
    writeParams(clearNeedsAttentionPreset(filters), 0);
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

  // --- saved views (localStorage) ---
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => readSavedViews());
  const [selectedSavedViewId, setSelectedSavedViewId] = useState<string>("");
  const [savingView, setSavingView] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
  const [saveError, setSaveError] = useState<SaveViewError | null>(null);

  useEffect(() => {
    writeSavedViews(savedViews);
  }, [savedViews]);

  const applySavedView = (id: string) => {
    setSelectedSavedViewId(id);
    if (!id) return;
    const view = findSavedView(savedViews, id);
    if (!view) return;
    const next = savedViewToSearchParams(view, searchParams);
    setSearchParams(next, { replace: true });
  };

  const handleSaveView = () => {
    const result = addSavedView({
      label: pendingLabel,
      filters,
      page,
      existing: savedViews,
    });
    if (result.ok && result.views) {
      setSavedViews(result.views);
      setSavingView(false);
      setPendingLabel("");
      setSaveError(null);
    } else {
      setSaveError((result as { error: SaveViewError }).error);
    }
  };

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteView = pendingDeleteId
    ? findSavedView(savedViews, pendingDeleteId)
    : null;
  const requestDeleteSavedView = (id: string) => {
    setPendingDeleteId(id);
  };
  const cancelDeleteSavedView = () => setPendingDeleteId(null);
  const confirmDeleteSavedView = () => {
    if (!pendingDeleteId) {
      setPendingDeleteId(null);
      return;
    }
    // Fail-safe: if the view is missing (e.g. removed in another tab),
    // just refresh the in-memory list from storage and close the dialog.
    if (!findSavedView(savedViews, pendingDeleteId)) {
      setSavedViews(readSavedViews());
      setPendingDeleteId(null);
      return;
    }
    setSavedViews((prev) => removeSavedView(prev, pendingDeleteId));
    if (selectedSavedViewId === pendingDeleteId) setSelectedSavedViewId("");
    setPendingDeleteId(null);
  };

  // --- import / export ---
  const [exportStatus, setExportStatus] = useState<CopyLinkStatus>("idle");
  const exportResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleExportViews = async () => {
    if (savedViews.length === 0) {
      setExportStatus("error");
      if (exportResetRef.current) clearTimeout(exportResetRef.current);
      exportResetRef.current = setTimeout(() => setExportStatus("idle"), 2000);
      return;
    }
    const json = exportSavedViewsToJson(savedViews);
    try {
      await copyShareLink(json);
      setExportStatus("success");
    } catch {
      setExportStatus("error");
    } finally {
      if (exportResetRef.current) clearTimeout(exportResetRef.current);
      exportResetRef.current = setTimeout(() => setExportStatus("idle"), 2000);
    }
  };

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [importSummary, setImportSummary] = useState<{
    added: number;
    skipped: number;
  } | null>(null);
  const handleConfirmImport = () => {
    const result = importSavedViewsFromJson({
      raw: importText,
      existing: savedViews,
    });
    if (!result.ok) {
      setImportError((result as { error: ImportError }).error);
      setImportSummary(null);
      return;
    }
    setSavedViews(result.views ?? []);
    setImportSummary({
      added: result.added?.length ?? 0,
      skipped: result.skipped?.length ?? 0,
    });
    setImportError(null);
    setImportText("");
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
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Needs review</span>
              <select
                value={filters.needsReview}
                onChange={(e) =>
                  updateFilter("needsReview", e.target.value as NeedsReviewFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-needs-review"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Needs review</option>
                <option value="no">No review needed</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Caution</span>
              <select
                value={filters.caution}
                onChange={(e) =>
                  updateFilter("caution", e.target.value as CautionFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-caution"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Caution only</option>
                <option value="no">No caution</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Review checklist</span>
              <select
                value={filters.hasChecklist}
                onChange={(e) =>
                  updateFilter("hasChecklist", e.target.value as HasChecklistFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-has-checklist"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="yes">Has checklist</option>
                <option value="no">No checklist</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Confidence</span>
              <select
                value={filters.confidence}
                onChange={(e) =>
                  updateFilter("confidence", e.target.value as ConfidenceFilter)
                }
                data-testid="ai-doctor-sessions-index-filter-confidence"
                className="rounded border bg-background px-2 py-1 text-sm"
              >
                <option value="all">All</option>
                <option value="low">Low (≤60%)</option>
                <option value="medium">Medium (61–80%)</option>
                <option value="high">High ({'>'}80%)</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <Button
              variant={needsAttentionActive ? "secondary" : "outline"}
              size="sm"
              onClick={needsAttentionActive ? clearNeedsAttention : applyNeedsAttention}
              data-testid="ai-doctor-sessions-index-needs-attention-preset"
              aria-pressed={needsAttentionActive}
              title="Caution + review checklist"
            >
              {NEEDS_ATTENTION_PRESET_LABEL}
              {needsAttentionVisible > 0 ? (
                <span
                  className="ml-1 text-[11px] text-muted-foreground"
                  data-testid="ai-doctor-sessions-index-needs-attention-count"
                >
                  : {needsAttentionVisible} visible
                </span>
              ) : null}
            </Button>
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

          <div
            className="flex flex-wrap items-end gap-2"
            data-testid="ai-doctor-sessions-saved-views"
          >
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Saved views</span>
              <select
                value={selectedSavedViewId}
                onChange={(e) => applySavedView(e.target.value)}
                data-testid="ai-doctor-sessions-saved-views-select"
                className="rounded border bg-background px-2 py-1 text-sm"
                disabled={savedViews.length === 0}
              >
                <option value="">
                  {savedViews.length === 0 ? "No saved views" : "Apply a saved view…"}
                </option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedSavedViewId ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => requestDeleteSavedView(selectedSavedViewId)}
                data-testid="ai-doctor-sessions-saved-views-delete"
                aria-label="Delete saved view"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
            {savingView ? (
              <div
                className="flex items-end gap-2"
                data-testid="ai-doctor-sessions-saved-views-form"
              >
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Label</span>
                  <input
                    type="text"
                    value={pendingLabel}
                    onChange={(e) => {
                      setPendingLabel(e.target.value);
                      setSaveError(null);
                    }}
                    data-testid="ai-doctor-sessions-saved-views-label-input"
                    className="rounded border bg-background px-2 py-1 text-sm"
                    autoFocus
                  />
                </label>
                <Button
                  size="sm"
                  onClick={handleSaveView}
                  data-testid="ai-doctor-sessions-saved-views-confirm"
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSavingView(false);
                    setPendingLabel("");
                    setSaveError(null);
                  }}
                  data-testid="ai-doctor-sessions-saved-views-cancel"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSavingView(true);
                  setSaveError(null);
                }}
                data-testid="ai-doctor-sessions-saved-views-open"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Save view
              </Button>
            )}
            {saveError ? (
              <span
                className="text-xs text-destructive"
                data-testid="ai-doctor-sessions-saved-views-error"
              >
                {saveError === "empty-label"
                  ? "Enter a label."
                  : saveError === "label-too-long"
                    ? "Label is too long."
                    : saveError === "duplicate-label"
                      ? "A saved view with that name already exists."
                      : saveError === "duplicate-params"
                        ? "These exact filters are already saved."
                        : "Saved view limit reached."}
              </span>
            ) : null}
          </div>

          <div
            className="flex flex-wrap items-start gap-2"
            data-testid="ai-doctor-sessions-saved-views-portability"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportViews}
              data-testid="ai-doctor-sessions-saved-views-export"
              aria-live="polite"
              disabled={savedViews.length === 0 && exportStatus === "idle"}
            >
              {exportStatus === "success" ? (
                <span data-testid="ai-doctor-sessions-saved-views-export-success">
                  Copied
                </span>
              ) : exportStatus === "error" ? (
                <span data-testid="ai-doctor-sessions-saved-views-export-error">
                  Export failed
                </span>
              ) : (
                <span>Export views</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setImportOpen((v) => !v);
                setImportError(null);
                setImportSummary(null);
              }}
              data-testid="ai-doctor-sessions-saved-views-import-toggle"
            >
              {importOpen ? "Close import" : "Import views"}
            </Button>
          </div>

          {importOpen ? (
            <div
              className="flex flex-col gap-2 rounded border bg-card/40 p-2"
              data-testid="ai-doctor-sessions-saved-views-import-panel"
            >
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">
                  Paste exported saved views JSON
                </span>
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setImportError(null);
                  }}
                  data-testid="ai-doctor-sessions-saved-views-import-textarea"
                  className="rounded border bg-background px-2 py-1 text-xs font-mono min-h-[6rem]"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirmImport}
                  data-testid="ai-doctor-sessions-saved-views-import-confirm"
                >
                  Import
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setImportOpen(false);
                    setImportText("");
                    setImportError(null);
                    setImportSummary(null);
                  }}
                  data-testid="ai-doctor-sessions-saved-views-import-cancel"
                >
                  Cancel
                </Button>
              </div>
              {importError ? (
                <span
                  className="text-xs text-destructive"
                  data-testid="ai-doctor-sessions-saved-views-import-error"
                >
                  {importError === "empty-input"
                    ? "Paste JSON to import."
                    : importError === "invalid-json"
                      ? "That isn't valid JSON."
                      : importError === "wrong-shape"
                        ? "JSON shape isn't a saved-views export."
                        : "No valid views to import."}
                </span>
              ) : null}
              {importSummary ? (
                <span
                  className="text-xs text-muted-foreground"
                  data-testid="ai-doctor-sessions-saved-views-import-success"
                >
                  Imported {importSummary.added} view
                  {importSummary.added === 1 ? "" : "s"}
                  {importSummary.skipped > 0
                    ? ` · skipped ${importSummary.skipped}`
                    : ""}
                  .
                </span>
              ) : null}
            </div>
          ) : null}





          {filtersActive ? (
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="ai-doctor-sessions-index-active-filters"
            >
              {needsAttentionActive ? (
                <Badge
                  variant="default"
                  className="text-[11px]"
                  data-testid="ai-doctor-sessions-index-needs-attention-badge"
                >
                  {NEEDS_ATTENTION_PRESET_LABEL}
                </Badge>
              ) : null}
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

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) cancelDeleteSavedView();
        }}
      >
        <AlertDialogContent data-testid="ai-doctor-sessions-saved-views-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved view?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteView ? (
                <>
                  <span
                    className="font-medium text-foreground"
                    data-testid="ai-doctor-sessions-saved-views-delete-dialog-label"
                  >
                    {pendingDeleteView.label}
                  </span>
                  <br />
                  <span data-testid="ai-doctor-sessions-saved-views-delete-dialog-summary">
                    {formatSavedViewSummary(
                      pendingDeleteView.filters,
                      pendingDeleteView.page,
                    )}
                  </span>
                </>
              ) : (
                <span data-testid="ai-doctor-sessions-saved-views-delete-dialog-missing">
                  This saved view is no longer available.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-testid="ai-doctor-sessions-saved-views-delete-dialog-cancel"
              onClick={cancelDeleteSavedView}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="ai-doctor-sessions-saved-views-delete-dialog-confirm"
              onClick={confirmDeleteSavedView}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
