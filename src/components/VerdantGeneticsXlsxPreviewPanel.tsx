/**
 * VerdantGeneticsXlsxPreviewPanel — presenter for Verdant Genetics
 * multi-tent XLSX exports.
 *
 * Preview only. Persistence for the verdant_genetics_xlsx source app is
 * intentionally disabled:
 *   - The save button is rendered disabled.
 *   - No Supabase calls. No alerts. No Action Queue writes. No AI.
 *     No device control.
 *   - CSV history language is used; XLSX rows are never labeled live.
 *   - Raw payloads, device serials, bridge tokens, and internal IDs are
 *     never rendered.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildVerdantGeneticsXlsxPreviewViewModel,
  VERDANT_GENETICS_CSV_HISTORY_COPY,
  VERDANT_GENETICS_FORMAT_LABEL,
  VERDANT_GENETICS_IMPORT_DISABLED_COPY,
  UNKNOWN_XLSX_COPY,
} from "@/lib/verdantGeneticsXlsxPreviewViewModel";
import {
  buildInitialMappingState,
  setGroupMapping,
  buildMappingReadiness,
  XLSX_MAPPING_REQUIRED_COPY,
  XLSX_NO_TENTS_COPY,
  XLSX_IMPORT_SAVING_DISABLED_COPY,
  type TentOption,
} from "@/lib/verdantGeneticsXlsxMappingViewModel";
import {
  buildVerdantGeneticsXlsxInsertRows,
  type VerdantGeneticsXlsxInsertRowsResult,
} from "@/lib/verdantGeneticsXlsxInsertRowsAdapter";
import {
  buildVerdantGeneticsXlsxImportEvidenceViewModel,
  type VerdantGeneticsXlsxImportEvidenceViewModel,
} from "@/lib/verdantGeneticsXlsxImportEvidenceViewModel";
import type { CellGrid } from "@/lib/verdantGeneticsXlsxParser";

export interface VerdantGeneticsXlsxSaveArgs {
  tentIdBySensorGroup: Record<string, string>;
  importBatchId: string;
  adapterResult: VerdantGeneticsXlsxInsertRowsResult;
}

/**
 * Outcome returned by a duplicate-aware save handler. When provided, the
 * panel renders inserted/duplicate counts and a no-live-telemetry line
 * instead of the legacy attempted-rows success copy. A fully-duplicate
 * save is a successful no-op, not a failure.
 */
export interface VerdantGeneticsXlsxSaveOutcome {
  inserted: number;
  duplicates: number;
  totalRows: number;
  diagnostic?: string;
}

export interface VerdantGeneticsXlsxPreviewPanelProps {
  grid: CellGrid;
  tentOptions?: TentOption[];
  growId?: string | null;
  /**
   * Parent-owned save handler. When omitted the save button stays disabled
   * with the "coming later" copy (preview-only mode). When provided the
   * button enables only when mapping is complete and the adapter emits
   * at least one row that is not blocked. May resolve to a
   * `VerdantGeneticsXlsxSaveOutcome` to surface duplicate-aware counts.
   */
  onSave?: (
    args: VerdantGeneticsXlsxSaveArgs,
  ) => Promise<void | VerdantGeneticsXlsxSaveOutcome> | void | VerdantGeneticsXlsxSaveOutcome;
  /**
   * Optional post-success CTA. When provided, a "View imported history"
   * button is rendered after a successful save outcome. Navigation/filter
   * scope is owned entirely by the parent — the panel never invents URLs
   * or filter params and never claims live telemetry.
   */
  onViewImportedHistory?: () => void;
}

function newImportBatchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      /* noop */
    }
  }
  return `xlsx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

const XLSX_SAVE_SUCCESS_PREFIX =
  "Imported XLSX sensor history as CSV history." as const;

export function VerdantGeneticsXlsxPreviewPanel({
  grid,
  tentOptions = [],
  growId,
  onSave,
  onViewImportedHistory,
}: VerdantGeneticsXlsxPreviewPanelProps) {
  const vm = buildVerdantGeneticsXlsxPreviewViewModel(grid);
  const [mappingState, setMappingState] = useState(() =>
    buildInitialMappingState(vm.detectedGroups),
  );
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [savedCount, setSavedCount] = useState<number>(0);
  const [saveOutcome, setSaveOutcome] =
    useState<VerdantGeneticsXlsxSaveOutcome | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedEvidence, setSavedEvidence] =
    useState<VerdantGeneticsXlsxImportEvidenceViewModel | null>(null);

  const readiness = buildMappingReadiness(
    vm.detectedGroups,
    mappingState.tentIdBySensorGroup,
  );

  const hasTents = tentOptions.length > 0;

  // Pure adapter run — derives accepted/rejected/blocked for UI decisions.
  // No I/O. Safe to recompute on each render.
  const adapterResult = useMemo<VerdantGeneticsXlsxInsertRowsResult>(() => {
    return buildVerdantGeneticsXlsxInsertRows({
      preview: vm.raw,
      tentIdBySensorGroup: mappingState.tentIdBySensorGroup,
      growId: growId ?? undefined,
      importBatchId: "preview",
    });
  }, [vm.raw, mappingState.tentIdBySensorGroup, growId]);

  const saveEnabled =
    !!onSave &&
    readiness.allMapped &&
    !adapterResult.blocked &&
    adapterResult.rows.length > 0 &&
    saveStatus !== "saving";

  async function handleSaveClick() {
    if (!onSave) return;
    if (!saveEnabled) return;
    setSaveStatus("saving");
    setSaveError(null);
    setSavedEvidence(null);
    setSaveOutcome(null);
    try {
      const importBatchId = newImportBatchId();
      const freshResult = buildVerdantGeneticsXlsxInsertRows({
        preview: vm.raw,
        tentIdBySensorGroup: mappingState.tentIdBySensorGroup,
        growId: growId ?? undefined,
        importBatchId,
      });
      const outcome = await onSave({
        tentIdBySensorGroup: { ...mappingState.tentIdBySensorGroup },
        importBatchId,
        adapterResult: freshResult,
      });
      setSavedCount(freshResult.acceptedRowCount);
      if (outcome && typeof outcome === "object") {
        setSaveOutcome(outcome);
      }
      setSavedEvidence(
        buildVerdantGeneticsXlsxImportEvidenceViewModel({
          adapterResult: freshResult,
          previewVm: vm,
          tentIdBySensorGroup: mappingState.tentIdBySensorGroup,
          tentOptions,
          importBatchId,
        }),
      );
      setSaveStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setSaveError(msg);
      setSaveStatus("error");
    }
  }



  return (
    <section
      data-testid="verdant-genetics-xlsx-preview"
      className="mt-4 rounded-xl border border-border/60 p-3 grid gap-3 text-xs"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" data-testid="vg-xlsx-format">
          {VERDANT_GENETICS_FORMAT_LABEL}
        </Badge>
        <Badge
          variant="outline"
          data-testid="vg-xlsx-source-app"
          className="font-mono"
        >
          {vm.sourceApp}
        </Badge>
        <Badge variant="outline" data-testid="vg-xlsx-canonical-source">
          {vm.canonicalSourceLabel}
        </Badge>
      </header>

      <p
        className="text-muted-foreground"
        data-testid="vg-xlsx-csv-history-copy"
      >
        {VERDANT_GENETICS_CSV_HISTORY_COPY}
      </p>

      {vm.unknownShape && (
        <p
          role="alert"
          className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200"
          data-testid="vg-xlsx-unknown-shape"
        >
          {UNKNOWN_XLSX_COPY}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat
          label="Detected sensor groups"
          value={
            vm.detectedGroups.length > 0
              ? vm.detectedGroups.join(", ")
              : "—"
          }
          testId="vg-xlsx-detected-groups"
        />
        <Stat
          label="Date range"
          value={
            vm.dateRange
              ? `${fmtDate(vm.dateRange.start)} → ${fmtDate(vm.dateRange.end)}`
              : "—"
          }
          testId="vg-xlsx-date-range"
        />
        <Stat
          label="Timestamp rows"
          value={String(vm.timestampRowCount)}
          testId="vg-xlsx-timestamp-rows"
        />
        <Stat
          label="Mapped metrics"
          value={String(vm.mappedMetricCount)}
          testId="vg-xlsx-mapped-metrics"
        />
        <Stat
          label="Rejected / blank columns"
          value={String(vm.rejectedMetricCount)}
          testId="vg-xlsx-rejected-metrics"
        />
        <Stat
          label="Suspicious flags"
          value={String(vm.suspiciousCount)}
          testId="vg-xlsx-suspicious-count"
        />
      </div>

      {vm.suspicious.length > 0 && (
        <ul
          data-testid="vg-xlsx-suspicious-list"
          className="grid gap-1 text-amber-200/90"
        >
          {vm.suspicious.slice(0, 10).map((s, i) => (
            <li
              key={`${s.kind}-${i}`}
              data-testid={`vg-xlsx-suspicious-${s.kind}`}
            >
              <span className="font-mono">{s.kind}</span> · {s.note}
            </li>
          ))}
        </ul>
      )}

      {vm.rejected.length > 0 && (
        <ul
          data-testid="vg-xlsx-rejected-list"
          className="grid gap-1 text-muted-foreground"
        >
          {vm.rejected.slice(0, 10).map((r) => (
            <li
              key={`${r.column_index}-${r.reason}`}
              data-testid={`vg-xlsx-rejected-${r.column_index}`}
            >
              <span className="font-mono">
                col {r.column_index}
                {r.sensor_group ? ` · ${r.sensor_group}` : ""}
              </span>{" "}
              · {r.original_metric_label || "(blank)"} — {r.reason}
            </li>
          ))}
        </ul>
      )}

      {/* Tent mapping section */}
      {vm.detectedGroups.length > 0 && (
        <div
          className="rounded-md border border-border/60 p-3 grid gap-2"
          data-testid="vg-xlsx-mapping-section"
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Sensor group → Tent mapping
          </p>
          <p
            className="text-muted-foreground"
            data-testid="vg-xlsx-mapping-required-copy"
          >
            {XLSX_MAPPING_REQUIRED_COPY}
          </p>

          {!hasTents && (
            <p
              role="alert"
              className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200"
              data-testid="vg-xlsx-no-tents"
            >
              {XLSX_NO_TENTS_COPY}
            </p>
          )}

          {vm.detectedGroups.map((group) => {
            const selectedTentId = mappingState.tentIdBySensorGroup[group] ?? "";
            return (
              <div
                key={group}
                className="grid grid-cols-[1fr_auto] items-center gap-2"
                data-testid={`vg-xlsx-mapping-row-${group}`}
              >
                <span
                  className="font-mono text-xs"
                  data-testid={`vg-xlsx-group-label-${group}`}
                >
                  {group}
                </span>
                {hasTents ? (
                  <Select
                    value={selectedTentId || "__none__"}
                    onValueChange={(value) =>
                      setMappingState((prev) =>
                        setGroupMapping(
                          prev,
                          group,
                          value === "__none__" ? null : value,
                        ),
                      )
                    }
                  >
                    <SelectTrigger
                      className="h-8 w-48 text-xs"
                      data-testid={`vg-xlsx-tent-select-${group}`}
                    >
                      <SelectValue placeholder="Select tent…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Unmapped —</SelectItem>
                      {tentOptions.map((t) => (
                        <SelectItem
                          key={t.id}
                          value={t.id}
                          data-testid={`vg-xlsx-tent-option-${group}-${t.id}`}
                        >
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground text-[11px]">
                    —
                  </span>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-3 gap-2 mt-1">
            <Stat
              label="Mapped groups"
              value={String(readiness.mappedCount)}
              testId="vg-xlsx-mapped-count"
            />
            <Stat
              label="Unmapped groups"
              value={String(readiness.unmappedCount)}
              testId="vg-xlsx-unmapped-count"
            />
            <Stat
              label="All mapped"
              value={readiness.allMapped ? "Yes" : "No"}
              testId="vg-xlsx-all-mapped"
            />
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="vg-xlsx-import-block"
      >
        {onSave ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveClick}
              disabled={!saveEnabled}
              aria-disabled={!saveEnabled}
              data-testid="vg-xlsx-save"
            >
              {saveStatus === "saving"
                ? "Saving…"
                : `Save XLSX history (${adapterResult.acceptedRowCount} rows)`}
            </Button>
            {!readiness.allMapped && (
              <span
                className="text-[11px] text-amber-200/80"
                data-testid="vg-xlsx-save-needs-mapping"
              >
                {XLSX_MAPPING_REQUIRED_COPY}
              </span>
            )}
            {readiness.allMapped &&
              adapterResult.blocked && (
                <span
                  className="text-[11px] text-amber-200/80"
                  data-testid="vg-xlsx-save-blocked"
                >
                  No XLSX sensor readings were imported.
                  {" "}
                  {adapterResult.blockedReason === "missing_tent_mapping"
                    ? "Some sensor groups are unmapped."
                    : "No readable sensor rows found."}
                </span>
              )}
            {readiness.allMapped &&
              !adapterResult.blocked &&
              adapterResult.rejectedRowCount > 0 && (
                <span
                  className="text-[11px] text-amber-200/80"
                  data-testid="vg-xlsx-save-partial-rejection"
                >
                  {adapterResult.rejectedRowCount} rows rejected (
                  {Object.entries(adapterResult.rejectionReasons)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ")}
                  ).
                </span>
              )}
            {saveStatus === "success" && (
              <span
                className="text-[11px] text-emerald-300/90"
                data-testid="vg-xlsx-save-success"
              >
                {saveOutcome
                  ? (saveOutcome.diagnostic
                    ?? (saveOutcome.inserted === 0 && saveOutcome.duplicates > 0
                      ? `Imported 0 new readings. Skipped ${saveOutcome.duplicates} duplicate${saveOutcome.duplicates === 1 ? "" : "s"} already present for this tent. No live sensor data was created.`
                      : saveOutcome.duplicates > 0
                        ? `Imported ${saveOutcome.inserted} new reading${saveOutcome.inserted === 1 ? "" : "s"}. Skipped ${saveOutcome.duplicates} duplicate${saveOutcome.duplicates === 1 ? "" : "s"} already present for this tent. No live sensor data was created.`
                        : `${XLSX_SAVE_SUCCESS_PREFIX} ${saveOutcome.inserted} rows imported. No live sensor data was created.`))
                  : `${XLSX_SAVE_SUCCESS_PREFIX} ${savedCount} rows imported.`}
              </span>
            )}
            {saveStatus === "success" && onViewImportedHistory && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onViewImportedHistory}
                data-testid="vg-xlsx-view-imported-history"
              >
                View imported history
              </Button>
            )}
            {saveStatus === "error" && saveError && (
              <span
                role="alert"
                className="text-[11px] text-destructive"
                data-testid="vg-xlsx-save-error"
              >
                {saveError}
              </span>
            )}
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              disabled
              aria-disabled="true"
              data-testid="vg-xlsx-save-disabled"
              title={XLSX_IMPORT_SAVING_DISABLED_COPY}
            >
              Save XLSX history — coming later
            </Button>
            <span
              className="text-[11px] text-amber-200/80"
              data-testid="vg-xlsx-import-disabled-reason"
            >
              {XLSX_IMPORT_SAVING_DISABLED_COPY}
            </span>
          </>
        )}
      </div>

      {/* Evidence summary — read-only post-import proof */}
      {savedEvidence && (
        <div
          className="rounded-md border border-emerald-400/30 bg-emerald-400/5 p-3 grid gap-2"
          data-testid="vg-xlsx-evidence-panel"
        >
          <header className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" data-testid="vg-xlsx-evidence-source-label">
              {savedEvidence.sourceLabel}
            </Badge>
            <Badge variant="secondary" data-testid="vg-xlsx-evidence-source-app-label">
              {savedEvidence.sourceAppLabel}
            </Badge>
            <span
              className="text-[10px] text-muted-foreground font-mono"
              data-testid="vg-xlsx-evidence-batch-id"
            >
              batch {savedEvidence.importBatchIdTruncated}
            </span>
          </header>

          <p
            className="text-muted-foreground"
            data-testid="vg-xlsx-evidence-csv-history-copy"
          >
            {savedEvidence.csvHistoryCopy}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label="Accepted rows"
              value={String(savedEvidence.acceptedRowCount)}
              testId="vg-xlsx-evidence-accepted"
            />
            <Stat
              label="Rejected rows"
              value={String(savedEvidence.rejectedRowCount)}
              testId="vg-xlsx-evidence-rejected"
            />
            <Stat
              label="Date range"
              value={savedEvidence.dateRangeLabel}
              testId="vg-xlsx-evidence-date-range"
            />
            <Stat
              label="Metrics"
              value={
                savedEvidence.metricsImported.length > 0
                  ? savedEvidence.metricsImported.join(", ")
                  : "—"
              }
              testId="vg-xlsx-evidence-metrics"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Mapped groups"
              value={savedEvidence.mappedGroups
                .map((g) => g.sensorGroup)
                .join(", ")}
              testId="vg-xlsx-evidence-mapped-groups"
            />
            <Stat
              label="Mapped tents"
              value={savedEvidence.mappedGroups
                .map((g) => g.tentLabel ?? "—")
                .join(", ")}
              testId="vg-xlsx-evidence-mapped-tents"
            />
          </div>

          {savedEvidence.hasRejections && (
            <div
              className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-200/90"
              data-testid="vg-xlsx-evidence-partial-rejection-warning"
            >
              {savedEvidence.partialRejectionWarning}
            </div>
          )}

          {savedEvidence.rejectionReasons.length > 0 && (
            <ul
              className="grid gap-1 text-muted-foreground"
              data-testid="vg-xlsx-evidence-rejection-reasons"
            >
              {savedEvidence.rejectionReasons.map((r) => (
                <li key={r.reason} data-testid={`vg-xlsx-evidence-rejection-${r.reason}`}>
                  <span className="font-mono">{r.reason}</span> · {r.count}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xs" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

export default VerdantGeneticsXlsxPreviewPanel;
