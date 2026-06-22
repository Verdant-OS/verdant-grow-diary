import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useGrows } from "@/store/grows";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X, FlaskConical, ListChecks, History, CheckCircle2, Ban, RefreshCw } from "lucide-react";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import {
  buildActionRowAriaLabel,
  buildActionButtonAriaLabel,
  buildStatusBadgeAriaLabel,
  sanitizeActionCopy,
  formatActionTargetLabel,
  APPROVE_DIALOG_REASSURANCE,
} from "@/lib/actionQueueRowView";
import {
  buildActionEvidenceViewModel,
  ACTION_QUEUE_EMPTY_PENDING_TITLE,
  ACTION_QUEUE_EMPTY_PENDING_HELP,
  type ActionEvidenceViewModel,
} from "@/lib/actionQueueEvidenceViewModel";
import { formatLastUpdatedAgo } from "@/lib/lastUpdatedAgo";

import { actionDetailPath, actionsPath, aiDoctorSessionDetailPath, alertDetailPath } from "@/lib/routes";
import ActionQueueDetailDrawer from "@/components/ActionQueueDetailDrawer";
import ActionQueueLoadingSkeleton from "@/components/ActionQueueLoadingSkeleton";
import ActionQueueTraceStatusAnnouncer from "@/components/ActionQueueTraceStatusAnnouncer";
import {
  buildActionQueueTraceDraft,
  buildActionQueueTraceIdempotencyKey,
  type ActionQueueTraceKind,
} from "@/lib/actionQueueTimelineTraceRules";
import {
  buildActionQueueStatusHistory,
  type ActionQueueStatusHistoryEntry,
  type DiaryTraceRowLike,
} from "@/lib/actionQueueStatusHistoryRules";
import { toast } from "sonner";
import {
  type ActionStatus,
  type ActionEventType,
  type TransitionKind,
  isTerminalStatus,
  canComplete,
  canCancel,
  buildTransitionPatch,
  
  eventTypeFor,
  nextStatusFor,
  normalizeNote,
} from "@/lib/actionQueueTransitions";
import {
  ACTION_QUEUE_SOURCE_VALUES,
  getActionQueueSourceLabel,
  isAlertDerived,
  isAiDoctorDerived,
  extractSourceAiDoctorSessionId,
  extractSourceAlertId,
  stripBackPointerTokens,
} from "@/lib/actionQueueProvenanceRules";
import { buildActionQueueGrowContextHint } from "@/lib/actionQueueGrowContextHintRules";
import {
  parseAlertContextParam,
  filterActionsByAlertContext,
} from "@/lib/actionQueueAlertContextFilter";
import {
  deriveActionTraceBadgeState,
  ACTION_TRACE_BADGE_LABEL,
  ACTION_TRACE_BADGE_HELP,
  type ActionTraceBadgeState,
} from "@/lib/actionQueueTraceStatusRules";
import {
  buildActionDiaryTraceLink,
  buildJumpToHighlightedTraceLink,
  JUMP_TO_HIGHLIGHTED_TRACE_TESTID,
  TIMELINE_TRACE_UNAVAILABLE_COPY,
} from "@/lib/actionQueueTimelineLinkRules";
import {
  applyActionQueueListPipeline,
  type ActionListExtraFilter,
} from "@/lib/actionQueueFilterRules";
import {
  buildRetryTraceViewModel,
} from "@/lib/actionQueueRetryTraceViewModel";
import {
  paginateActionQueue,
  ACTION_QUEUE_PAGE_SIZE_OPTIONS,
  ACTION_QUEUE_DEFAULT_PAGE_SIZE,
  type ActionQueuePageSize,
} from "@/lib/actionQueuePaginationRules";
import {
  parseActionQueueUrlState,
  serializeActionQueueUrlState,
  ACTION_QUEUE_URL_DEFAULTS,
  ACTION_QUEUE_URL_KEYS,
} from "@/lib/actionQueueUrlStateRules";

import { Input } from "@/components/ui/input";






type Status = ActionStatus;
type EventType = ActionEventType;

type StatusFilter = "all" | "pending" | "simulated" | "approved" | "rejected" | "completed" | "cancelled";
type RiskFilter = "all" | "low" | "medium" | "high" | "critical";
type SourceFilter =
  | "all"
  | typeof ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT
  | typeof ACTION_QUEUE_SOURCE_VALUES.AI_COACH
  | typeof ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR
  | typeof ACTION_QUEUE_SOURCE_VALUES.MANUAL;


type SortOrder = "newest" | "oldest" | "risk";


interface ActionRow {
  id: string;
  grow_id: string;
  tent_id: string | null;
  plant_id: string | null;
  source: string;
  action_type: string;
  target_metric: string | null;
  target_device: string | null;
  suggested_change: string;
  reason: string;
  risk_level: "low" | "medium" | "high" | "critical";
  status: Status;
  approved_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface EventRow {
  id: string;
  action_queue_id: string;
  event_type: EventType;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
}

const RISK_VARIANT: Record<ActionRow["risk_level"], string> = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
};

const RISK_RANK: Record<ActionRow["risk_level"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Read-only AI Doctor session back-link affordance. Renders nothing when
 * the row is not AI Doctor-derived or when no safe session id can be parsed
 * from the reason. Never exposes raw `[session:<id>]` tokens or device fields.
 */
function AiDoctorSessionLink({
  row,
}: {
  row: Pick<ActionRow, "source" | "reason">;
}) {
  if (!isAiDoctorDerived(row)) return null;
  const sessionId = extractSourceAiDoctorSessionId(row.reason);
  if (!sessionId) return null;
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="action-queue-row-ai-doctor-session-link"
    >
      <span>Linked from AI Doctor</span>
      <Link
        to={aiDoctorSessionDetailPath(sessionId)}
        className="text-primary hover:underline"
        data-testid="action-queue-row-ai-doctor-session-link-anchor"
      >
        View saved AI Doctor session
      </Link>
    </span>
  );
}

/**
 * Read-only originating-alert back-link affordance. Renders nothing when the
 * row has no safe `[alert:<id>]` token. Never exposes raw tokens or device
 * fields.
 */
function LinkedAlertLink({
  row,
}: {
  row: Pick<ActionRow, "reason">;
}) {
  const alertId = extractSourceAlertId(row.reason);
  if (!alertId) return null;
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="action-queue-row-linked-alert"
    >
      <span>Linked alert</span>
      <Link
        to={alertDetailPath(alertId)}
        className="text-primary hover:underline"
        data-testid="action-queue-row-linked-alert-anchor"
      >
        View linked alert
      </Link>
    </span>
  );
}

const EVIDENCE_TONE_VARIANT: Record<ActionEvidenceViewModel["rowEvidenceStatusTone"], string> = {
  ok: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  neutral: "text-muted-foreground border-border/60",
  caution: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

/**
 * Compact evidence-status badge for Action Queue rows.
 * Scan-friendly: growers see at a glance whether evidence is available,
 * unavailable, or missing — without raw payloads, IDs, or automation copy.
 */
function EvidenceStatusBadge({ vm }: { vm: ActionEvidenceViewModel }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge
        variant="outline"
        className={`text-[10px] uppercase ${EVIDENCE_TONE_VARIANT[vm.rowEvidenceStatusTone]}`}
        data-testid={`action-queue-row-evidence-status-${vm.rowEvidenceStatus}`}
        aria-label={`Evidence: ${vm.rowEvidenceStatusLabel}. ${vm.rowEvidenceStatusHelp}`}
        title={vm.rowEvidenceStatusHelp}
      >
        {vm.rowEvidenceStatusLabel}
      </Badge>
      <span className="sr-only">{vm.rowEvidenceStatusHelp}</span>
    </span>
  );
}






const TRACE_BADGE_VARIANT: Record<ActionTraceBadgeState, string> = {
  idle: "text-muted-foreground border-border/60",
  retrying: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
};

function TraceStatusBadge({ state }: { state: ActionTraceBadgeState }) {
  const label = ACTION_TRACE_BADGE_LABEL[state];
  const help = ACTION_TRACE_BADGE_HELP[state];
  return (
    <Badge
      variant="outline"
      className={`text-[10px] uppercase ${TRACE_BADGE_VARIANT[state]}`}
      data-testid={`action-queue-row-trace-badge-${state}`}
      data-trace-state={state}
      aria-label={`${label}. ${help}`}
      title={help}
    >
      {label}
    </Badge>
  );
}

/**
 * RetryTraceFailureRegion — calm, trace-specific failure banner for a
 * single row. Renders nothing unless this row's diary trace insert is
 * known to have failed. The retry button only repairs the trace; it
 * NEVER repeats the approve/reject status update.
 */
function RetryTraceFailureRegion({
  row,
  traceFailure,
  retrying,
  onRetry,
}: {
  row: { id: string };
  traceFailure: { actionId: string; kind: ActionQueueTraceKind } | null;
  retrying: boolean;
  onRetry: (row: { id: string }, kind: ActionQueueTraceKind) => void;
}) {
  const isThisRow = !!traceFailure && traceFailure.actionId === row.id;
  const vm = buildRetryTraceViewModel({
    traceFailed: isThisRow,
    retrying: isThisRow && retrying,
  });
  if (!vm.showFailureRegion) return null;
  return (
    <div
      role="alert"
      data-testid="action-queue-row-retry-trace-region"
      data-trace-state={vm.state}
      className="mt-2 flex flex-wrap items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-foreground"
    >
      <div className="flex-1 space-y-1">
        {vm.explanationLines.map((line, i) => (
          <p
            key={i}
            data-testid={
              i === 0
                ? "action-queue-row-retry-trace-explain-primary"
                : "action-queue-row-retry-trace-explain-secondary"
            }
          >
            {line}
          </p>
        ))}
      </div>
      {!vm.buttonHidden && vm.buttonLabel && (
        <Button
          size="sm"
          variant="outline"
          disabled={vm.buttonDisabled}
          onClick={() => {
            if (traceFailure) onRetry(row, traceFailure.kind);
          }}
          data-testid="action-queue-row-retry-trace-button"
          aria-label="Retry diary trace"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {vm.buttonLabel}
        </Button>
      )}
    </div>
  );
}


export default function ActionQueue() {

  const { user } = useAuth();
  const { grows, activeGrowId, activeGrow } = useGrows();
  // Shared URL `?growId=` resolution against RLS-loaded grows. urlGrowId precedence
  // over activeGrowId is preserved exactly as before.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();

  const effectiveGrowId = urlGrowId ?? activeGrowId;
  // URL provided a grow id, but it does not resolve to a grow the viewer
  // owns. Showing every action would be misleading — render a calm prompt.
  const hasInvalidScope = !!urlGrowId && !isValidScopedGrow;
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [events, setEvents] = useState<Record<string, EventRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteDialog, setNoteDialog] = useState<
    { row: ActionRow; kind: "approve" | "reject" | "simulate" | "complete" | "cancel" } | null
  >(null);
  const [noteDraft, setNoteDraft] = useState("");

  // Slide-over drawer that explains a single Action Queue item.
  // Presenter-only state. Opening it never triggers a write or AI call.
  const [drawerRow, setDrawerRow] = useState<ActionRow | null>(null);
  const [drawerHistory, setDrawerHistory] = useState<
    ActionQueueStatusHistoryEntry[] | null
  >(null);
  const [drawerHistoryLoading, setDrawerHistoryLoading] = useState(false);
  const [traceFailure, setTraceFailure] = useState<
    { actionId: string; kind: ActionQueueTraceKind } | null
  >(null);
  const [retryingTrace, setRetryingTrace] = useState(false);

  // Load existing approve/reject diary trace rows for the open drawer
  // row. Pure read; never inserts.
  const loadDrawerHistory = useCallback(
    async (row: ActionRow) => {
      if (!user) return;
      setDrawerHistoryLoading(true);
      const { data } = await supabase
        .from("diary_entries")
        .select("id, entry_at, created_at, note, details")
        .eq("user_id", user.id)
        .eq("grow_id", row.grow_id)
        .contains("details", { action_id: row.id, kind: "action_queue_trace" });
      setDrawerHistory(
        buildActionQueueStatusHistory(
          (data as DiaryTraceRowLike[] | null) ?? [],
          row.id,
        ),
      );
      setDrawerHistoryLoading(false);
    },
    [user],
  );

  // When a drawer row opens, fetch its status history once.
  useEffect(() => {
    if (!drawerRow) {
      setDrawerHistory(null);
      setDrawerHistoryLoading(false);
      return;
    }
    void loadDrawerHistory(drawerRow);
  }, [drawerRow, loadDrawerHistory]);

  // URL is the source of truth for search/status/trace/page/pageSize.
  // We initialize local state from it on mount and mirror state→URL via
  // a single replace-history effect below (no extra history entries).
  const [searchParams, setSearchParams] = useSearchParams();
  // Read once on mount; subsequent URL→state syncs are handled explicitly.
  const initialUrlState = useMemo(
    () => parseActionQueueUrlState(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialUrlState.status as StatusFilter,
  );
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  // Pure presenter state. Search is case-insensitive, client-side, and
  // never reaches payload bytes or hidden metadata.
  const [searchQuery, setSearchQuery] = useState<string>(initialUrlState.q);
  const [traceExtraFilter, setTraceExtraFilter] = useState<ActionListExtraFilter>(
    initialUrlState.trace === "failed" ? "trace_failed" : "none",
  );
  const [page, setPage] = useState<number>(initialUrlState.page);
  const [pageSize, setPageSize] = useState<ActionQueuePageSize>(
    initialUrlState.pageSize,
  );


  // Deep-link focus: /actions?focus=<action_id>. Presenter-only; never mutates rows.

  const focusedActionId = searchParams.get("focus");

  // Alert context chip + client-side filter: /actions?alert=<alert_id>.
  // Presenter-only; never mutates rows or hits the DB.
  const rawAlertParam = searchParams.get("alert");
  const alertContextId = parseAlertContextParam(rawAlertParam);

  // Optional safe jump affordance when /actions is opened with
  // ?highlight=action-queue:<id>:<approved|rejected>. Presenter-only;
  // never mutates state, never re-runs approve/reject, never inserts.
  const rawHighlightParam = searchParams.get("highlight");
  const jumpHighlightLink = useMemo(
    () => buildJumpToHighlightedTraceLink(rawHighlightParam, searchParams),
    [rawHighlightParam, searchParams],
  );


  const clearFocus = useCallback(() => {
    // Remove ONLY the `focus` query param. Preserve every other param
    // (filters, search, status tabs, pagination, growId, etc.).
    const next = new URLSearchParams(searchParams);
    next.delete("focus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearAlertContext = useCallback(() => {
    // Remove ONLY the `alert` query param. Preserve `focus`, filters,
    // search, growId, pagination, etc.
    const next = new URLSearchParams(searchParams);
    next.delete("alert");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);







  const load = useCallback(async () => {
    if (!user) return;
    // Distinguish initial load from background refetch so existing rows
    // are never cleared/replaced by a skeleton. Refresh is presenter-only
    // — it never fakes data and never blocks approval controls.
    if (hasLoadedOnceRef.current) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    const q = supabase
      .from("action_queue")
      .select(
        "id,grow_id,tent_id,plant_id,source,action_type,target_metric,target_device,suggested_change,reason,risk_level,status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    const { data, error } = effectiveGrowId ? await q.eq("grow_id", effectiveGrowId) : await q;
    if (error) {
      toast.error(error.message);
    } else {
      setLastUpdatedAt(Date.now());
    }
    const list = (data ?? []) as ActionRow[];
    setRows(list);

    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data: evs } = await supabase
        .from("action_queue_events")
        .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at")
        .in("action_queue_id", ids)
        .order("created_at", { ascending: false });
      const grouped: Record<string, EventRow[]> = {};
      for (const e of (evs ?? []) as EventRow[]) {
        (grouped[e.action_queue_id] ||= []).push(e);
      }
      setEvents(grouped);
    } else {
      setEvents({});
    }
    setLoading(false);
    setIsRefreshing(false);
    hasLoadedOnceRef.current = true;
  }, [user, effectiveGrowId]);

  // Reset the initial-load gate when grow scope changes so the user gets
  // the full skeleton (not just a subtle refresh) on a scope switch.
  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setLastUpdatedAt(null);
  }, [effectiveGrowId]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep-link focus: after rows render, scroll the matching row into view.
  // Best-effort; if the id is unknown or scrollIntoView is unavailable, we
  // render normally without errors. Read-only — never changes status.
  useEffect(() => {
    if (!focusedActionId || loading) return;
    if (typeof document === "undefined") return;
    const escape =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape
        : (s: string) => s.replace(/"/g, '\\"');
    const el = document.querySelector(
      `[data-action-id="${escape(focusedActionId)}"]`,
    ) as HTMLElement | null;
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [focusedActionId, loading, rows.length]);

  // Reset to page 1 whenever search/filters/page size change. Skip the
  // very first run so an initial ?page=N from the URL is preserved.
  const filterResetSkipRef = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filterResetSkipRef.current) {
      filterResetSkipRef.current = false;
      return;
    }
    setPage(1);
  }, [searchQuery, statusFilter, traceExtraFilter, pageSize]);


  // Mirror state → URL via replace-history so typing doesn't spam the
  // back stack. Unrelated params (growId, focus, alert, sensorSources…)
  // are preserved by serializeActionQueueUrlState.
  useEffect(() => {
    const urlStatus = (statusFilter as string) === "pending"
      ? "pending"
      : (statusFilter as string);
    const next = serializeActionQueueUrlState(searchParams, {
      q: searchQuery,
      status: urlStatus as typeof ACTION_QUEUE_URL_DEFAULTS.status,
      trace: traceExtraFilter === "trace_failed" ? "failed" : "all",
      page,
      pageSize,
    });
    // Only write when something actually changes — avoids replace loops.
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, statusFilter, traceExtraFilter, page, pageSize]);






  // SECURITY: never sends device commands. Inserts an audit row ONLY.
  // user_id is left to DB default auth.uid(). No privileged backend role.
  async function logEvent(
    row: ActionRow,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ): Promise<boolean> {
    const { error } = await supabase.from("action_queue_events").insert({
      action_queue_id: row.id,
      grow_id: row.grow_id,
      event_type,
      previous_status: row.status,
      new_status,
      note: note ?? null,
    });
    if (error) {
      toast.warning("Status updated, but audit log failed", {
        description: error.message,
      });
      return false;
    }
    return true;
  }

  /**
   * Idempotent timeline trace for approve/reject transitions.
   *
   * Returns `true` on success (or when an existing row was found via
   * the idempotency probe) and `false` on insert failure. Callers use
   * the boolean to surface a retry affordance — the approval/rejection
   * itself is never rolled back.
   *
   * NEVER includes device commands, raw payloads, service-role context,
   * or internal back-pointer tokens.
   */
  async function writeTimelineTrace(
    row: ActionRow,
    kind: ActionQueueTraceKind,
  ): Promise<boolean> {
    if (!user) return false;
    const key = buildActionQueueTraceIdempotencyKey(row.id, kind);
    // Idempotency probe: skip if a trace row with this key already exists.
    const probe = await supabase
      .from("diary_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("grow_id", row.grow_id)
      .contains("details", { idempotency_key: key })
      .limit(1);
    if (Array.isArray(probe.data) && probe.data.length > 0) return true;
    const draft = buildActionQueueTraceDraft({
      action_id: row.id,
      user_id: user.id,
      grow_id: row.grow_id,
      tent_id: row.tent_id,
      plant_id: row.plant_id,
      action_type: row.action_type,
      suggested_change: row.suggested_change,
      reason: row.reason,
      source: row.source,
      kind,
    });
    // Cast: `details` is a structured presenter-built object; Supabase
    // generated types want a `Json`-shaped record. Shape is asserted by
    // the pure helper's tests.
    const insertPayload = {
      ...draft,
      details: draft.details as unknown as Record<string, unknown>,
    };
    const { error } = await supabase
      .from("diary_entries")
      .insert(insertPayload as never);
    return !error;
  }

  /**
   * Surface a clear, retry-able warning when the approval/rejection
   * succeeded but the timeline trace insert failed. Status update is
   * NEVER repeated by the retry — only the trace insert is.
   */
  function reportTraceFailure(row: ActionRow, kind: ActionQueueTraceKind) {
    setTraceFailure({ actionId: row.id, kind });
    toast.warning("Status saved, but timeline trace failed", {
      description: "Tap Retry trace in the action details to try again.",
      action: {
        label: "Retry trace",
        onClick: () => {
          void retryTimelineTrace(row, kind);
        },
      },
    });
  }

  async function retryTimelineTrace(
    row: ActionRow,
    kind: ActionQueueTraceKind,
  ) {
    if (retryingTrace) return;
    setRetryingTrace(true);
    const ok = await writeTimelineTrace(row, kind);
    setRetryingTrace(false);
    if (ok) {
      setTraceFailure(null);
      toast.success("Timeline trace recorded");
      if (drawerRow && drawerRow.id === row.id) {
        await loadDrawerHistory(row);
      }
    } else {
      // Calm error copy; do not duplicate the trace row.
      toast.error("Timeline trace still failing");
    }
  }

  async function transition(
    row: ActionRow,
    next: Partial<ActionRow>,
    event_type: EventType,
    new_status: Status,
    note?: string,
  ) {
    setBusyId(row.id);
    const { error } = await supabase
      .from("action_queue")
      .update(next)
      .eq("id", row.id);
    if (error) {
      setBusyId(null);
      toast.error(error.message);
      return;
    }
    await logEvent(row, event_type, new_status, note);
    let traceKind: ActionQueueTraceKind | null = null;
    if (new_status === "approved") traceKind = "approved";
    else if (new_status === "rejected") traceKind = "rejected";
    if (traceKind) {
      const ok = await writeTimelineTrace(row, traceKind);
      if (!ok) reportTraceFailure(row, traceKind);
      else setTraceFailure((prev) => (prev?.actionId === row.id ? null : prev));
    }
    setBusyId(null);
    await load();
    if (drawerRow && drawerRow.id === row.id) {
      await loadDrawerHistory(row);
    }
  }


  function openNoteDialog(row: ActionRow, kind: TransitionKind) {
    // SECURITY: terminal states cannot be transitioned again.
    if (isTerminalStatus(row.status)) return;
    setNoteDraft("");
    setNoteDialog({ row, kind });
  }

  // SECURITY: each branch only flips status + writes audit. No device commands.
  async function confirmNoteDialog() {
    if (!noteDialog) return;
    const { row, kind } = noteDialog;
    const note = normalizeNote(noteDraft);
    setNoteDialog(null);
    setNoteDraft("");

    if (kind === "simulate") {
      // Simulation NEVER sends device commands. Status + audit only.
      toast.message("Simulated (no device command sent)", {
        description: `${row.action_type} → ${formatActionTargetLabel(row.target_metric, row.target_device)}`,
      });
    }
    const patch = buildTransitionPatch(kind);
    await transition(row, patch, eventTypeFor(kind), nextStatusFor(kind), note);
  }

  function cancelNoteDialog() {
    // No status change, no audit event written.
    setNoteDialog(null);
    setNoteDraft("");
  }

  function approve(row: ActionRow) { return openNoteDialog(row, "approve"); }
  function reject(row: ActionRow) { return openNoteDialog(row, "reject"); }
  function simulate(row: ActionRow) { return openNoteDialog(row, "simulate"); }
  function complete(row: ActionRow) { return openNoteDialog(row, "complete"); }
  function cancelAction(row: ActionRow) { return openNoteDialog(row, "cancel"); }


  const DIALOG_META = {
    approve: {
      title: "Approve Action",
      description:
        "Approved actions are recorded for future manual or controlled execution. No equipment command is sent. " +
        APPROVE_DIALOG_REASSURANCE,
      label: "Approval note",
      placeholder: "Optional — why are you approving?",
      confirmLabel: "Approve",
    },
    reject: {
      title: "Reject Action",
      description: "Reject this suggestion. No equipment command is sent.",
      label: "Rejection reason",
      placeholder: "Optional — why are you rejecting?",
      confirmLabel: "Reject",
    },
    simulate: {
      title: "Simulate Action",
      description: "Marks the action as simulated. No equipment command is sent.",
      label: "Simulation note",
      placeholder: "Optional — what did you simulate?",
      confirmLabel: "Simulate",
    },
    complete: {
      title: "Mark Action Complete",
      description:
        "Marks this action as manually completed outside Verdant. No equipment command is sent.",
      label: "Completion note",
      placeholder: "Optional — what did you do?",
      confirmLabel: "Mark Complete",
    },
    cancel: {
      title: "Cancel Action",
      description:
        "Cancels this action. The grower decided not to proceed. No equipment command is sent.",
      label: "Cancellation reason",
      placeholder: "Optional — why are you cancelling?",
      confirmLabel: "Cancel Action",
    },
  } as const;
  const meta = noteDialog ? DIALOG_META[noteDialog.kind] : null;



  const filtered = useMemo(() => {
    const matchesStatus = (s: Status) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return s === "pending_approval";
      return s === statusFilter;
    };
    // Alert context narrowing happens first so downstream filters/sorts
    // compose with the already-narrowed list.
    const scoped = filterActionsByAlertContext(rows, alertContextId);
    const list = scoped
      .filter((r) => matchesStatus(r.status))
      .filter((r) => riskFilter === "all" || r.risk_level === riskFilter)
      .filter((r) => sourceFilter === "all" || (r.source ?? "") === sourceFilter);
    // Compose: trace-failed filter first, then search match.
    const piped = applyActionQueueListPipeline({
      rows: list,
      query: searchQuery,
      traceFilter: traceExtraFilter,
      traceFailure: traceFailure ? { actionId: traceFailure.actionId } : null,
      lookups: {
        sourceLabelFor: (r) => getActionQueueSourceLabel(r as ActionRow),
      },
    });
    const sorted = [...piped].sort((a, b) => {
      if (sortOrder === "risk") return RISK_RANK[b.risk_level] - RISK_RANK[a.risk_level];
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? ta - tb : tb - ta;
    });
    return sorted;
  }, [rows, alertContextId, statusFilter, riskFilter, sourceFilter, sortOrder, searchQuery, traceExtraFilter, traceFailure]);


  // Pagination is applied to the merged `filtered` list AFTER existing
  // status/risk/source/alert + search/trace filters. Deterministic.
  const paginated = useMemo(
    () => paginateActionQueue(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  const visibleRows = paginated.items;
  const pending = useMemo(
    () => visibleRows.filter((r) => r.status === "pending_approval"),
    [visibleRows],
  );
  const reviewed = useMemo(
    () => visibleRows.filter((r) => r.status !== "pending_approval"),
    [visibleRows],
  );



  const filtersActive =
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    sourceFilter !== "all" ||
    sortOrder !== "newest" ||
    traceExtraFilter !== "none" ||
    searchQuery.trim() !== "";



  // AUD-008: deterministic grow-context hint built from URL scope, active
  // grow, and the RLS-visible grows list. Never changes which actions are
  // loaded — only describes the current scope.
  const growContextHint = buildActionQueueGrowContextHint({
    urlGrowId,
    activeGrowId,
    activeGrowName: activeGrow?.name ?? null,
    scopedGrowName,
    grows,
  });

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Action Queue" section="actions" />
      {/*
        One-Tent Loop landing framing. Presenter-only. Makes the /actions
        surface read clearly as the approval-required Action Queue step.
        No automation, no AI calls, no device control, no writes.
      */}
      <div
        data-testid="one-tent-loop-action-queue-landing"
        className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
      >
        <h2
          className="text-sm font-semibold text-foreground"
          data-testid="one-tent-loop-action-queue-landing-title"
        >
          Approval-required Action Queue
        </h2>
        <p
          className="text-xs text-muted-foreground mt-1"
          data-testid="one-tent-loop-action-queue-landing-subtitle"
        >
          Review suggested actions before taking anything into the grow room.
        </p>
        <p
          className="text-[11px] text-muted-foreground mt-1"
          data-testid="one-tent-loop-action-queue-landing-note"
        >
          Verdant suggests. Grower approves.
        </p>
      </div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          Action Queue
          <Button
            size="sm"
            variant="ghost"
            onClick={load}
            disabled={loading || isRefreshing}
            aria-label="Refresh Action Queue"
            data-testid="action-queue-refresh-button"
            className="ml-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>Refresh</span>
          </Button>
        </h1>
        <p className="text-sm text-muted-foreground">
          Suggestions are <span className="text-foreground">approval-gated</span>.
          Verdant never sends commands to equipment.
        </p>
        {lastUpdatedAt !== null && (
          <p
            className="text-[11px] text-muted-foreground mt-1"
            data-testid="action-queue-last-updated"
            aria-label={formatLastUpdatedAgo(lastUpdatedAt, Date.now())}
          >
            {formatLastUpdatedAgo(lastUpdatedAt, Date.now())}
          </p>
        )}
        <div
          className="mt-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
          data-testid="action-queue-grow-context-hint"
          data-context-kind={growContextHint.kind}
          data-is-scoped={growContextHint.isScoped ? "1" : "0"}
        >
          <p className="text-xs text-foreground" data-testid="action-queue-grow-context-message">
            {growContextHint.message}
          </p>
          {growContextHint.helper && (
            <p
              className="text-[11px] text-muted-foreground mt-1"
              data-testid="action-queue-grow-context-helper"
            >
              {growContextHint.helper}
            </p>
          )}
        </div>
      </div>

      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="actions"
          clearHref={actionsPath()}
          backHref={backHref}
        />
      )}

      {focusedActionId && (
        <div
          className="glass rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3"
          data-testid="action-queue-focus-chip"
          role="status"
          aria-live="polite"
        >
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-primary text-primary"
          >
            Focused action
          </Badge>
          <span className="text-xs text-muted-foreground">
            Showing linked Action Queue item.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFocus}
            className="ml-auto"
            data-testid="action-queue-clear-focus"
          >
            Clear focus
          </Button>
        </div>
      )}

      {jumpHighlightLink && (
        <div
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <span className="text-xs text-muted-foreground">
            Highlighted diary trace available.
          </span>
          <Link
            to={jumpHighlightLink.href}
            className="text-xs text-primary hover:underline"
            data-testid={JUMP_TO_HIGHLIGHTED_TRACE_TESTID}
          >
            {jumpHighlightLink.label}
          </Link>
        </div>
      )}

      {alertContextId && (
        <div
          className="glass rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3"
          data-testid="action-queue-alert-context-chip"
          role="status"
          aria-live="polite"
        >
          <Badge
            variant="outline"
            className="text-[10px] uppercase border-primary text-primary"
          >
            Filtered by alert
          </Badge>
          <Link
            to={alertDetailPath(alertContextId)}
            className="text-xs underline text-primary"
            data-testid="action-queue-alert-context-back-link"
          >
            Back to alert
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={clearAlertContext}
            className="ml-auto"
            data-testid="action-queue-clear-alert-context"
          >
            Clear alert filter
          </Button>
        </div>
      )}




      <div
        className="glass rounded-2xl p-3 mb-4 flex flex-wrap gap-2"
        aria-label="Action queue filters"
      >
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-[150px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="simulated">Simulated</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskFilter)}>
          <SelectTrigger className="h-9 w-[140px]" aria-label="Risk filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All risks</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Source filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT}>Environment Alerts</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.AI_COACH}>AI Coach</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR}>AI Doctor</SelectItem>
            <SelectItem value={ACTION_QUEUE_SOURCE_VALUES.MANUAL}>Manual</SelectItem>

          </SelectContent>
        </Select>




        <Select value={traceExtraFilter} onValueChange={(v) => setTraceExtraFilter(v as ActionListExtraFilter)}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Trace filter" data-testid="action-queue-trace-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">All trace states</SelectItem>
            <SelectItem value="trace_failed">Trace failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
          <SelectTrigger className="h-9 w-[170px]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="risk">Highest risk first</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search actions…"
          aria-label="Search actions"
          data-testid="action-queue-search-input"
          className="h-9 w-full sm:w-[220px]"
        />
      </div>

      {/* Pagination controls. Pure presenter; no writes, no AI calls. */}
      <div
        className="glass rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-3 text-xs"
        data-testid="action-queue-pagination"
        role="navigation"
        aria-label="Action queue pagination"
      >
        <span
          className="text-muted-foreground"
          data-testid="action-queue-pagination-range"
        >
          {paginated.totalItems === 0
            ? "0 of 0"
            : `Showing ${paginated.rangeStart}–${paginated.rangeEnd} of ${paginated.totalItems}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-muted-foreground">
            <span>Per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const n = Number.parseInt(v, 10);
                if (ACTION_QUEUE_PAGE_SIZE_OPTIONS.includes(n as ActionQueuePageSize)) {
                  setPageSize(n as ActionQueuePageSize);
                }
              }}
            >
              <SelectTrigger
                className="h-8 w-[80px]"
                aria-label="Page size"
                data-testid="action-queue-page-size"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_QUEUE_PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            size="sm"
            variant="ghost"
            disabled={!paginated.hasPrev}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Previous page"
            data-testid="action-queue-pagination-prev"
          >
            Previous
          </Button>
          <span
            className="text-muted-foreground tabular-nums"
            data-testid="action-queue-pagination-page-indicator"
          >
            Page {paginated.page} of {paginated.totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!paginated.hasNext}
            onClick={() => setPage((p) => Math.min(paginated.totalPages, p + 1))}
            aria-label="Next page"
            data-testid="action-queue-pagination-next"
          >
            Next
          </Button>
        </div>
      </div>

      {!loading && filtered.length === 0 && (
        <div
          className="glass rounded-2xl p-4 mb-4"
          role="status"
          data-testid="action-queue-no-results"
        >
          <p className="text-sm text-foreground">
            {rows.length === 0
              ? "No actions yet."
              : "No matching actions found."}
          </p>
          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              Clear the search box or change filters to see more actions.
            </p>
          )}
        </div>
      )}




      {alertContextId && !loading && filtered.length === 0 && (
        <div
          className="glass rounded-2xl p-4 mb-4"
          data-testid="action-queue-alert-context-empty"
          role="status"
        >
          <p
            className="text-sm text-foreground"
            data-testid="action-queue-alert-context-empty-title"
          >
            No actions linked to this alert yet.
          </p>
          <p
            className="text-xs text-muted-foreground mt-1"
            data-testid="action-queue-alert-context-empty-help"
          >
            Review the alert detail and add a suggested action when appropriate.
          </p>
          <div className="mt-3">
            <Link
              to={alertDetailPath(alertContextId)}
              className="text-xs text-primary hover:underline"
              data-testid="action-queue-alert-context-empty-back-link"
            >
              Back to alert
            </Link>
          </div>
        </div>
      )}




      {hasInvalidScope ? (
        <div
          role="status"
          className="glass rounded-2xl p-6 text-center flex flex-col items-center gap-2"
          data-testid="action-queue-missing-context"
        >
          <ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-display font-semibold text-base">
            Select a grow or tent to review pending actions.
          </p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Pending actions are scoped to a grow or tent so you only review
            recommendations that match what you’re working on. Grower approval
            is always required.
          </p>
        </div>
      ) : (
      <>
      <section className="glass rounded-2xl p-4 mb-4" aria-label="Needs Review">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Needs Review ({pending.length})
          </h2>
          {!loading && isRefreshing && (
            <span
              role="status"
              aria-live="polite"
              data-testid="action-queue-refreshing-indicator"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Refreshing actions…
            </span>
          )}
        </div>
        {loading ? (
          <ActionQueueLoadingSkeleton count={3} />
        ) : pending.length === 0 ? (
          <div className="py-4" data-testid="action-queue-empty-pending">
            <p className="text-sm text-foreground" data-testid="action-queue-empty-pending-title">
              {filtersActive ? "No actions match these filters." : ACTION_QUEUE_EMPTY_PENDING_TITLE}
            </p>
            {!filtersActive && (
              <p
                className="text-xs text-muted-foreground mt-1"
                data-testid="action-queue-empty-pending-help"
              >
                {ACTION_QUEUE_EMPTY_PENDING_HELP}
              </p>
            )}
            {!filtersActive && (
              <p
                className="text-xs text-muted-foreground mt-1"
                data-testid="one-tent-loop-action-queue-empty"
              >
                No approval-required actions are pending.
              </p>
            )}
            {!filtersActive && (
              <div
                className="mt-3 rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2"
                data-testid="action-queue-empty-next-steps"
              >
                <p className="text-xs text-foreground">
                  Actions appear here after Verdant or the grower creates a review item.
                </p>
                <p className="text-xs text-muted-foreground">
                  To create better recommendations, add timeline logs and sensor snapshots first.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    to="/timeline"
                    className="text-xs text-primary hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="action-queue-empty-next-steps-timeline"
                  >
                    View Timeline
                  </Link>
                  <Link
                    to="/sensors"
                    className="text-xs text-primary hover:underline rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid="action-queue-empty-next-steps-sensors"
                  >
                    Add Sensor Snapshot
                  </Link>
                </div>
              </div>
            )}
          </div>

        ) : (
          <ul className="space-y-3">
            {pending.map((row) => {
              const titleId = `aq-pending-title-${row.id}`;
              const descId = `aq-pending-desc-${row.id}`;
              const isFocused = focusedActionId === row.id;
              const ev = buildActionEvidenceViewModel({
                source: row.source,
                action_type: row.action_type,
                captured_at: row.created_at,
              });
              return (
              <li
                key={row.id}
                data-testid="action-queue-row"
                data-action-id={row.id}
                data-focused={isFocused ? "true" : undefined}
                aria-label={isFocused ? "Focused action" : undefined}
                aria-labelledby={isFocused ? undefined : titleId}
                aria-describedby={isFocused ? undefined : descId}
                className={`rounded-xl border border-border/60 bg-secondary/30 p-3 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
                  isFocused
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : ""
                }`}
              >
                <span id={descId} className="sr-only">
                  {buildActionRowAriaLabel(row)}
                </span>

                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 id={titleId} className="font-medium text-sm m-0">
                        {row.action_type}
                      </h3>
                      <Badge variant="outline" className={RISK_VARIANT[row.risk_level]} aria-label={`Risk: ${row.risk_level}`}>
                        {row.risk_level}
                      </Badge>
                      <EvidenceStatusBadge vm={ev} />
                      <TraceStatusBadge
                        state={deriveActionTraceBadgeState({
                          actionId: row.id,
                          traceFailureActionId: traceFailure?.actionId ?? null,
                          retryingTrace: retryingTrace && traceFailure?.actionId === row.id,
                        })}
                      />
                      <ActionQueueTraceStatusAnnouncer
                        state={deriveActionTraceBadgeState({
                          actionId: row.id,
                          traceFailureActionId: traceFailure?.actionId ?? null,
                          retryingTrace: retryingTrace && traceFailure?.actionId === row.id,
                        })}
                      />

                      {isAlertDerived(row) && (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase border-primary text-primary"
                          aria-label={`Source: ${getActionQueueSourceLabel(row)}`}
                        >
                          {getActionQueueSourceLabel(row)}
                        </Badge>
                      )}
                      {isAiDoctorDerived(row) && (
                        <>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase border-primary text-primary"
                            data-testid="action-queue-row-ai-doctor-badge"
                            aria-label="Source: AI Doctor"
                          >
                            AI Doctor
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase"
                            data-testid="action-queue-row-review-required-badge"
                          >
                            Review required
                          </Badge>
                        </>
                      )}


                      <span className="text-xs text-muted-foreground" data-testid="action-queue-row-target-label">
                        {formatActionTargetLabel(row.target_metric, row.target_device)}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{sanitizeActionCopy(row.suggested_change)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{sanitizeActionCopy(stripBackPointerTokens(row.reason))}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <AiDoctorSessionLink row={row} />
                      <LinkedAlertLink row={row} />
                    </div>
                    <p
                      className="mt-1 text-[11px] text-muted-foreground"
                      data-testid="action-queue-row-evidence-quality"
                    >
                      {ev.evidenceQualityLabel}
                    </p>

                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(() => {
                    const disabled = busyId === row.id;
                    const disabledReason = disabled ? "Saving — please wait" : null;
                    return (
                      <>
                        <Button size="sm" disabled={disabled} onClick={() => approve(row)} className="gradient-leaf text-primary-foreground" aria-label={buildActionButtonAriaLabel("approve", row, { disabledReason })} title={disabledReason ?? undefined}>
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => simulate(row)} aria-label={buildActionButtonAriaLabel("simulate", row, { disabledReason })} title={disabledReason ?? undefined}>
                          <FlaskConical className="h-4 w-4" /> Simulate
                        </Button>
                        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => reject(row)} aria-label={buildActionButtonAriaLabel("reject", row, { disabledReason })} title={disabledReason ?? undefined}>
                          <X className="h-4 w-4" /> Reject
                        </Button>
                        {canCancel(row.status) && (
                          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => cancelAction(row)} aria-label={buildActionButtonAriaLabel("cancel", row, { disabledReason })} title={disabledReason ?? undefined}>
                            <Ban className="h-4 w-4" /> Cancel
                          </Button>
                        )}
                      </>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => setDrawerRow(row)}
                    className="ml-auto text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm self-center"
                    data-testid="action-queue-row-explain"
                    aria-describedby={titleId}
                  >
                    Explain
                  </button>
                  <Link
                    to={actionDetailPath(row.id)}
                    className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm self-center"
                    aria-describedby={titleId}
                  >
                    View Details
                  </Link>
                </div>
                <RetryTraceFailureRegion
                  row={row}
                  traceFailure={traceFailure}
                  retrying={retryingTrace}
                  onRetry={(_r, kind) => {
                    void retryTimelineTrace(row, kind);
                  }}

                />
                <EventHistory items={events[row.id]} />

              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="glass rounded-2xl p-4" aria-label="Already Reviewed">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
          Already Reviewed ({reviewed.length})
        </h2>
        {loading ? (
          <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading reviewed actions"
            className="space-y-2"
            data-testid="action-queue-loading-skeleton-reviewed"
          >
            <span className="sr-only">Loading reviewed actions…</span>
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-8 w-full" aria-hidden="true" />
            ))}
          </div>
        ) : reviewed.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {filtersActive ? "No actions match these filters." : "No reviewed actions."}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {reviewed.slice(0, 50).map((row) => {
              const titleId = `aq-reviewed-title-${row.id}`;
              const descId = `aq-reviewed-desc-${row.id}`;
              const isFocused = focusedActionId === row.id;
              const ev = buildActionEvidenceViewModel({
                source: row.source,
                action_type: row.action_type,
                captured_at: row.created_at,
              });
              return (
              <li
                key={row.id}
                data-testid="action-queue-row"
                data-action-id={row.id}
                data-focused={isFocused ? "true" : undefined}
                aria-label={isFocused ? "Focused action" : undefined}
                aria-labelledby={isFocused ? undefined : titleId}
                aria-describedby={isFocused ? undefined : descId}
                className={`rounded-lg border border-border/40 bg-secondary/20 p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
                  isFocused
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : ""
                }`}
              >
                <span id={descId} className="sr-only">
                  {buildActionRowAriaLabel(row)}
                </span>
                <div className="flex items-center gap-3 flex-wrap">

                  <Badge variant="outline" className="text-[10px] uppercase" aria-label={buildStatusBadgeAriaLabel(row.status)}>{row.status}</Badge>
                  <Badge variant="outline" className={`text-[10px] uppercase ${RISK_VARIANT[row.risk_level]}`} aria-label={`Risk: ${row.risk_level}`}>
                    {row.risk_level}
                  </Badge>
                  <EvidenceStatusBadge vm={ev} />
                  <TraceStatusBadge
                    state={deriveActionTraceBadgeState({
                      actionId: row.id,
                      traceFailureActionId: traceFailure?.actionId ?? null,
                      retryingTrace: retryingTrace && traceFailure?.actionId === row.id,
                    })}
                  />

                  {isAlertDerived(row) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase border-primary text-primary"
                      aria-label={`Source: ${getActionQueueSourceLabel(row)}`}
                    >
                      {getActionQueueSourceLabel(row)}
                    </Badge>
                  )}
                  {isAiDoctorDerived(row) && (
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase border-primary text-primary"
                      data-testid="action-queue-row-ai-doctor-badge"
                      aria-label="Source: AI Doctor"
                    >
                      AI Doctor
                    </Badge>
                  )}


                  <span className="truncate flex-1">{sanitizeActionCopy(row.suggested_change)}</span>
                  <h3 id={titleId} className="text-xs text-muted-foreground m-0 font-normal">{row.action_type}</h3>
                  {(() => {
                    const disabled = busyId === row.id;
                    const disabledReason = disabled ? "Saving — please wait" : null;
                    return (
                      <>
                        {canComplete(row.status) && (
                          <Button size="sm" variant="secondary" disabled={disabled} onClick={() => complete(row)} aria-label={buildActionButtonAriaLabel("complete", row, { disabledReason })} title={disabledReason ?? undefined}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
                          </Button>
                        )}
                        {canCancel(row.status) && (
                          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => cancelAction(row)} aria-label={buildActionButtonAriaLabel("cancel", row, { disabledReason })} title={disabledReason ?? undefined}>
                            <Ban className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        )}
                      </>
                    );
                  })()}

                  <Link
                    to={actionDetailPath(row.id)}
                    className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
                    aria-describedby={titleId}
                  >
                    View Details
                  </Link>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <AiDoctorSessionLink row={row} />
                  <LinkedAlertLink row={row} />
                  {(() => {
                    const traceFailedHere = traceFailure?.actionId === row.id;
                    const link = buildActionDiaryTraceLink({
                      status: row.status,
                      actionId: row.id,
                      traceFailed: traceFailedHere,
                      currentActionsParams: searchParams,
                    });
                    if (link) {
                      return (
                        <Link
                          to={link.href}
                          className="text-xs text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          data-testid="action-queue-row-diary-trace-link"
                          data-trace-highlight={link.highlight}
                          data-trace-kind={link.kind}
                          aria-describedby={titleId}
                        >
                          {link.label}
                        </Link>
                      );
                    }
                    if (row.status === "approved" || row.status === "rejected") {
                      return (
                        <span
                          className="text-xs text-muted-foreground"
                          data-testid="action-queue-row-diary-trace-unavailable"
                        >
                          {TIMELINE_TRACE_UNAVAILABLE_COPY}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <RetryTraceFailureRegion
                  row={row}
                  traceFailure={traceFailure}
                  retrying={retryingTrace}
                  onRetry={(_r, kind) => {
                    void retryTimelineTrace(row, kind);
                  }}
                />
                <EventHistory items={events[row.id]} />

              </li>
              );
            })}
          </ul>
        )}
      </section>
      </>
      )}

      <Dialog
        open={noteDialog !== null}
        onOpenChange={(open) => {
          if (!open) cancelNoteDialog();
        }}
      >
        <DialogContent>
          {meta && (
            <>
              <DialogHeader>
                <DialogTitle>{meta.title}</DialogTitle>
                <DialogDescription>{meta.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="action-note">{meta.label}</Label>
                <Textarea
                  id="action-note"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={meta.placeholder}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to confirm without a note. Notes are stored in the audit history and cannot be edited.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={cancelNoteDialog}>
                  Cancel
                </Button>
                <Button onClick={confirmNoteDialog}>{meta.confirmLabel}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ActionQueueDetailDrawer
        open={!!drawerRow}
        onOpenChange={(open) => {
          if (!open) setDrawerRow(null);
        }}
        row={drawerRow}
        lookups={{
          growsById: Object.fromEntries(
            grows.map((g) => [g.id, { name: g.name }]),
          ),
        }}
        busy={!!drawerRow && busyId === drawerRow.id}
        loading={drawerHistoryLoading && drawerHistory === null}
        canApprove={!!drawerRow && !isTerminalStatus(drawerRow.status)}
        canReject={!!drawerRow && drawerRow.status === "pending_approval"}
        statusHistory={drawerHistory ?? []}
        traceFailed={!!drawerRow && traceFailure?.actionId === drawerRow.id}
        retrying={retryingTrace}
        currentActionsParams={searchParams}
        onApprove={(r) => {
          const found = rows.find((row) => row.id === r.id);
          if (found) approve(found);
        }}
        onReject={(r) => {
          const found = rows.find((row) => row.id === r.id);
          if (found) reject(found);
        }}
        onRetryTrace={(r) => {
          const found = rows.find((row) => row.id === r.id);
          if (found && traceFailure?.actionId === found.id) {
            void retryTimelineTrace(found, traceFailure.kind);
          }
        }}
      />
    </div>
  );
}

function EventHistory({ items }: { items?: EventRow[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
        <History className="h-3 w-3" /> History
      </p>
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase">{e.event_type}</Badge>
            <span>
              {e.previous_status ?? "—"} → {e.new_status ?? "—"}
            </span>
            <span className="ml-auto">{new Date(e.created_at).toLocaleString()}</span>
            {e.note && <span className="italic">· {e.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
