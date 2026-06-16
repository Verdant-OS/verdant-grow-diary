/**
 * Operator EcoWitt Tent Preview.
 *
 * Read-only preview of canonical EcoWitt tent snapshots for Flower, Seedling,
 * and Vegetation tents, loaded from local sample/evidence fixtures.
 *
 * NO Supabase writes, NO Edge calls, NO RPC, NO alerts/Action Queue,
 * NO AI calls, NO device control.
 */
import { useMemo, useState } from "react";
import {
  EcowittTentKey,
  SUPPORTED_TENT_KEYS,
} from "@/lib/ecowittTentNormalizerRouter";
import { buildEcowittLocalEvidencePreviewViewModel } from "@/lib/ecowittLocalEvidenceViewModel";
import {
  ECOWITT_PREVIEW_SAMPLES,
  EcowittPreviewSampleKey,
} from "@/fixtures/ecowitt-preview-samples";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildEcowittEvidenceHistoryViewModel } from "@/lib/ecowittEvidenceHistoryViewModel";
import { buildEcowittDiaryAttachPreview } from "@/lib/ecowittDiaryAttachPreview";
import {
  buildEcowittSnapshotExport,
  downloadEcowittSnapshotExport,
} from "@/lib/ecowittSnapshotExport";
import {
  buildEcowittIngestDryRun,
  buildEcowittIngestDryRunExportFilesForTents,
  downloadEcowittIngestDryRun,
  downloadEcowittIngestDryRunAllTents,
  ECOWITT_DRY_RUN_NOTICE,
  ECOWITT_DRY_RUN_TENT_PLACEHOLDER,
} from "@/lib/ecowittIngestDryRun";
import { buildEcowittIngestDryRunFieldMap } from "@/lib/ecowittIngestDryRunFieldMap";
import {
  buildEcowittIngestDryRunMetricsCsv,
  downloadEcowittIngestDryRunMetricsCsv,
} from "@/lib/ecowittIngestDryRunCsv";
import { buildEcowittDryRunStatusExplanation } from "@/lib/ecowittIngestDryRunStatus";
import { normalizeEcowittTentPayload } from "@/lib/ecowittTentNormalizerRouter";
import { loadEcowittEvidenceSample } from "@/lib/ecowittLocalEvidence";

const TENT_KEY_LABEL: Record<EcowittTentKey, string> = {
  flower: "Flower Tent",
  seedling: "Seedling Tent",
  vegetation: "Vegetation Tent",
};

function fmt(n: number | null, unit: string): string {
  if (n === null) return "—";
  return `${n}${unit}`;
}

export default function OperatorEcowittTentPreview() {
  const [tentKey, setTentKey] = useState<EcowittTentKey>("flower");
  const [sampleKey, setSampleKey] = useState<EcowittPreviewSampleKey>("valid");
  const [showRaw, setShowRaw] = useState(false);
  const isMobile = useIsMobile();

  // Preview-only identity overrides. Never persisted. Never sent.
  const [tentIdOverride, setTentIdOverride] = useState<string>("");
  const [plantIdOverride, setPlantIdOverride] = useState<string>("");
  const [deviceIdentityOverride, setDeviceIdentityOverride] = useState<string>("");
  const [sourceIdentityOverride, setSourceIdentityOverride] = useState<string>("");

  // Pin "now" per render of this view to keep the local VM/history consistent.
  const now = useMemo(() => new Date(), [tentKey, sampleKey]);

  const vm = useMemo(
    () =>
      buildEcowittLocalEvidencePreviewViewModel({
        tentKey,
        sampleKey,
        now,
      }),
    [tentKey, sampleKey, now],
  );

  const historyVm = useMemo(
    () => buildEcowittEvidenceHistoryViewModel({ tentKey, now }),
    [tentKey, now],
  );

  const preview = vm.preview;

  // Reconstruct the canonical snapshot for diary/export from the same inputs.
  const snapshot = useMemo(() => {
    const loaded = loadEcowittEvidenceSample(sampleKey, { now });
    return normalizeEcowittTentPayload(loaded.sample.payload, tentKey, {
      now,
      captured_at_ms: loaded.captured_at_ms,
    });
  }, [tentKey, sampleKey, now]);

  const diaryPreview = useMemo(
    () => buildEcowittDiaryAttachPreview(snapshot, { is_stale: vm.is_stale }),
    [snapshot, vm.is_stale],
  );

  const handleExport = () => {
    const payload = buildEcowittSnapshotExport(snapshot, {
      evidence_source_label: vm.source_label,
      now: new Date(),
    });
    downloadEcowittSnapshotExport(tentKey, payload);
  };

  const dryRunOptions = useMemo(
    () => ({
      tent_id: tentIdOverride,
      plant_id: plantIdOverride,
      device_identity: deviceIdentityOverride,
      source_identity: sourceIdentityOverride,
      is_stale: vm.is_stale,
    }),
    [tentIdOverride, plantIdOverride, deviceIdentityOverride, sourceIdentityOverride, vm.is_stale],
  );

  const dryRun = useMemo(
    () => buildEcowittIngestDryRun(snapshot, dryRunOptions),
    [snapshot, dryRunOptions],
  );

  const fieldMap = useMemo(
    () => buildEcowittIngestDryRunFieldMap(snapshot),
    [snapshot],
  );

  const statusExplanation = useMemo(
    () => buildEcowittDryRunStatusExplanation(snapshot, dryRun),
    [snapshot, dryRun],
  );

  const allTentExportFiles = useMemo(() => {
    return buildEcowittIngestDryRunExportFilesForTents(
      SUPPORTED_TENT_KEYS.map((k) => {
        const loaded = loadEcowittEvidenceSample(sampleKey, { now });
        const snap = normalizeEcowittTentPayload(loaded.sample.payload, k, {
          now,
          captured_at_ms: loaded.captured_at_ms,
        });
        return {
          tentKey: k,
          snapshot: snap,
          is_stale: vm.is_stale,
          options:
            k === tentKey
              ? dryRunOptions
              : {
                  plant_id: null,
                  device_identity: null,
                  source_identity: null,
                  is_stale: vm.is_stale,
                },
        };
      }),
    );
  }, [sampleKey, now, tentKey, dryRunOptions, vm.is_stale]);

  const handleExportDryRun = () => {
    downloadEcowittIngestDryRun(tentKey, dryRun);
  };

  const handleExportDryRunCsv = () => {
    downloadEcowittIngestDryRunMetricsCsv(snapshot, dryRunOptions);
  };

  const handleExportAllTents = () => {
    downloadEcowittIngestDryRunAllTents(allTentExportFiles);
  };

  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  const dryRunPayloadJson = useMemo(
    () => JSON.stringify(dryRun.dry_run_payload, null, 2),
    [dryRun],
  );
  const handleCopyDryRunPayload = async () => {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(dryRunPayloadJson);
        setCopyState("copied");
        return;
      }
    } catch {
      // fall through to unavailable
    }
    setCopyState("unavailable");
  };



  return (
    <main
      className="mx-auto max-w-3xl p-4 sm:p-6 space-y-6 pb-32"
      data-testid="ecowitt-tent-preview"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">EcoWitt Tent Preview (Read-only)</h1>
        <p className="text-sm text-muted-foreground" data-testid="read-only-copy">
          {vm.read_only_copy}
        </p>
        <p className="text-sm text-muted-foreground" data-testid="evidence-copy">
          {vm.evidence_copy}
        </p>
        <p className="text-xs text-muted-foreground" data-testid="source-label">
          Evidence source: {vm.source_label}
        </p>
      </header>

      {/* Sample dropdown */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="ecowitt-sample-select" className="text-sm font-medium">
          Sample payload:
        </label>
        <select
          id="ecowitt-sample-select"
          data-testid="sample-select"
          value={sampleKey}
          onChange={(e) => setSampleKey(e.target.value as EcowittPreviewSampleKey)}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          {ECOWITT_PREVIEW_SAMPLES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground" data-testid="sample-description">
          {vm.sample_description}
        </span>
      </div>

      {/* Desktop tent tabs */}
      <div className="hidden gap-2 sm:flex" role="tablist" aria-label="Select tent">
        {SUPPORTED_TENT_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tentKey === k}
            onClick={() => setTentKey(k)}
            data-testid={`tent-tab-${k}`}
            className={`rounded-md border px-3 py-1 text-sm ${
              tentKey === k ? "bg-primary text-primary-foreground" : "bg-background"
            }`}
          >
            {TENT_KEY_LABEL[k]}
          </button>
        ))}
      </div>

      {/* Snapshot panel */}
      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Selected tent
            </div>
            <div className="text-lg font-medium" data-testid="tent-label">
              {preview.tent_label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Source</div>
            <span
              data-testid="source-status"
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                preview.source === "live"
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : preview.source === "degraded"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-destructive/40 bg-destructive/15 text-destructive"
              }`}
            >
              {preview.source_label}
            </span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Provider: <span data-testid="provider">{preview.provider}</span> · Captured at:{" "}
          <span data-testid="captured-at">{preview.captured_at ?? "—"}</span>
        </div>

        {vm.is_stale && (
          <div
            data-testid="stale-warning"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
          >
            {vm.stale_copy}
          </div>
        )}

        <ul className="divide-y border-t">
          {preview.metrics.map((m) => (
            <li
              key={m.key}
              data-testid={`metric-${m.key}`}
              data-present={m.present ? "true" : "false"}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">Channel: {m.channel ?? "—"}</div>
              </div>
              <div className="font-mono">{fmt(m.value, m.unit)}</div>
            </li>
          ))}
        </ul>

        <div className="text-xs">
          Root-zone confidence:{" "}
          <span data-testid="root-zone-confidence">{preview.root_zone_confidence}</span>
        </div>

        {preview.degraded_reasons.length > 0 && (
          <div data-testid="degraded-reasons" className="text-xs text-muted-foreground">
            <div className="font-semibold uppercase tracking-wide">Degraded reasons</div>
            <ul className="list-disc pl-5">
              {preview.degraded_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {preview.invalid_reasons.length > 0 && (
          <div data-testid="invalid-reasons" className="text-xs text-destructive">
            <div className="font-semibold uppercase tracking-wide">Invalid reasons</div>
            <ul className="list-disc pl-5">
              {preview.invalid_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={handleExport}
            data-testid="export-snapshot-button"
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Export normalized snapshot
          </button>
        </div>
      </section>

      {/* Local evidence history timeline */}
      <section
        className="rounded-lg border p-4 space-y-2"
        data-testid="evidence-history"
        aria-label="Local evidence history"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Local evidence history
        </h2>
        <ul className="space-y-2">
          {historyVm.rows.map((row) => {
            const selected = row.sample_key === sampleKey;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSampleKey(row.sample_key)}
                  data-testid={`history-row-${row.sample_key}`}
                  data-selected={selected ? "true" : "false"}
                  aria-pressed={selected}
                  className={`w-full min-h-12 rounded-md border p-3 text-left text-sm transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{row.sample_label}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        data-testid={`history-status-${row.sample_key}`}
                        className={`rounded border px-1.5 py-0.5 font-medium ${
                          row.source === "live"
                            ? "border-primary/40 bg-primary/15 text-primary"
                            : row.source === "degraded"
                              ? "border-border bg-muted text-muted-foreground"
                              : "border-destructive/40 bg-destructive/15 text-destructive"
                        }`}
                      >
                        {row.source_label}
                      </span>
                      {row.is_stale && (
                        <span
                          data-testid={`history-stale-${row.sample_key}`}
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300"
                        >
                          STALE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.tent_label} · {row.captured_at}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-3">
                    <div>Air: {fmt(row.air_temp_f, "°F")}</div>
                    <div>RH: {fmt(row.humidity_pct, "%")}</div>
                    <div>Soil T: {fmt(row.soil_temp_f, "°F")}</div>
                    <div>Soil M1: {fmt(row.soil_moisture_pct_primary, "%")}</div>
                    <div>Soil M2: {fmt(row.soil_moisture_pct_secondary, "%")}</div>
                    <div>Root: {row.root_zone_confidence}</div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Degraded: {row.degraded_reason_count} · Invalid: {row.invalid_reason_count}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Diary attach preview (read-only) */}
      <section
        className="rounded-lg border p-4 space-y-2"
        data-testid="diary-attach-preview"
        aria-label="Diary attach preview"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Attach to diary entry (preview)
        </h2>
        <p
          data-testid="diary-preview-notice"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
        >
          {diaryPreview.notice}
        </p>
        <div className="text-sm font-medium" data-testid="diary-preview-title">
          {diaryPreview.title}
        </div>
        <div className="text-xs text-muted-foreground">
          Tent: <span data-testid="diary-preview-tent">{diaryPreview.tent_label}</span> ·
          Provider: <span data-testid="diary-preview-provider">{diaryPreview.provider}</span> ·
          Captured: <span data-testid="diary-preview-captured-at">{diaryPreview.captured_at ?? "—"}</span> ·
          Source: <span data-testid="diary-preview-source">{diaryPreview.source_label}</span>
        </div>
        {diaryPreview.metrics_summary.length > 0 && (
          <ul className="list-disc pl-5 text-xs" data-testid="diary-preview-metrics">
            {diaryPreview.metrics_summary.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <div className="text-xs">
          Root-zone confidence: {diaryPreview.root_zone_confidence}
        </div>
        {diaryPreview.warnings.length > 0 && (
          <ul
            className="list-disc pl-5 text-xs text-destructive"
            data-testid="diary-preview-warnings"
          >
            {diaryPreview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <pre
          className="overflow-auto rounded-md bg-muted p-2 text-xs"
          data-testid="diary-preview-body"
        >
          {diaryPreview.body}
        </pre>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="diary-preview-attach-button"
            className="cursor-not-allowed rounded-md border bg-muted px-3 py-2 text-sm font-medium text-muted-foreground"
          >
            {diaryPreview.attach_button_label}
          </button>
          <span
            className="text-xs text-muted-foreground"
            data-testid="diary-preview-disabled-label"
          >
            {diaryPreview.disabled_label}
          </span>
        </div>
      </section>

      {/* Ingest dry-run preview */}
      <section
        className="rounded-lg border p-4 space-y-2"
        data-testid="ingest-dry-run-preview"
        aria-label="Ingest dry-run preview"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ingest dry-run preview
        </h2>
        <p
          data-testid="dry-run-notice"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
        >
          {ECOWITT_DRY_RUN_NOTICE}
        </p>
        <div className="text-xs text-muted-foreground">
          Selected tent: <span data-testid="dry-run-tent">{preview.tent_label}</span> · Source:{" "}
          <span data-testid="dry-run-source">{preview.source_label}</span> · Captured:{" "}
          <span data-testid="dry-run-captured-at">{preview.captured_at ?? "—"}</span> ·{" "}
          Provider: <span data-testid="dry-run-provider">{preview.provider}</span>
        </div>
        <div className="text-xs">
          Can send later:{" "}
          <span
            data-testid="dry-run-can-send"
            className={`rounded border px-1.5 py-0.5 font-medium ${
              dryRun.can_send_later
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-destructive/40 bg-destructive/15 text-destructive"
            }`}
          >
            {dryRun.can_send_later ? "YES" : "BLOCKED"}
          </span>
        </div>

        {/* Inline taxonomy explanation */}
        <div
          data-testid="dry-run-status-explanation"
          data-state={statusExplanation.state}
          className="rounded-md border p-2 text-xs space-y-2"
        >
          {statusExplanation.blockers.length > 0 && (
            <div data-testid="status-blockers">
              <div className="font-semibold uppercase tracking-wide text-destructive">
                Blocking triggers
              </div>
              <ul className="list-disc pl-5">
                {statusExplanation.blockers.map((b) => (
                  <li key={b.trigger} data-testid={`status-blocker-${b.trigger}`}>
                    <span className="font-mono">{b.trigger}</span> — {b.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {statusExplanation.warnings.length > 0 && (
            <div data-testid="status-warnings">
              <div className="font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Warning triggers
              </div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {statusExplanation.warnings.map((w) => (
                  <li key={w.trigger} data-testid={`status-warning-${w.trigger}`}>
                    <span className="font-mono">{w.trigger}</span> — {w.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {statusExplanation.state === "pass" &&
            statusExplanation.pass_reasons.length > 0 && (
              <div data-testid="status-pass-reasons">
                <div className="font-semibold uppercase tracking-wide text-primary">
                  Why this passed
                </div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {statusExplanation.pass_reasons.map((p) => (
                    <li key={p.trigger} data-testid={`status-pass-${p.trigger}`}>
                      <span className="font-mono">{p.trigger}</span> — {p.explanation}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>

        {/* Legacy compact blocked/warning lists kept for downstream consumers */}
        {dryRun.blocked_reasons.length > 0 && (
          <ul
            className="list-disc pl-5 text-xs text-destructive"
            data-testid="dry-run-blocked-reasons"
          >
            {dryRun.blocked_reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {dryRun.warnings.length > 0 && (
          <ul
            className="list-disc pl-5 text-xs text-muted-foreground"
            data-testid="dry-run-warnings"
          >
            {dryRun.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <pre
          className="overflow-auto rounded-md bg-muted p-2 text-xs"
          data-testid="dry-run-payload-json"
        >
          {dryRunPayloadJson}
        </pre>
        <p className="text-xs text-muted-foreground">
          No private identifiers, credentials, or network details are included in this payload.
          CSV export is for audit review only. Copy payload copies the local preview JSON only.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportDryRun}
            data-testid="export-dry-run-button"
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Export dry-run ingest payload
          </button>
          <button
            type="button"
            onClick={handleExportDryRunCsv}
            data-testid="export-dry-run-csv-button"
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Export dry-run metrics CSV
          </button>
          <button
            type="button"
            onClick={handleCopyDryRunPayload}
            data-testid="copy-dry-run-payload-button"
            className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Copy dry-run payload
          </button>
          {copyState === "copied" && (
            <span data-testid="copy-dry-run-status-copied" className="self-center text-xs text-primary">
              Copied to clipboard.
            </span>
          )}
          {copyState === "unavailable" && (
            <span
              data-testid="copy-dry-run-status-unavailable"
              className="self-center text-xs text-amber-700 dark:text-amber-300"
            >
              Clipboard unavailable. Select the JSON above to copy manually.
            </span>
          )}
        </div>
      </section>

      {/* All-tent export preview table */}
      <section
        className="rounded-lg border p-4 space-y-2"
        data-testid="dry-run-all-tents-preview"
        aria-label="All-tent dry-run export preview"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          All-tent dry-run export preview
        </h2>
        <p className="text-xs text-muted-foreground">
          All-tent export uses currently available preview snapshots only. A future real ingest
          path requires a separate approved phase.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="all-tents-preview-table">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2">Tent</th>
                <th className="py-1 pr-2">Filename</th>
                <th className="py-1 pr-2">Send</th>
                <th className="py-1 pr-2">Required</th>
                <th className="py-1 pr-2">Source</th>
                <th className="py-1 pr-2">Captured</th>
                <th className="py-1 pr-2">Blocked</th>
                <th className="py-1 pr-2">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {allTentExportFiles.map((f) => {
                const m = f.payload.metrics;
                const required_ok = m.air_temp_f !== null && m.humidity_pct !== null;
                return (
                  <tr
                    key={f.tentKey}
                    data-testid={`all-tents-row-${f.tentKey}`}
                    data-can-send={f.can_send_later ? "true" : "false"}
                    className="border-b last:border-b-0 align-top"
                  >
                    <td className="py-1 pr-2 font-medium">
                      {f.payload.metadata.tent_label}{" "}
                      <span className="text-muted-foreground">({f.payload.tent_id})</span>
                    </td>
                    <td className="py-1 pr-2 font-mono">{f.filename}</td>
                    <td
                      className={`py-1 pr-2 font-medium ${
                        f.can_send_later ? "text-primary" : "text-destructive"
                      }`}
                      data-testid={`all-tents-row-${f.tentKey}-can-send`}
                    >
                      {f.can_send_later ? "YES" : "BLOCKED"}
                    </td>
                    <td className="py-1 pr-2">
                      {required_ok ? "present" : "missing"}
                    </td>
                    <td className="py-1 pr-2">{f.payload.source}</td>
                    <td className="py-1 pr-2">{f.payload.captured_at ?? "—"}</td>
                    <td
                      className="py-1 pr-2 text-destructive"
                      data-testid={`all-tents-row-${f.tentKey}-blocked`}
                    >
                      {f.blocked_reasons.length === 0 ? "—" : f.blocked_reasons.join(", ")}
                    </td>
                    <td
                      className="py-1 pr-2 text-muted-foreground"
                      data-testid={`all-tents-row-${f.tentKey}-warnings`}
                    >
                      {f.warnings.length === 0 ? "—" : f.warnings.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={handleExportAllTents}
          data-testid="export-dry-run-all-tents-button"
          className="rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Download all-tent dry-run files (read-only)
        </button>
      </section>

      {/* Preview-only identity overrides */}
      <section
        className="rounded-lg border p-4 space-y-3"
        data-testid="dry-run-identity-overrides"
        aria-label="Dry-run identity overrides"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Dry-run identity overrides
        </h2>
        <p
          data-testid="dry-run-overrides-notice"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300"
        >
          Preview identity overrides only affect this generated payload. Nothing is sent. A real
          ingest later requires a real UUID-backed tent context.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs space-y-1">
            <span className="block font-medium">tent_id (preview-only)</span>
            <input
              type="text"
              data-testid="override-tent-id"
              value={tentIdOverride}
              onChange={(e) => setTentIdOverride(e.target.value)}
              placeholder={ECOWITT_DRY_RUN_TENT_PLACEHOLDER}
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="block font-medium">plant_id (preview-only)</span>
            <input
              type="text"
              data-testid="override-plant-id"
              value={plantIdOverride}
              onChange={(e) => setPlantIdOverride(e.target.value)}
              placeholder="(empty → null)"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="block font-medium">device_identity (preview-only)</span>
            <input
              type="text"
              data-testid="override-device-identity"
              value={deviceIdentityOverride}
              onChange={(e) => setDeviceIdentityOverride(e.target.value)}
              placeholder="(empty → null)"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="block font-medium">source_identity (preview-only)</span>
            <input
              type="text"
              data-testid="override-source-identity"
              value={sourceIdentityOverride}
              onChange={(e) => setSourceIdentityOverride(e.target.value)}
              placeholder="(empty → null)"
              className="w-full rounded-md border bg-background px-2 py-1 text-xs"
            />
          </label>
        </div>
      </section>

      {/* Canonical field mapping panel */}
      <section
        className="rounded-lg border p-4 space-y-2"
        data-testid="dry-run-field-map"
        aria-label="Dry-run canonical field mapping"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Canonical → ingest field mapping
        </h2>
        <p className="text-xs text-muted-foreground">
          Invalid, stale, or missing required telemetry cannot be marked sendable. Degraded
          telemetry is shown as warning-only unless a blocking sensor truth rule applies.
        </p>
        <ul className="divide-y border-t">
          {fieldMap.map((row) => (
            <li
              key={row.ingest_key}
              data-testid={`field-map-row-${row.ingest_key}`}
              data-status={row.status}
              data-required={row.required ? "true" : "false"}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
            >
              <div>
                <div className="font-medium">
                  {row.ingest_key}{" "}
                  <span className="text-muted-foreground">
                    ({row.required ? "required" : "optional"})
                  </span>
                </div>
                <div className="text-muted-foreground">from {row.source_field}</div>
                {row.note && (
                  <div className="text-muted-foreground italic">{row.note}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono">{row.value === null ? "—" : String(row.value)}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-medium uppercase ${
                    row.status === "mapped"
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : row.status === "blocked" || row.status === "missing_required"
                        ? "border-destructive/40 bg-destructive/15 text-destructive"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {row.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Redacted raw payload toggle */}
      <section className="rounded-lg border p-4 space-y-2">
        <button
          type="button"
          data-testid="raw-toggle"
          aria-expanded={showRaw}
          aria-controls="redacted-raw-panel"
          onClick={() => setShowRaw((v) => !v)}
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          {showRaw ? "Hide redacted raw payload" : "Show redacted raw payload"}
        </button>
        {showRaw && (
          <pre
            id="redacted-raw-panel"
            data-testid="redacted-raw-panel"
            className="overflow-auto rounded-md bg-muted p-2 text-xs"
          >
            {JSON.stringify(preview.redacted_raw_preview, null, 2)}
          </pre>
        )}
      </section>

      {/* Mobile thumb-friendly tent selector */}
      {isMobile && (
        <nav
          data-testid="mobile-tent-selector"
          aria-label="Select tent (mobile)"
          className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-background p-2 sm:hidden"
        >
          {SUPPORTED_TENT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={tentKey === k}
              onClick={() => setTentKey(k)}
              data-testid={`mobile-tent-${k}`}
              className={`min-h-12 flex-1 rounded-md px-2 py-3 text-sm font-medium ${
                tentKey === k ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {TENT_KEY_LABEL[k]}
            </button>
          ))}
        </nav>
      )}
    </main>
  );
}
