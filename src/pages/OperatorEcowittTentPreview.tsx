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
import { ECOWITT_PREVIEW_SAMPLES, EcowittPreviewSampleKey } from "@/fixtures/ecowitt-preview-samples";
import { useIsMobile } from "@/hooks/use-mobile";

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

  const vm = useMemo(
    () =>
      buildEcowittLocalEvidencePreviewViewModel({
        tentKey,
        sampleKey,
        now: new Date(),
      }),
    [tentKey, sampleKey],
  );

  const preview = vm.preview;

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
