import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  buildCsvImportPlan,
  KNOWN_IMPORT_METRICS,
  type CsvImportPlan,
  type ImportMetric,
  type OwnershipContext,
  type PreviewRowInput,
} from "@/lib/csvImportPlanRules";
import {
  BLOCKED_SAMPLE_PER_REASON_MAX,
  buildCsvImportPlanReport,
  groupBlockedRowsByReason,
  SENSOR_SAMPLE_MAX,
  serializeCsvImportPlanReport,
  type BlockedRowContext,
} from "@/lib/csvImportPlanReport";
import type { CsvPreviewParseResult } from "@/lib/csvSensorPreviewRules";

/**
 * CsvPreviewReviewGate — presentational-only review gate + import plan summary
 * for the future CSV/TSV → sensor import flow.
 *
 * Safe-by-Design:
 *  - No write handler. No Supabase call. No diary insert.
 *    No alerts. No Action Queue. No AI. No automation. No device control.
 *  - The Save/Convert button is ALWAYS disabled in this build.
 *  - The plan summary is computed in-memory from the existing preview state.
 */
export interface CsvPreviewReviewGateProps {
  hasHardBlockedRows: boolean;
  hasAcceptedRows: boolean;
  previewResult?: CsvPreviewParseResult | null;
  /** Optional injectable clock for deterministic tests/exports. */
  now?: Date;
  /** Optional existing diary entries (currently none surfaced — disabled UI). */
  existingDiaryEntries?: ReadonlyArray<{ id: string; summary: string }>;
}

const CONFIRM_COPY =
  "I confirm this is my data and understand this import is not live data.";
const FUTURE_FLOW_COPY =
  "Import requires review and will be enabled in a separate approval-required flow.";
const EXISTING_DIARY_DISABLED_COPY =
  "Existing diary entry selection will be enabled with the reviewed import flow.";
const SAMPLE_ONLY_COPY = "Sample only. Nothing has been saved.";

interface BuiltPlan {
  plan: CsvImportPlan;
  contextByRow: Map<number, BlockedRowContext>;
}

function buildPlanFromPreview(
  result: CsvPreviewParseResult,
  growId: string,
  tentId: string,
  plantId: string,
  now: Date,
): BuiltPlan {
  const uid = "preview-user";
  const effectiveGrow = growId.trim() || "preview-grow";
  const effectiveTent = tentId.trim() || "preview-tent";
  const effectivePlant = plantId.trim() || "";

  const ownership: OwnershipContext = {
    authenticated: true,
    userId: uid,
    grow: { id: effectiveGrow, ownerUserId: uid },
    tent: { id: effectiveTent, growId: effectiveGrow, ownerUserId: uid },
    plant: effectivePlant
      ? { id: effectivePlant, tentId: effectiveTent, growId: effectiveGrow, ownerUserId: uid }
      : null,
  };

  const tsIdx = result.mappings.findIndex((m) => m.field === "captured_at");
  const flagByHeader = new Map(result.flags.map((f) => [f.header, f]));
  const knownMetrics = new Set<string>(KNOWN_IMPORT_METRICS as readonly string[]);

  const rows: PreviewRowInput[] = [];
  const contextByRow = new Map<number, BlockedRowContext>();
  let rowIndex = 0;
  for (const dataRow of result.rows ?? []) {
    const capturedAtRaw = tsIdx >= 0 ? (dataRow[tsIdx] ?? "") : "";
    result.mappings.forEach((m, colIdx) => {
      if (!m.field || m.field === "captured_at") return;
      if (!knownMetrics.has(m.field)) return;
      const raw = dataRow[colIdx];
      if (raw == null || raw === "") return;
      const numeric = Number(raw);
      const value = Number.isFinite(numeric) ? numeric : null;
      const flag = flagByHeader.get(m.header);
      const hardFlags = flag && flag.severity === "error" ? [flag.code] : [];
      const softFlags = flag && flag.severity === "warn" ? [flag.code] : [];
      const rawRow: Record<string, unknown> = {};
      result.headers.forEach((h, i) => {
        rawRow[h] = dataRow[i];
      });
      const idx = rowIndex++;
      contextByRow.set(idx, {
        rowIndex: idx,
        header: m.header,
        attemptedMetric: m.field,
        rawValue: raw,
      });
      rows.push({
        rowIndex: idx,
        capturedAtRaw,
        metric: m.field as ImportMetric,
        value,
        hardFlags,
        softFlags,
        raw: rawRow,
      });
    });
  }

  const plan = buildCsvImportPlan({
    filename: result.fileName ?? "",
    fileSizeBytes: 0,
    totalRowCount: result.totalRows ?? (result.rows ?? []).length,
    source: result.sourceLabel,
    columnMappingVersion: "v1",
    rows,
    unmappedHeaders: result.unmapped ?? [],
    detectedDeviceControlHeaders: [],
    ownership,
    now,
  });
  return { plan, contextByRow };
}

function reasonCounts(items: ReadonlyArray<{ reasons: ReadonlyArray<string> }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) for (const r of it.reasons) out[r] = (out[r] ?? 0) + 1;
  return out;
}

function downloadJsonBlob(filename: string, jsonText: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function CsvPreviewReviewGate({
  hasHardBlockedRows,
  hasAcceptedRows,
  previewResult,
  now,
  existingDiaryEntries,
}: CsvPreviewReviewGateProps) {
  const [growId, setGrowId] = useState("");
  const [tentId, setTentId] = useState("");
  const [plantId, setPlantId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [showSensorSample, setShowSensorSample] = useState(false);
  const [attachMode, setAttachMode] = useState<"new" | "existing">("new");
  const [expandedBlockedReasons, setExpandedBlockedReasons] = useState<Record<string, boolean>>({});
  const toggleBlockedReason = (r: string) =>
    setExpandedBlockedReasons((p) => ({ ...p, [r]: !p[r] }));

  // Stable clock per mount unless caller injects one (tests/exports).
  const [mountedNow] = useState<Date>(() => now ?? new Date());
  const effectiveNow = now ?? mountedNow;

  const built = useMemo<BuiltPlan | null>(() => {
    if (!previewResult || !previewResult.ok) return null;
    return buildPlanFromPreview(previewResult, growId, tentId, plantId, effectiveNow);
  }, [previewResult, growId, tentId, plantId, effectiveNow]);

  const plan = built?.plan ?? null;

  const [diaryDate, setDiaryDate] = useState<string>(() =>
    effectiveNow.toISOString().slice(0, 16),
  );

  const checks = useMemo(
    () => ({
      growSelected: growId.trim().length > 0,
      tentSelected: tentId.trim().length > 0,
      confirmed,
      hasAcceptedRows: plan ? plan.acceptedWrites.length > 0 : hasAcceptedRows,
      noHardBlocks: plan
        ? plan.blockedRows.length === 0 && plan.hardBlockReasons.length === 0
        : !hasHardBlockedRows,
    }),
    [growId, tentId, confirmed, plan, hasAcceptedRows, hasHardBlockedRows],
  );

  const gateReady =
    checks.growSelected &&
    checks.tentSelected &&
    checks.confirmed &&
    checks.hasAcceptedRows &&
    checks.noHardBlocks;

  const WRITES_ENABLED = false;
  const hasExistingEntries = (existingDiaryEntries?.length ?? 0) > 0;

  const blockedReasonCounts = plan ? reasonCounts(plan.blockedRows) : {};
  const metricBreakdown = plan?.summary.metricBreakdown ?? {};
  const dateRange = plan?.summary.dateRange ?? { start: null, end: null };

  const blockedGroups = useMemo(
    () =>
      plan
        ? groupBlockedRowsByReason(plan.blockedRows, built?.contextByRow ?? new Map())
        : [],
    [plan, built],
  );

  const sensorSample = useMemo(
    () => (plan ? plan.acceptedWrites.slice(0, SENSOR_SAMPLE_MAX) : []),
    [plan],
  );

  const occurredAtIso = useMemo(() => {
    const d = new Date(diaryDate);
    return Number.isFinite(d.getTime()) ? d.toISOString() : effectiveNow.toISOString();
  }, [diaryDate, effectiveNow]);

  const diaryDraftDisplay = useMemo(() => {
    if (!plan?.diarySummaryDraft) return null;
    return { ...plan.diarySummaryDraft, occurred_at: occurredAtIso };
  }, [plan, occurredAtIso]);

  const handleDownloadPlan = () => {
    if (!plan || !previewResult) return;
    const report = buildCsvImportPlanReport(
      { ...plan, diarySummaryDraft: diaryDraftDisplay ?? plan.diarySummaryDraft },
      { fileName: previewResult.fileName ?? null, sourceType: previewResult.sourceLabel ?? null },
      {
        generatedAt: effectiveNow.toISOString(),
        blockedRowContext: built?.contextByRow,
      },
    );
    const json = serializeCsvImportPlanReport(report);
    const safeName = (previewResult.fileName ?? "import").replace(/[^a-z0-9._-]+/gi, "_");
    downloadJsonBlob(`${safeName}.import-plan.json`, json);
  };

  return (
    <section
      data-testid="csv-preview-review-gate"
      data-gate-ready={gateReady ? "true" : "false"}
      className="rounded-md border border-border bg-muted/20 p-4 space-y-3"
      aria-label="Future import review gate (disabled)"
    >
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Future import review (preview only)</h3>
        <span className="text-xs text-muted-foreground">{FUTURE_FLOW_COPY}</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="csv-gate-grow-id" className="text-xs">Grow</Label>
          <Input id="csv-gate-grow-id" data-testid="csv-gate-grow-id" value={growId} onChange={(e) => setGrowId(e.target.value)} placeholder="grow id" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="csv-gate-tent-id" className="text-xs">Tent</Label>
          <Input id="csv-gate-tent-id" data-testid="csv-gate-tent-id" value={tentId} onChange={(e) => setTentId(e.target.value)} placeholder="tent id" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="csv-gate-plant-id" className="text-xs">Plant (optional)</Label>
          <Input id="csv-gate-plant-id" data-testid="csv-gate-plant-id" value={plantId} onChange={(e) => setPlantId(e.target.value)} placeholder="plant id" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs">
        <Checkbox id="csv-gate-confirm" data-testid="csv-gate-confirm" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
        <span>{CONFIRM_COPY}</span>
      </label>

      {plan && (
        <div data-testid="csv-import-plan-summary" className="rounded border border-border/60 bg-background/40 p-3 space-y-3 text-xs">
          <div className="flex flex-wrap gap-2" data-testid="csv-import-plan-counts">
            <Badge variant="secondary" data-testid="csv-import-plan-accepted">Accepted: {plan.acceptedWrites.length}</Badge>
            <Badge variant="secondary" data-testid="csv-import-plan-blocked">Blocked: {plan.blockedRows.length}</Badge>
            <Badge variant="secondary" data-testid="csv-import-plan-duplicates">Duplicates skipped: {plan.duplicateSkipped.length}</Badge>
            <Badge variant="secondary" data-testid="csv-import-plan-ignored">Ignored columns: {plan.ignoredUnmappedHeaders.length + plan.ignoredDeviceControlHeaders.length}</Badge>
            <Badge variant="outline" data-testid="csv-import-plan-write-drafts">Sensor write drafts: {plan.acceptedWrites.length}</Badge>
          </div>

          <div data-testid="csv-import-plan-metric-breakdown">
            <div className="font-semibold mb-1">Metric breakdown</div>
            {Object.keys(metricBreakdown).length === 0 ? (
              <div className="text-muted-foreground">No accepted metrics yet.</div>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {Object.entries(metricBreakdown).map(([m, n]) => (
                  <li key={m}>
                    <Badge variant="outline" data-testid={`csv-import-plan-metric-${m}`}>{m}: {n}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div data-testid="csv-import-plan-date-range" className="text-muted-foreground">
            Date range: {dateRange.start ?? "—"} → {dateRange.end ?? "—"}
          </div>

          <div data-testid="csv-import-plan-hard-blocks">
            {plan.hardBlockReasons.length > 0 ? (
              <>
                <div className="font-semibold text-destructive mb-1">Batch blocked</div>
                <ul className="flex flex-wrap gap-1">
                  {plan.hardBlockReasons.map((r) => (
                    <li key={r}><Badge variant="destructive">{r}</Badge></li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>

          <div data-testid="csv-import-plan-blocked-reasons">
            <div className="font-semibold mb-1">Blocked rows by reason</div>
            {Object.keys(blockedReasonCounts).length === 0 ? (
              <div className="text-muted-foreground space-y-0.5" data-testid="csv-import-plan-blocked-empty">
                <div>No blocked rows detected.</div>
                <div>Verdant still requires review before any future import.</div>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {Object.entries(blockedReasonCounts).map(([reason, n]) => (
                  <li key={reason}>
                    <Badge variant="outline" data-testid={`csv-import-plan-block-${reason}`}>{reason}: {n}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Why rows were blocked: explanations + per-group expand/collapse */}
          {blockedGroups.length > 0 && (
            <div data-testid="csv-import-plan-blocked-explanations" className="space-y-2">
              <div className="font-semibold">Why rows were blocked</div>
              {blockedGroups.map((g) => {
                const expanded = !!expandedBlockedReasons[g.reason];
                return (
                  <div
                    key={g.reason}
                    data-testid={`csv-import-plan-blocked-group-${g.reason}`}
                    data-expanded={expanded ? "true" : "false"}
                    className="rounded border border-border/60 bg-muted/20 p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{g.title}</span>
                        <Badge variant="outline" data-testid={`csv-import-plan-blocked-count-${g.reason}`}>{g.count}</Badge>
                      </div>
                      {g.samples.length > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`csv-import-plan-blocked-toggle-${g.reason}`}
                          onClick={() => toggleBlockedReason(g.reason)}
                        >
                          {expanded ? "Hide sample rows" : "Show sample rows"}
                        </Button>
                      )}
                    </div>
                    <div className="text-muted-foreground">{g.explanation}</div>
                    <div data-testid={`csv-import-plan-blocked-fix-${g.reason}`}>
                      <span className="font-medium">Fix: </span>{g.fix}
                    </div>
                    {expanded && g.samples.length > 0 && (
                      <ul
                        data-testid={`csv-import-plan-blocked-samples-${g.reason}`}
                        data-sample-count={Math.min(g.samples.length, BLOCKED_SAMPLE_PER_REASON_MAX)}
                        className="list-disc pl-5"
                      >
                        {g.samples.slice(0, BLOCKED_SAMPLE_PER_REASON_MAX).map((s, i) => (
                          <li key={i}>
                            row {s.rowIndex + 1}
                            {s.header ? ` · column "${s.header}"` : ""}
                            {s.attemptedMetric ? ` · ${s.attemptedMetric}` : ""}
                            {s.rawValue !== undefined ? ` · raw=${String(s.rawValue).slice(0, 40)}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}


          {/* Diary summary draft target controls */}
          <div data-testid="csv-import-plan-diary-summary" className="space-y-2">
            <div className="font-semibold">Diary summary draft (preview, not saved)</div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="csv-gate-diary-date" className="text-xs">Diary date / occurred at</Label>
                <Input
                  id="csv-gate-diary-date"
                  type="datetime-local"
                  data-testid="csv-gate-diary-date"
                  value={diaryDate}
                  onChange={(e) => setDiaryDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Attach mode</Label>
                <div className="flex flex-col gap-1 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="csv-gate-attach-mode"
                      data-testid="csv-gate-attach-new"
                      checked={attachMode === "new"}
                      onChange={() => setAttachMode("new")}
                    />
                    Create new diary summary entry
                  </label>
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="radio"
                      name="csv-gate-attach-mode"
                      data-testid="csv-gate-attach-existing"
                      checked={attachMode === "existing"}
                      onChange={() => hasExistingEntries && setAttachMode("existing")}
                      disabled={!hasExistingEntries}
                    />
                    Attach to existing diary entry
                  </label>
                  {!hasExistingEntries && (
                    <div
                      data-testid="csv-gate-attach-existing-disabled-copy"
                      className="text-muted-foreground space-y-0.5"
                    >
                      <div>Existing diary entry attach is not available in preview mode.</div>
                      <div>For now, Verdant shows the single diary summary draft that would be created later.</div>
                      <div>No diary entry is created from this screen.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {diaryDraftDisplay ? (
              <div className="rounded border border-border/60 bg-muted/30 p-2 space-y-1" data-testid="csv-import-plan-diary-summary-card">
                <div>{diaryDraftDisplay.summary}</div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-muted-foreground" data-testid="csv-import-plan-diary-draft-fields">
                  <dt>grow_id</dt><dd data-testid="diary-field-grow_id">{diaryDraftDisplay.grow_id}</dd>
                  <dt>tent_id</dt><dd data-testid="diary-field-tent_id">{diaryDraftDisplay.tent_id}</dd>
                  <dt>plant_id</dt><dd data-testid="diary-field-plant_id">{diaryDraftDisplay.plant_id ?? "—"}</dd>
                  <dt>occurred_at</dt><dd data-testid="diary-field-occurred_at">{diaryDraftDisplay.occurred_at}</dd>
                  <dt>source</dt><dd data-testid="diary-field-source">{diaryDraftDisplay.details.source}</dd>
                  <dt>import_batch_id</dt><dd data-testid="diary-field-import_batch_id">{diaryDraftDisplay.details.import_batch_id.slice(0, 16)}…</dd>
                  <dt>filename</dt><dd data-testid="diary-field-filename">{diaryDraftDisplay.details.filename || "—"}</dd>
                  <dt>row_count</dt><dd data-testid="diary-field-row_count">{diaryDraftDisplay.details.row_count}</dd>
                  <dt>accepted_count</dt><dd data-testid="diary-field-accepted_count">{diaryDraftDisplay.details.accepted_count}</dd>
                  <dt>blocked_count</dt><dd data-testid="diary-field-blocked_count">{diaryDraftDisplay.details.blocked_count}</dd>
                  <dt>duplicate_skipped_count</dt><dd data-testid="diary-field-duplicate_skipped_count">{diaryDraftDisplay.details.duplicate_skipped_count}</dd>
                  <dt>status</dt><dd data-testid="diary-field-status">review-only · preview</dd>
                </dl>
              </div>
            ) : (
              <div className="text-muted-foreground">
                No diary summary draft (nothing would be saved with current inputs).
              </div>
            )}
          </div>

          {/* Expandable sensor write draft sample */}
          <div data-testid="csv-import-plan-sensor-sample" className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">Sensor write drafts</div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="csv-gate-toggle-sensor-sample"
                onClick={() => setShowSensorSample((v) => !v)}
                disabled={sensorSample.length === 0}
              >
                {showSensorSample ? "Hide sample sensor write drafts" : "Show sample sensor write drafts"}
              </Button>
            </div>
            {!showSensorSample ? (
              <div className="text-muted-foreground" data-testid="csv-gate-sensor-sample-collapsed">
                {plan.acceptedWrites.length} draft{plan.acceptedWrites.length === 1 ? "" : "s"} would be created. Grouped counts shown above.
              </div>
            ) : (
              <>
                <div className="text-muted-foreground">{SAMPLE_ONLY_COPY}</div>
                <ul data-testid="csv-gate-sensor-sample-list" data-sample-count={sensorSample.length} className="space-y-1">
                  {sensorSample.map((d, i) => (
                    <li
                      key={i}
                      data-testid={`csv-gate-sensor-sample-item-${i}`}
                      className="rounded border border-border/60 bg-muted/20 p-1.5"
                    >
                      <span className="font-medium">{d.metric}</span> = {d.value}{" "}
                      <span className="text-muted-foreground">@ {d.captured_at}</span>{" "}
                      · src={d.source} · quality={d.quality} · conf={d.raw_payload.confidence}{" "}
                      · tent={d.tent_id}{d.plant_id ? ` · plant=${d.plant_id}` : ""}{" "}
                      · key={d.idempotency_key.slice(0, 12)}…
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Download Import Plan */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="csv-gate-download-plan"
              onClick={handleDownloadPlan}
              disabled={!plan}
            >
              Download Import Plan
            </Button>
            <span className="text-muted-foreground">JSON · report_version csv_import_plan_v1 · review-only</span>
          </div>
        </div>
      )}

      <ul data-testid="csv-gate-checklist" className="text-xs text-muted-foreground space-y-0.5">
        <li data-testid="csv-gate-check-grow" data-ok={checks.growSelected}>Grow selected: {checks.growSelected ? "yes" : "no"}</li>
        <li data-testid="csv-gate-check-tent" data-ok={checks.tentSelected}>Tent selected: {checks.tentSelected ? "yes" : "no"}</li>
        <li data-testid="csv-gate-check-accepted" data-ok={checks.hasAcceptedRows}>At least one accepted row: {checks.hasAcceptedRows ? "yes" : "no"}</li>
        <li data-testid="csv-gate-check-no-blocks" data-ok={checks.noHardBlocks}>Zero hard-blocked rows: {checks.noHardBlocks ? "yes" : "no"}</li>
        <li data-testid="csv-gate-check-confirmed" data-ok={checks.confirmed}>Confirmation acknowledged: {checks.confirmed ? "yes" : "no"}</li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled
          aria-disabled="true"
          data-testid="csv-gate-save-button"
          data-writes-enabled={WRITES_ENABLED ? "true" : "false"}
          title="Coming later — approval-required flow"
        >
          Convert to diary entries — coming later
        </Button>
        <span className="text-xs text-muted-foreground">{FUTURE_FLOW_COPY}</span>
      </div>
    </section>
  );
}

export default CsvPreviewReviewGate;
