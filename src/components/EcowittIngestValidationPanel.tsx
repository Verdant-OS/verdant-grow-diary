import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildEcowittIngestValidationViewModel,
  ECOWITT_VALIDATION_COPY_COMMANDS,
  type EcowittIngestValidationInput,
  type EcowittValidationMetricStatus,
  type EcowittValidationStatus,
} from "@/lib/ecowittIngestValidationViewModel";
import {
  buildLatestEvidenceSnapshot,
  serializeEvidenceForClipboard,
  buildEvidencePreview,
} from "@/lib/ecowittValidationEvidenceRules";
import {
  buildEcowittValidationExport,
  serializeExport,
  serializeExportCsv,
  buildExportPreview,
  EXPORT_CSV_AVAILABLE,
} from "@/lib/ecowittValidationExportRules";
import {
  buildDiaryEnvironmentCheckDraft,
  buildAlreadyLoggedEventInfo,
  DIARY_ENVIRONMENT_CHECK_TITLE,
  type DiaryEnvironmentCheckDraft,
} from "@/lib/ecowittDiaryEnvironmentCheckRules";

interface Props {
  input: EcowittIngestValidationInput;
  /** Existing audit refetch from useEcowittAuditRows; never triggers writes. */
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /**
   * Operator-initiated diary log handler. Receives a pure draft built from
   * the latest accepted validation evidence. Caller wires this to the
   * existing diary/grow_events insert helper (e.g. quicklog_save_manual).
   */
  onLogEnvironmentCheck?: (draft: DiaryEnvironmentCheckDraft) => void;
  isLogging?: boolean;
  /** Optional grow scope used to build the timeline link href. */
  growId?: string | null;
}

function statusVariant(
  status: EcowittValidationStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "stale":
      return "secondary";
    case "rejected_test":
      return "destructive";
    case "not_validated":
    default:
      return "outline";
  }
}

function metricVariant(
  status: EcowittValidationMetricStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "accepted":
      return "default";
    case "rejected":
      return "destructive";
    case "missing":
      return "outline";
    case "not_checked":
    default:
      return "secondary";
  }
}

const METRIC_STATUS_LABEL: Record<EcowittValidationMetricStatus, string> = {
  accepted: "accepted",
  rejected: "rejected",
  missing: "missing",
  not_checked: "not_checked",
};

interface CopyButtonProps {
  label: string;
  command: string;
  testId: string;
}

function CopyButton({ label, command, testId }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(async () => {
    try {
      const clipboard =
        typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (clipboard?.writeText) {
        await clipboard.writeText(command);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; still flash confirmation so operator sees feedback.
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [command]);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      className="h-7 text-xs"
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function EcowittIngestValidationPanel({
  input,
  onRefresh,
  isRefreshing,
  onLogEnvironmentCheck,
  isLogging,
}: Props) {
  const vm = buildEcowittIngestValidationViewModel(input);
  const now = input.now ?? new Date();

  const diaryDraft = useMemo(
    () =>
      buildDiaryEnvironmentCheckDraft({
        tentId: input.tentId ?? null,
        capturedAt: vm.latestCapturedAt,
        status: vm.status,
        isTestSender: vm.isTestSender,
        invalidTest: vm.invalidTest,
        stale: vm.stale,
        sourceLabel: vm.sourceLabel,
        metricRows: vm.metricRows,
      }),
    [
      input.tentId,
      vm.latestCapturedAt,
      vm.status,
      vm.isTestSender,
      vm.invalidTest,
      vm.stale,
      vm.sourceLabel,
      vm.metricRows,
    ],
  );

  const handleLog = useCallback(() => {
    if (!onLogEnvironmentCheck) return;
    if (!diaryDraft.eligible) return;
    if (vm.alreadyLogged) return;
    onLogEnvironmentCheck(diaryDraft);
  }, [onLogEnvironmentCheck, diaryDraft, vm.alreadyLogged]);

  const [evidenceCopied, setEvidenceCopied] = useState(false);
  const [exported, setExported] = useState(false);

  const handleCopyEvidence = useCallback(async () => {
    const snap = buildLatestEvidenceSnapshot({
      hasEvidence: vm.hasEvidence,
      status: vm.status,
      statusMessage: vm.statusMessage,
      sourceLabel: vm.sourceLabel,
      tentScopedLabel: vm.tentScopedLabel,
      capturedAtLabel: vm.capturedAtLabel,
      isTestSender: vm.isTestSender,
      invalidTest: vm.invalidTest,
      stale: vm.stale,
      metricRows: vm.metricRows,
      rawPayload: vm.latestRawPayload,
      derivedReadingWarnings: vm.derivedReadingWarnings,
    });
    if (!snap) return;
    const text = serializeEvidenceForClipboard(snap);
    try {
      const clipboard =
        typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (clipboard?.writeText) await clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
    setEvidenceCopied(true);
    setTimeout(() => setEvidenceCopied(false), 2000);
  }, [vm]);

  const handleExport = useCallback(() => {
    const payload = buildEcowittValidationExport({
      tentScopedLabel: vm.tentScopedLabel,
      sourceLabel: vm.sourceLabel,
      now,
      thresholds: vm.thresholds,
      attempts: vm.exportAttempts,
    });
    const text = serializeExport(payload);
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ecowitt-validation-${now.toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      /* download unsupported; still flash feedback */
    }
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }, [vm.tentScopedLabel, vm.sourceLabel, vm.thresholds, vm.exportAttempts, now]);

  return (
    <Card data-testid="ecowitt-ingest-validation-panel">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">
            EcoWitt ingest validation
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Read-only local validation evidence for this tent (test data, not
            live sensor telemetry).
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {vm.testSenderBadge && (
            <Badge variant="outline" data-testid="test-sender-badge">
              {vm.testSenderBadge.label}
            </Badge>
          )}
          {vm.invalidTestBadge && (
            <Badge variant="destructive" data-testid="invalid-test-badge">
              {vm.invalidTestBadge.label}
            </Badge>
          )}
          <Badge
            variant={statusVariant(vm.status)}
            data-testid="validation-status-badge"
          >
            {vm.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p data-testid="validation-status-message">{vm.statusMessage}</p>

        {vm.derivedReadingWarnings.length > 0 ? (
          <ul
            data-testid="validation-derived-warnings"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
          >
            {vm.derivedReadingWarnings.map((w, i) => (
              <li key={i} data-testid={`derived-warning-${i}`}>
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div
          data-testid="validation-action-bar"
          className="flex flex-wrap items-center gap-2"
        >
          <CopyButton
            label="Copy accepted test command"
            command={ECOWITT_VALIDATION_COPY_COMMANDS.accepted}
            testId="copy-accepted-command-button"
          />
          <CopyButton
            label="Copy invalid test command"
            command={ECOWITT_VALIDATION_COPY_COMMANDS.invalid}
            testId="copy-invalid-command-button"
          />
          {onRefresh ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
              data-testid="refresh-validation-button"
              aria-label="Refresh local validation evidence"
              className="h-7 text-xs"
            >
              {isRefreshing ? "Refreshing…" : "Refresh evidence"}
            </Button>
          ) : null}
          {vm.hasEvidence && onLogEnvironmentCheck ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleLog}
              disabled={
                !diaryDraft.eligible || vm.alreadyLogged || !!isLogging
              }
              data-testid="log-environment-check-button"
              data-eligible={diaryDraft.eligible ? "true" : "false"}
              data-already-logged={vm.alreadyLogged ? "true" : "false"}
              aria-label="Log Environment Check to diary"
              className="h-7 text-xs"
            >
              {vm.alreadyLogged
                ? "Already logged"
                : isLogging
                  ? "Logging…"
                  : "Log Environment Check"}
            </Button>
          ) : null}
          {vm.hasEvidence ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleExport}
              data-testid="export-validation-button"
              aria-label="Export last 10 validation attempts as JSON"
              className="h-7 text-xs"
            >
              {exported ? "Exported" : "Export validation"}
            </Button>
          ) : null}
          {vm.hasEvidence ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleCopyEvidence}
              data-testid="copy-latest-evidence-button"
              aria-label="Copy latest evidence as redacted JSON"
              className="h-7 text-xs"
            >
              {evidenceCopied ? "Copied" : "Copy latest evidence"}
            </Button>
          ) : null}
        </div>


        {vm.hasEvidence ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt className="font-medium">Source</dt>
            <dd>{vm.sourceLabel}</dd>
            <dt className="font-medium">Vendor</dt>
            <dd>{vm.vendorLabel}</dd>
            <dt className="font-medium">Transport</dt>
            <dd>{vm.transportLabel}</dd>
            <dt className="font-medium">Tent</dt>
            <dd>{vm.tentScopedLabel}</dd>
            <dt className="font-medium">Captured</dt>
            <dd>
              {vm.capturedAtLabel}
              <span className="ml-2 opacity-70">({vm.ageLabel})</span>
            </dd>
          </dl>
        ) : null}

        {vm.hasEvidence ? (
          <div
            data-testid="validation-metric-chips"
            className="flex flex-wrap gap-1"
          >
            {vm.metricChips.map((chip) => (
              <Badge
                key={chip.key}
                variant={chip.present ? "secondary" : "outline"}
                data-testid={`metric-chip-${chip.key}`}
                data-present={chip.present ? "true" : "false"}
                className="text-[10px]"
              >
                {chip.label}
                {chip.present ? "" : " (missing)"}
              </Badge>
            ))}
          </div>
        ) : null}

        {vm.hasEvidence ? (
          <div data-testid="validation-metric-rows" className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Per-metric validation
            </h3>
            <ul className="divide-y divide-border rounded-md border border-border">
              {vm.metricRows.map((row) => (
                <li
                  key={row.key}
                  data-testid={`metric-row-${row.key}`}
                  data-status={row.status}
                  data-present={row.present ? "true" : "false"}
                  className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-xs"
                >
                  <span className="font-mono">{row.label}</span>
                  <span className="flex items-center gap-2">
                    {row.value !== null ? (
                      <span
                        data-testid={`metric-value-${row.key}`}
                        className="text-muted-foreground"
                      >
                        {row.value}
                      </span>
                    ) : null}
                    <Badge
                      variant={metricVariant(row.status)}
                      data-testid={`metric-status-${row.key}`}
                      className="text-[10px]"
                    >
                      {METRIC_STATUS_LABEL[row.status]}
                    </Badge>
                  </span>
                  {row.reason ? (
                    <span
                      data-testid={`metric-reason-${row.key}`}
                      className="basis-full text-[10px] text-muted-foreground"
                    >
                      {row.reason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vm.timeline.length > 0 ? (
          <div data-testid="validation-timeline" className="space-y-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Last {vm.timeline.length} local validation attempts
            </h3>
            <ol className="divide-y divide-border rounded-md border border-border">
              {vm.timeline.map((entry) => (
                <li
                  key={entry.key}
                  data-testid={`timeline-entry-${entry.key}`}
                  data-status={entry.status}
                  data-invalid={entry.invalidTest ? "true" : "false"}
                  data-stale={entry.stale ? "true" : "false"}
                  className="flex flex-wrap items-center justify-between gap-2 px-2 py-1 text-xs"
                >
                  <span className="font-mono text-muted-foreground">
                    {entry.capturedAtLabel}
                    <span className="ml-1 opacity-70">({entry.ageLabel})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Badge
                      variant={statusVariant(entry.status)}
                      className="text-[10px]"
                      data-testid={`timeline-status-${entry.key}`}
                    >
                      {entry.statusLabel}
                    </Badge>
                    {entry.invalidTest ? (
                      <Badge
                        variant="destructive"
                        className="text-[10px]"
                        data-testid={`timeline-invalid-${entry.key}`}
                      >
                        invalid
                      </Badge>
                    ) : null}
                    {entry.stale ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px]"
                        data-testid={`timeline-stale-${entry.key}`}
                      >
                        stale
                      </Badge>
                    ) : null}
                  </span>
                  <span className="basis-full text-[10px] text-muted-foreground">
                    {entry.metricSummary}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {vm.nextSteps.length > 0 ? (
          <ul
            data-testid="validation-next-steps"
            className="list-disc pl-5 text-xs text-muted-foreground"
          >
            {vm.nextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        ) : null}

        <div
          data-testid="validation-cli-hints"
          className="rounded-md border border-dashed border-border p-3 text-xs"
        >
          <p className="mb-1 font-medium">Local test sender commands:</p>
          <ul className="space-y-1">
            {vm.cliHints.map((hint) => (
              <li key={hint.command}>
                <span className="text-muted-foreground">{hint.label}:</span>{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  {hint.command}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default EcowittIngestValidationPanel;
