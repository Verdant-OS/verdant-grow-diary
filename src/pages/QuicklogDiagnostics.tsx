/**
 * QuicklogDiagnostics — operator screen for the Quick Log manual-save spine.
 *
 * Mounted under /_app/_operator (auth + has_role("operator")), so access
 * control lives in the route layout, not here. Read-only: every panel is an
 * RLS-scoped SELECT over the operator's own rows. The two probe buttons are
 * explicit actions; the wrapper probe intentionally fails validation
 * server-side and therefore records exactly one `validation_failed` audit
 * row (stated next to the button). Nothing here writes grow or diary data.
 *
 * Panels:
 *   1. Latest manual entries — parse / mirror-link / dual-timestamp status
 *      per entry, classified by quicklogManualDiagnosticsRules.
 *   2. Recent server-rejected saves — quicklog_audit_events validation
 *      failures with operator-readable messages.
 *   3. Private-helper ACL probes — the five postgres-only helpers must be
 *      denied for this authenticated session; the public wrapper must
 *      respond with calm validation.
 *   4. Consistency check — reconciles diary timeline entries against their
 *      linked grow event IDs (existence + occurrence/captured parity).
 */
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";
import {
  QUICKLOG_PRIVATE_HELPER_PROBES,
  QUICKLOG_WRAPPER_PROBE,
  buildQuicklogConsistencyReport,
  buildQuicklogManualEntryDiagnostics,
  classifyQuicklogPrivateProbe,
  classifyQuicklogWrapperProbe,
  readLinkedGrowEventId,
  summarizeQuicklogManualDiagnostics,
  type QuicklogAclProbeStatus,
  type QuicklogConsistencyReport,
  type QuicklogDiagnosticsAuditRow,
  type QuicklogDiagnosticsDiaryRow,
  type QuicklogDiagnosticsEventRow,
  type QuicklogDiagnosticsSeverity,
  type QuicklogManualEntryDiagnostics,
  type QuicklogWrapperProbeResult,
} from "@/lib/quicklogManualDiagnosticsRules";

const MANUAL_EVENT_WINDOW = 20;
const CONSISTENCY_DIARY_WINDOW = 200;
const CONSISTENCY_EVENT_WINDOW = 100;

// Only the manual-save PARENT rows carry a diary mirror. A sensor-bearing
// save also writes a companion `environment` grow event (source "manual")
// that the delegate intentionally does NOT mirror — including it here would
// paint every healthy sensor save as a spurious missing-mirror warning.
const MANUAL_PARENT_EVENT_TYPES = ["watering", "observation"] as const;

const EVENT_COLUMNS_WITH_LOGGED_AT =
  "id, event_type, source, occurred_at, logged_at, created_at, plant_id, tent_id, grow_id";
const EVENT_COLUMNS_LEGACY =
  "id, event_type, source, occurred_at, created_at, plant_id, tent_id, grow_id";
const DIARY_COLUMNS_WITH_LOGGED_AT = "id, entry_at, logged_at, grow_id, plant_id, tent_id, details";
const DIARY_COLUMNS_LEGACY = "id, entry_at, grow_id, plant_id, tent_id, details";

interface CompatError {
  code?: string | null;
  message?: string | null;
}

function isMissingLoggedAtColumnError(error: CompatError | null | undefined): boolean {
  if (!error) return false;
  const message = typeof error.message === "string" ? error.message : "";
  return error.code === "42703" && message.includes("logged_at");
}

interface ManualDiagnosticsData {
  rows: QuicklogManualEntryDiagnostics[];
  loggedAtColumnAvailable: boolean;
  recentRejections: QuicklogDiagnosticsAuditRow[];
  auditReadable: boolean;
}

async function fetchManualEvents(limit: number): Promise<{
  events: QuicklogDiagnosticsEventRow[];
  loggedAtColumnAvailable: boolean;
}> {
  const withLoggedAt = await supabase
    .from("grow_events")
    .select(EVENT_COLUMNS_WITH_LOGGED_AT)
    .eq("source", "manual")
    .in("event_type", [...MANUAL_PARENT_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!withLoggedAt.error) {
    return {
      events: (withLoggedAt.data ?? []) as unknown as QuicklogDiagnosticsEventRow[],
      loggedAtColumnAvailable: true,
    };
  }
  if (!isMissingLoggedAtColumnError(withLoggedAt.error)) throw withLoggedAt.error;
  const legacy = await supabase
    .from("grow_events")
    .select(EVENT_COLUMNS_LEGACY)
    .eq("source", "manual")
    .in("event_type", [...MANUAL_PARENT_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (legacy.error) throw legacy.error;
  return {
    events: (legacy.data ?? []) as unknown as QuicklogDiagnosticsEventRow[],
    loggedAtColumnAvailable: false,
  };
}

async function fetchMirrorsForEvents(
  eventIds: string[],
  loggedAtColumnAvailable: boolean,
): Promise<QuicklogDiagnosticsDiaryRow[]> {
  if (eventIds.length === 0) return [];
  const columns = loggedAtColumnAvailable ? DIARY_COLUMNS_WITH_LOGGED_AT : DIARY_COLUMNS_LEGACY;
  const byKey = async (key: "linked_grow_event_id" | "grow_event_id") => {
    const res = await supabase
      .from("diary_entries")
      .select(columns)
      .in(`details->>${key}` as never, eventIds);
    if (res.error) {
      if (isMissingLoggedAtColumnError(res.error)) {
        const legacy = await supabase
          .from("diary_entries")
          .select(DIARY_COLUMNS_LEGACY)
          .in(`details->>${key}` as never, eventIds);
        if (legacy.error) throw legacy.error;
        return (legacy.data ?? []) as unknown as QuicklogDiagnosticsDiaryRow[];
      }
      throw res.error;
    }
    return (res.data ?? []) as unknown as QuicklogDiagnosticsDiaryRow[];
  };
  const [modern, legacyKeyRows] = await Promise.all([
    byKey("linked_grow_event_id"),
    byKey("grow_event_id"),
  ]);
  const seen = new Set<string>();
  const merged: QuicklogDiagnosticsDiaryRow[] = [];
  for (const row of [...modern, ...legacyKeyRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

async function fetchManualDiagnostics(): Promise<ManualDiagnosticsData> {
  const { events, loggedAtColumnAvailable } = await fetchManualEvents(MANUAL_EVENT_WINDOW);
  const eventIds = events.map((event) => event.id);
  const mirrors = await fetchMirrorsForEvents(eventIds, loggedAtColumnAvailable);

  // Audit reads are owner-scoped; a missing policy or table degrades to an
  // honest "unavailable" label instead of failing the whole screen.
  let auditRows: QuicklogDiagnosticsAuditRow[] = [];
  let recentRejections: QuicklogDiagnosticsAuditRow[] = [];
  let auditReadable = true;
  // Chronological order with a stable tie-breaker — the UI renders these as
  // an ordered trail, and PostgREST guarantees nothing without an ORDER BY.
  const auditForEvents = eventIds.length
    ? await supabase
        .from("quicklog_audit_events" as never)
        .select("grow_event_id, status, reason, created_at")
        .in("grow_event_id", eventIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    : { data: [], error: null };
  if (auditForEvents.error) {
    auditReadable = false;
  } else {
    auditRows = (auditForEvents.data ?? []) as unknown as QuicklogDiagnosticsAuditRow[];
  }
  if (auditReadable) {
    const rejections = await supabase
      .from("quicklog_audit_events" as never)
      .select("grow_event_id, status, reason, created_at")
      .eq("status", "validation_failed")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(15);
    if (rejections.error) {
      auditReadable = false;
    } else {
      recentRejections = (rejections.data ?? []) as unknown as QuicklogDiagnosticsAuditRow[];
    }
  }

  return {
    rows: buildQuicklogManualEntryDiagnostics({
      events,
      diaryEntries: mirrors,
      auditEvents: auditRows,
      loggedAtColumnAvailable,
    }),
    loggedAtColumnAvailable,
    recentRejections,
    auditReadable,
  };
}

function severityBadge(severity: QuicklogDiagnosticsSeverity) {
  if (severity === "fail") return <Badge variant="destructive">Fail</Badge>;
  if (severity === "warn") return <Badge variant="outline">Warn</Badge>;
  return <Badge variant="secondary">OK</Badge>;
}

const PROBE_STATUS_COPY: Record<QuicklogAclProbeStatus, { label: string; healthy: boolean }> = {
  sealed_permission: { label: "Sealed — permission denied for this session", healthy: true },
  sealed_not_exposed: { label: "Sealed — not callable through the API", healthy: true },
  exposed_regression: { label: "EXPOSED — callable by a client session", healthy: false },
  network_error: { label: "Probe could not reach the server", healthy: false },
  unknown_error: { label: "Probe returned an unrecognized error", healthy: false },
};

const WRAPPER_STATUS_COPY: Record<QuicklogWrapperProbeResult["status"], string> = {
  reachable_validating: "Reachable — server validation answered the probe",
  unavailable: "Unavailable — the save function is missing from this database",
  denied: "Denied — this session is not allowed to execute the save function",
  unexpected_write: "UNEXPECTED WRITE — the probe payload saved; validation contract drifted",
  network_error: "Probe could not reach the server",
  unknown_error: "Probe returned an unrecognized error",
};

interface AclProbeState {
  running: boolean;
  helperResults: { functionName: string; status: QuicklogAclProbeStatus }[];
  wrapperResult: QuicklogWrapperProbeResult | null;
}

interface ConsistencyState {
  running: boolean;
  report: QuicklogConsistencyReport | null;
  error: string | null;
}

export default function QuicklogDiagnostics() {
  const diagnostics = useQuery({
    queryKey: ["quicklog-diagnostics", "manual-entries"],
    queryFn: fetchManualDiagnostics,
    staleTime: 30_000,
    retry: false,
  });

  const [aclState, setAclState] = useState<AclProbeState>({
    running: false,
    helperResults: [],
    wrapperResult: null,
  });
  const [consistency, setConsistency] = useState<ConsistencyState>({
    running: false,
    report: null,
    error: null,
  });

  const runAclProbes = useCallback(async () => {
    setAclState({ running: true, helperResults: [], wrapperResult: null });
    const helperResults: AclProbeState["helperResults"] = [];
    for (const probe of QUICKLOG_PRIVATE_HELPER_PROBES) {
      try {
        const { error } = await supabase.rpc(probe.functionName as never, probe.args as never);
        helperResults.push({
          functionName: probe.functionName,
          status: classifyQuicklogPrivateProbe({
            succeeded: !error,
            errorCode: error?.code ?? null,
            errorMessage: error?.message ?? null,
          }),
        });
      } catch (thrown) {
        helperResults.push({
          functionName: probe.functionName,
          status: classifyQuicklogPrivateProbe({
            succeeded: false,
            errorCode: null,
            errorMessage: thrown instanceof Error ? thrown.message : String(thrown),
          }),
        });
      }
    }
    let wrapperResult: QuicklogWrapperProbeResult;
    try {
      const { data, error } = await supabase.rpc(
        QUICKLOG_WRAPPER_PROBE.functionName as never,
        QUICKLOG_WRAPPER_PROBE.args as never,
      );
      wrapperResult = classifyQuicklogWrapperProbe({
        succeeded: !error,
        data,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null,
      });
    } catch (thrown) {
      wrapperResult = classifyQuicklogWrapperProbe({
        succeeded: false,
        errorCode: null,
        errorMessage: thrown instanceof Error ? thrown.message : String(thrown),
      });
    }
    setAclState({ running: false, helperResults, wrapperResult });
  }, []);

  const runConsistencyCheck = useCallback(async () => {
    setConsistency({ running: true, report: null, error: null });
    try {
      const { events: manualForReport, loggedAtColumnAvailable } =
        await fetchManualEvents(CONSISTENCY_EVENT_WINDOW);
      const eventColumns = loggedAtColumnAvailable
        ? EVENT_COLUMNS_WITH_LOGGED_AT
        : EVENT_COLUMNS_LEGACY;
      const diaryColumns = loggedAtColumnAvailable
        ? DIARY_COLUMNS_WITH_LOGGED_AT
        : DIARY_COLUMNS_LEGACY;

      const diaryWindow = await supabase
        .from("diary_entries")
        .select(diaryColumns)
        .order("entry_at", { ascending: false })
        .limit(CONSISTENCY_DIARY_WINDOW);
      if (diaryWindow.error) throw diaryWindow.error;
      const diaryEntries = (diaryWindow.data ?? []) as unknown as QuicklogDiagnosticsDiaryRow[];

      const linkedIds = new Set<string>();
      for (const diary of diaryEntries) {
        const link = readLinkedGrowEventId(diary.details);
        if (link.id) linkedIds.add(link.id);
      }
      const knownIds = new Set(manualForReport.map((event) => event.id.toLowerCase()));
      const missingIds = [...linkedIds].filter((id) => !knownIds.has(id));
      let linkedEvents: QuicklogDiagnosticsEventRow[] = [];
      if (missingIds.length > 0) {
        const byId = await supabase.from("grow_events").select(eventColumns).in("id", missingIds);
        if (byId.error) throw byId.error;
        linkedEvents = (byId.data ?? []) as unknown as QuicklogDiagnosticsEventRow[];
      }

      const mirrorsForManual = await fetchMirrorsForEvents(
        manualForReport.map((event) => event.id),
        loggedAtColumnAvailable,
      );
      const seenDiary = new Set(diaryEntries.map((row) => row.id));
      const mergedDiary = [
        ...diaryEntries,
        ...mirrorsForManual.filter((row) => !seenDiary.has(row.id)),
      ];

      setConsistency({
        running: false,
        error: null,
        report: buildQuicklogConsistencyReport({
          diaryEntries: mergedDiary,
          growEvents: [...manualForReport, ...linkedEvents],
          loggedAtColumnAvailable,
        }),
      });
    } catch {
      setConsistency({
        running: false,
        report: null,
        error: "Consistency check could not read your timeline rows. Retry in a moment.",
      });
    }
  }, []);

  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4"
      data-testid="quicklog-diagnostics-page"
    >
      <div>
        <h1 className="text-xl font-semibold">Quick Log diagnostics</h1>
        <p className="text-sm text-muted-foreground">
          Manual-save health for your own entries: server parse results, diary mirror links, and the
          Captured/occurrence timestamps. Read-only, except the labeled probe button.
        </p>
      </div>

      <Card data-testid="quicklog-diagnostics-entries">
        <CardHeader>
          <CardTitle className="text-base">Latest manual entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {diagnostics.isLoading && (
            <p className="text-sm text-muted-foreground">Loading entries…</p>
          )}
          {diagnostics.isError && (
            <p className="text-sm text-destructive" role="alert">
              Could not load manual entries. Retry in a moment.
            </p>
          )}
          {diagnostics.data && (
            <>
              {!diagnostics.data.loggedAtColumnAvailable && (
                <p
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm"
                  data-testid="quicklog-diagnostics-column-gap"
                >
                  This database has no Captured (logged_at) columns yet — the dual-timestamp
                  migration is not applied here. Timestamp parity reads as unavailable, not healthy.
                </p>
              )}
              <p
                className="text-sm text-muted-foreground"
                data-testid="quicklog-diagnostics-summary"
              >
                {(() => {
                  const summary = summarizeQuicklogManualDiagnostics(diagnostics.data.rows);
                  return `${summary.total} entries — ${summary.ok} OK · ${summary.warn} warn · ${summary.fail} fail`;
                })()}
              </p>
              {diagnostics.data.rows.length === 0 && (
                <p className="text-sm text-muted-foreground">No manual Quick Log entries yet.</p>
              )}
              <ul className="space-y-2">
                {diagnostics.data.rows.map((row) => (
                  <li
                    key={row.growEventId}
                    className="rounded-md border border-border/60 p-2 text-sm"
                    data-testid={`quicklog-diagnostics-row-${row.growEventId}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium capitalize">{row.eventType}</span>
                      {severityBadge(row.severity)}
                    </div>
                    <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                      <div>
                        <dt className="inline">Occurred: </dt>
                        <dd className="inline">{row.occurredAt}</dd>
                      </div>
                      <div>
                        <dt className="inline">Captured: </dt>
                        <dd className="inline">{row.eventLoggedAt ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline">Mirror link: </dt>
                        <dd className="inline">{row.mirrorStatus.replaceAll("_", " ")}</dd>
                      </div>
                      <div>
                        <dt className="inline">Captured parity: </dt>
                        <dd className="inline">{row.loggedAtStatus.replaceAll("_", " ")}</dd>
                      </div>
                      <div>
                        <dt className="inline">Occurrence parity: </dt>
                        <dd className="inline">
                          {row.entryAtMatchesOccurredAt === null
                            ? "no mirror"
                            : row.entryAtMatchesOccurredAt
                              ? "entry matches event"
                              : "entry differs from event"}
                        </dd>
                      </div>
                      <div>
                        <dt className="inline">Mirror details stamp: </dt>
                        <dd className="inline">{row.detailsLoggedAtStatus.replaceAll("_", " ")}</dd>
                      </div>
                      {row.auditStatuses.length > 0 && (
                        <div className="sm:col-span-2">
                          <dt className="inline">Audit trail: </dt>
                          <dd className="inline">
                            {row.auditStatuses.join(" → ").replaceAll("_", " ")}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card data-testid="quicklog-diagnostics-rejections">
        <CardHeader>
          <CardTitle className="text-base">Recent server-rejected saves</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {diagnostics.data && !diagnostics.data.auditReadable && (
            <p className="text-sm text-muted-foreground">
              The save audit trail is not readable from this session, so rejected saves cannot be
              listed here.
            </p>
          )}
          {diagnostics.data?.auditReadable && diagnostics.data.recentRejections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rejected manual saves recorded for your account.
            </p>
          )}
          <ul className="space-y-1">
            {(diagnostics.data?.recentRejections ?? []).map((rejection, index) => (
              <li key={index} className="text-sm">
                <span className="text-muted-foreground">
                  {rejection.created_at ?? "unknown time"} —{" "}
                </span>
                {quickLogReasonToOperatorMessage(rejection.reason)}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card data-testid="quicklog-diagnostics-acl">
        <CardHeader>
          <CardTitle className="text-base">Private-helper access probes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The five save helpers must be sealed against client sessions; only the public save
            function may answer. The public-save probe fails validation on purpose, which records
            one rejected-save audit row.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={runAclProbes}
            disabled={aclState.running}
            data-testid="quicklog-diagnostics-run-probes"
          >
            {aclState.running ? "Probing…" : "Run access probes"}
          </Button>
          {aclState.helperResults.length > 0 && (
            <ul className="space-y-1" data-testid="quicklog-diagnostics-probe-results">
              {aclState.helperResults.map((result) => {
                const copy = PROBE_STATUS_COPY[result.status];
                return (
                  <li
                    key={result.functionName}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <code className="text-xs">{result.functionName}</code>
                    <Badge variant={copy.healthy ? "secondary" : "destructive"}>{copy.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          {aclState.wrapperResult && (
            <p className="text-sm" data-testid="quicklog-diagnostics-wrapper-result">
              Public save function:{" "}
              <span
                className={
                  aclState.wrapperResult.status === "reachable_validating"
                    ? "text-muted-foreground"
                    : "font-medium text-destructive"
                }
              >
                {WRAPPER_STATUS_COPY[aclState.wrapperResult.status]}
                {aclState.wrapperResult.reason
                  ? ` (${quickLogReasonToOperatorMessage(aclState.wrapperResult.reason)})`
                  : ""}
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="quicklog-diagnostics-consistency">
        <CardHeader>
          <CardTitle className="text-base">Diary ↔ grow event consistency</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Reconciles your latest {CONSISTENCY_DIARY_WINDOW} diary entries against their linked
            grow event IDs, and your latest {CONSISTENCY_EVENT_WINDOW} manual events against their
            mirrors. Read-only.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={runConsistencyCheck}
            disabled={consistency.running}
            data-testid="quicklog-diagnostics-run-consistency"
          >
            {consistency.running ? "Checking…" : "Run consistency check"}
          </Button>
          {consistency.error && (
            <p className="text-sm text-destructive" role="alert">
              {consistency.error}
            </p>
          )}
          {consistency.report && (
            <div
              className="space-y-2 text-sm"
              data-testid="quicklog-diagnostics-consistency-report"
            >
              <p>
                Checked {consistency.report.checkedDiaryEntries} diary entries and{" "}
                {consistency.report.checkedGrowEvents} grow events —{" "}
                {consistency.report.healthyLinks} healthy links,{" "}
                {consistency.report.linksWithoutCapturedParity} without provable Captured parity,{" "}
                {consistency.report.unlinkedDiaryEntries} standalone diary entries.
              </p>
              {consistency.report.danglingDiaryLinks.length === 0 &&
                consistency.report.occurrenceMismatches.length === 0 &&
                consistency.report.loggedAtMismatches.length === 0 && (
                  <p className="text-muted-foreground">
                    No dangling links and no timestamp mismatches in the checked window.
                  </p>
                )}
              {consistency.report.danglingDiaryLinks.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    {consistency.report.danglingDiaryLinks.length} diary entr
                    {consistency.report.danglingDiaryLinks.length === 1 ? "y" : "ies"} link to a
                    grow event that no longer exists:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {consistency.report.danglingDiaryLinks.map((item) => (
                      <li key={item.diaryEntryId}>
                        diary {item.diaryEntryId} → missing event {item.linkedGrowEventId}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {consistency.report.occurrenceMismatches.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    {consistency.report.occurrenceMismatches.length} linked pair
                    {consistency.report.occurrenceMismatches.length === 1 ? "" : "s"} disagree on
                    the occurrence time:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {consistency.report.occurrenceMismatches.map((item) => (
                      <li key={`${item.diaryEntryId}-${item.growEventId}`}>
                        diary {item.diaryEntryId} at {item.entryAt} vs event {item.growEventId} at{" "}
                        {item.occurredAt}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {consistency.report.loggedAtMismatches.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    {consistency.report.loggedAtMismatches.length} linked pair
                    {consistency.report.loggedAtMismatches.length === 1 ? "" : "s"} disagree on the
                    Captured time:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-muted-foreground">
                    {consistency.report.loggedAtMismatches.map((item) => (
                      <li key={`${item.diaryEntryId}-${item.growEventId}`}>
                        diary {item.diaryEntryId} ({item.diaryLoggedAt ?? "—"}) vs event{" "}
                        {item.growEventId} ({item.eventLoggedAt ?? "—"})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {consistency.report.unmirroredManualEvents.length > 0 && (
                <p className="text-muted-foreground">
                  {consistency.report.unmirroredManualEvents.length} manual event
                  {consistency.report.unmirroredManualEvents.length === 1 ? "" : "s"} in the window
                  have no diary mirror — expected for entries saved before the always-mirror
                  migration.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
