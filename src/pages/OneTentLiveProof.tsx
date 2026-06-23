/**
 * OneTentLiveProof — guided demo path for Verdant's One-Tent Loop.
 *
 * Read-only navigation/demo page. Does NOT write to Supabase, does NOT
 * call edge functions, does NOT create alerts or Action Queue items,
 * does NOT touch device control or AI.
 *
 * Status derivation is delegated to `buildOneTentLiveProofViewModel`.
 * Steps that cannot be safely inferred render as
 * "Needs operator confirmation".
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import PageHeader from "@/components/PageHeader";
import { ClipboardCheck, RefreshCw, Printer, Copy } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OneTentLiveProofChecklist from "@/components/OneTentLiveProofChecklist";
import OneTentLiveProofReport from "@/components/OneTentLiveProofReport";
import OneTentSensorProofSection from "@/components/OneTentSensorProofSection";
import { useGrows } from "@/store/grows";
import { useGrowTents } from "@/hooks/useGrowData";
import { useLatestSensorSnapshot } from "@/hooks/useLatestSensorSnapshot";
import { useAlertsList } from "@/hooks/useAlertsList";
import { useOneTentLiveProofActionStatus } from "@/hooks/useOneTentLiveProofActionStatus";
import { useOneTentLiveProofTimelineFollowup } from "@/hooks/useOneTentLiveProofTimelineFollowup";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useEcowittIngestAuditProofRows } from "@/hooks/useEcowittIngestAuditProofRows";
import {
  buildOneTentLiveProofViewModel,
  buildOneTentLiveProofReport,
  PROOF_DEMO_SAFETY_WARNING,
  PROOF_DEMO_RUN_STEPS,
} from "@/lib/oneTentLiveProofViewModel";
import { buildEcowittLiveProofViewModel } from "@/lib/ecowittLiveProofViewModel";
import type { EcowittProofRow } from "@/lib/ecowittLiveProofRules";
import { buildEcowittIngestAuditProof } from "@/lib/ecowittIngestAuditProofRules";
import {
  buildOneTentSensorProofViewModel,
  buildOneTentSensorProofReportSection,
} from "@/lib/oneTentSensorProofViewModel";
import {
  sanitizeProofReportMarkdown,
  PROOF_REPORT_REDACTION_NOTICE,
} from "@/lib/proofReportRedactionRules";


export default function OneTentLiveProof() {
  const { grows, activeGrowId } = useGrows();
  const [growId, setGrowId] = useState<string | "">(activeGrowId ?? "");
  const effectiveGrowId = growId || activeGrowId || grows[0]?.id || "";
  const { data: tents = [] } = useGrowTents(effectiveGrowId || undefined);
  const [tentId, setTentId] = useState<string | "">("");
  const effectiveTentId = tentId || (tents.length === 1 ? tents[0]?.id ?? "" : "");

  const selectedGrow = grows.find((g) => g.id === effectiveGrowId) ?? null;
  const selectedTent = tents.find((t) => t.id === effectiveTentId) ?? null;

  const tentIds = effectiveTentId
    ? [effectiveTentId]
    : tents.map((t) => t.id);
  const snapshot = useLatestSensorSnapshot(effectiveGrowId, tentIds);
  const { alerts, reload: reloadAlerts } = useAlertsList({
    growId: effectiveGrowId || null,
    status: "open",
    severity: "all",
  });
  const alertIds = useMemo(() => alerts.map((a) => a.id), [alerts]);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const REFRESH_SECTIONS = ["snapshots", "alerts", "actions", "timeline"] as const;
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const actionStatus = useOneTentLiveProofActionStatus(alertIds, refreshNonce);
  const timelineFollowup = useOneTentLiveProofTimelineFollowup(
    effectiveGrowId || null,
    actionStatus.completedActionId,
    refreshNonce,
  );

  const queryClient = useQueryClient();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    try {
      queryClient.invalidateQueries({ queryKey: ["latest-sensor-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["sensor_readings"] });
      reloadAlerts();
      setRefreshNonce((n) => n + 1);
    } finally {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        setRefreshing(false);
        setLastRefreshedAt(new Date());
      }, 400);
    }
  }, [queryClient, reloadAlerts]);

  const matchingAlertId = alerts.length === 1 ? alerts[0].id : null;

  const vm = useMemo(
    () =>
      buildOneTentLiveProofViewModel(
        {
          grow: selectedGrow
            ? { id: selectedGrow.id, name: selectedGrow.name ?? null }
            : null,
          tent: selectedTent
            ? { id: selectedTent.id, name: selectedTent.name ?? null }
            : null,
        },
        {
          snapshot: snapshot.status === "ok" ? snapshot.snapshot : null,
          snapshotStatus: snapshot.status,
          hasMatchingOpenAlert: alerts.length > 0,
          matchingAlertId,
          linkedActionExists: actionStatus.linkedActionExists,
          linkedActionId: actionStatus.linkedActionId,
          linkedActionCompleted: actionStatus.linkedActionCompleted,
          timelineFollowupConfirmed: timelineFollowup.followupConfirmed,
        },
      ),
    [
      selectedGrow,
      selectedTent,
      snapshot.status,
      snapshot.snapshot,
      alerts.length,
      matchingAlertId,
      actionStatus.linkedActionExists,
      actionStatus.linkedActionId,
      actionStatus.linkedActionCompleted,
      timelineFollowup.followupConfirmed,
    ],
  );

  // Read-only sensor evidence: row-level EcoWitt proof from already-loaded
  // sensor_readings + RLS-safe ingest-audit proof from sensor_ingest_audit_log.
  // Both queries are narrow and existing — no new write surface, no schema
  // changes, no Edge/RPC/auth changes.
  const { data: tentSensorRows = [] } = useSensorReadings(
    effectiveTentId || undefined,
    60,
  );
  const auditProofQuery = useEcowittIngestAuditProofRows({
    tentId: effectiveTentId || null,
    enabled: Boolean(effectiveTentId),
  });
  const sensorProofVM = useMemo(() => {
    const now = lastRefreshedAt ?? new Date();
    const liveVM = effectiveTentId
      ? buildEcowittLiveProofViewModel(
          tentSensorRows as unknown as readonly EcowittProofRow[],
          { tentId: effectiveTentId, now },
        )
      : null;
    const auditVM = effectiveTentId
      ? buildEcowittIngestAuditProof(auditProofQuery.rows, {
          status: auditProofQuery.status,
          tentId: effectiveTentId,
          now,
        })
      : null;
    return buildOneTentSensorProofViewModel({
      tentId: effectiveTentId || null,
      liveProof: liveVM,
      auditProof: auditVM,
    });
  }, [
    effectiveTentId,
    tentSensorRows,
    auditProofQuery.status,
    auditProofQuery.rows,
    lastRefreshedAt,
    refreshNonce,
  ]);

  const report = useMemo(() => {
    const base = buildOneTentLiveProofReport(vm, {
      now: lastRefreshedAt ?? new Date(),
    });
    const sensorMarkdown = buildOneTentSensorProofReportSection(sensorProofVM);
    const rawMarkdown = `${base.markdown}\n\n${sensorMarkdown}`;
    const s = sanitizeProofReportMarkdown;
    return {
      ...base,
      title: s(base.title),
      generatedAtLabel: s(base.generatedAtLabel),
      contextLines: base.contextLines.map(s),
      safetyNotes: base.safetyNotes.map(s),
      steps: base.steps.map((step) => ({
        ...step,
        label: s(step.label),
        statusLabel: s(step.statusLabel),
        evidenceSummary: step.evidenceSummary ? s(step.evidenceSummary) : step.evidenceSummary,
        missingEvidence: step.missingEvidence ? s(step.missingEvidence) : step.missingEvidence,
      })),
      closingLine: base.closingLine ? s(base.closingLine) : base.closingLine,
      markdown: s(rawMarkdown),
    };
  }, [vm, lastRefreshedAt, sensorProofVM]);









  return (
    <div className="space-y-4">
      <PageHeader
        title="One-Tent Live Proof"
        description="Manual Snapshot → Alert → Action Queue → Completed Follow-up → Timeline"
        icon={<ClipboardCheck className="h-5 w-5" />}
      />
      <p
        className="text-xs text-muted-foreground"
        data-testid="one-tent-live-proof-description"
      >
        Use this guided path to prove Verdant's core operating loop with a
        real/manual tent reading. Verdant does not fake live data, auto-create
        actions, or control equipment.
      </p>
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="one-tent-live-proof-readonly-note"
      >
        This page only reads proof status. It does not create alerts, create
        actions, complete actions, or control equipment.
      </p>

      <ul
        className="flex flex-wrap gap-1.5"
        data-testid="one-tent-live-proof-safety-badges"
        aria-label="Proof safety badges"
      >
        {vm.safetyBadges.map((b) => (
          <li key={b.id}>
            <Badge variant="outline" className="text-[10px]">
              {b.label}
            </Badge>
          </li>
        ))}
      </ul>

      <div
        role="note"
        className="rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 p-2 text-[11px] text-amber-800 dark:text-amber-200"
        data-testid="one-tent-live-proof-demo-safety-warning"
      >
        {PROOF_DEMO_SAFETY_WARNING}
      </div>

      <section
        aria-label="Recommended demo path"
        className="rounded-md border border-border p-2 text-[11px]"
        data-testid="one-tent-live-proof-demo-run-banner"
      >
        <p className="font-medium">Recommended demo path</p>
        <ol className="list-decimal pl-5 text-muted-foreground">
          {PROOF_DEMO_RUN_STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>



      <section
        className="glass rounded-2xl p-3 space-y-2"
        aria-label="Proof context selector"
      >
        <p className="text-xs font-medium">Context</p>
        {grows.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="one-tent-live-proof-empty"
          >
            Create or select a grow/tent/plant to run the proof.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Select
              value={effectiveGrowId}
              onValueChange={(v) => {
                setGrowId(v);
                setTentId("");
              }}
            >
              <SelectTrigger
                className="w-[220px]"
                aria-label="Select grow"
                data-testid="one-tent-live-proof-grow-select"
              >
                <SelectValue placeholder="Select grow" />
              </SelectTrigger>
              <SelectContent>
                {grows.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name ?? "Untitled grow"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={effectiveTentId}
              onValueChange={(v) => setTentId(v)}
              disabled={tents.length === 0}
            >
              <SelectTrigger
                className="w-[220px]"
                aria-label="Select tent"
                data-testid="one-tent-live-proof-tent-select"
              >
                <SelectValue placeholder="Select tent" />
              </SelectTrigger>
              <SelectContent>
                {tents.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name ?? "Untitled tent"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {vm.selectionSummary ? (
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="one-tent-live-proof-selection-summary"
          >
            {vm.selectionSummary}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          data-testid="one-tent-live-proof-refresh"
          aria-label="Refresh proof status"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          />
          {refreshing ? "Refreshing…" : "Refresh proof status"}
        </Button>
        {refreshing ? (
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="one-tent-live-proof-refresh-sections"
          >
            Refreshing: {REFRESH_SECTIONS.join(", ")}…
          </span>
        ) : lastRefreshedAt ? (
          <span
            className="text-[11px] text-muted-foreground"
            data-testid="one-tent-live-proof-refresh-timestamp"
          >
            Last refreshed{" "}
            {lastRefreshedAt.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            Use after saving a snapshot, adding an alert to Action Queue,
            completing an action, or checking Timeline.
          </span>
        )}
      </div>

      <section
        aria-label="Proof shortcuts"
        className="flex flex-wrap gap-2"
        data-testid="one-tent-live-proof-shortcuts"
      >
        {vm.shortcutLinks.map((s) => (
          <Button
            key={s.id}
            asChild
            size="sm"
            variant="outline"
            data-testid={`one-tent-live-proof-shortcut-${s.id}`}
            data-exact={s.exact ? "true" : "false"}
          >
            <Link to={s.href}>{s.label}</Link>
          </Button>
        ))}
      </section>

      <OneTentLiveProofChecklist vm={vm} />

      <OneTentSensorProofSection vm={sensorProofVM} />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.print();
          }}
          data-testid="one-tent-live-proof-print"
          aria-label="Print or save proof report"
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Print / Save proof report
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="one-tent-live-proof-copy-summary"
          aria-label="Copy proof summary"
          onClick={async () => {
            try {
              const text = report.markdown;
              if (
                typeof navigator !== "undefined" &&
                navigator.clipboard?.writeText
              ) {
                await navigator.clipboard.writeText(text);
                setCopyStatus("copied");
              } else {
                setCopyStatus("error");
              }
            } catch {
              setCopyStatus("error");
            } finally {
              setTimeout(() => setCopyStatus("idle"), 1500);
            }
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          {copyStatus === "copied"
            ? "Copied"
            : copyStatus === "error"
              ? "Copy failed"
              : "Copy proof summary"}
        </Button>
      </div>

      <OneTentLiveProofReport report={report} />

      <p
        className="text-[11px] text-muted-foreground"
        data-testid="one-tent-live-proof-honesty-note"
      >
        Verdant will not mark steps complete unless real app state supports
        them. Steps that cannot be safely inferred show "Needs operator
        confirmation".
      </p>
    </div>
  );
}
