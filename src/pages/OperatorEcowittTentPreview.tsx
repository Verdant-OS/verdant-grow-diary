/**
 * Operator EcoWitt Tent Preview.
 *
 * Read-only preview of canonical EcoWitt tent snapshots for Flower, Seedling,
 * and Vegetation tents. NO Supabase writes, NO Edge calls, NO RPC,
 * NO alerts/Action Queue, NO AI, NO device control.
 */
import { useMemo, useState } from "react";
import {
  EcowittTentKey,
  SUPPORTED_TENT_KEYS,
  normalizeEcowittTentPayload,
} from "@/lib/ecowittTentNormalizerRouter";
import {
  buildEcowittTentPreviewViewModel,
  ECOWITT_TENT_PREVIEW_EVIDENCE_COPY,
  ECOWITT_TENT_PREVIEW_READ_ONLY_COPY,
} from "@/lib/ecowittTentPreviewViewModel";

const SAMPLE_PAYLOAD: Record<string, unknown> = {
  // Flower
  temp1f: 82.04,
  humidity1: 46,
  tf_ch1: 69.98,
  soilmoisture3: 80,
  soilmoisture2: 69,
  // Seedling
  temp2f: 74.5,
  humidity2: 58,
  // Vegetation
  temp3f: 78.1,
  humidity3: 52,
  soilmoisture1: 41,
  // Lung Room (NOT a tent in this slice)
  tempinf: 72,
  humidityin: 50,
};

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
  const vm = useMemo(() => {
    const snap = normalizeEcowittTentPayload(SAMPLE_PAYLOAD, tentKey, {
      now: new Date(),
      captured_at_ms: Date.now() - 30_000,
    });
    return buildEcowittTentPreviewViewModel(snap);
  }, [tentKey]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6" data-testid="ecowitt-tent-preview">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">EcoWitt Tent Preview (Read-only)</h1>
        <p className="text-sm text-muted-foreground" data-testid="read-only-copy">
          {ECOWITT_TENT_PREVIEW_READ_ONLY_COPY}
        </p>
        <p className="text-sm text-muted-foreground" data-testid="evidence-copy">
          {ECOWITT_TENT_PREVIEW_EVIDENCE_COPY}
        </p>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="Select tent">
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

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Selected tent
            </div>
            <div className="text-lg font-medium" data-testid="tent-label">
              {vm.tent_label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Source
            </div>
            <span
              data-testid="source-status"
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                vm.source === "live"
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : vm.source === "degraded"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-destructive/40 bg-destructive/15 text-destructive"
              }`}
            >
              {vm.source_label}
            </span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Provider: <span data-testid="provider">{vm.provider}</span> · Captured at:{" "}
          <span data-testid="captured-at">{vm.captured_at ?? "—"}</span>
        </div>

        <ul className="divide-y border-t">
          {vm.metrics.map((m) => (
            <li
              key={m.key}
              data-testid={`metric-${m.key}`}
              data-present={m.present ? "true" : "false"}
              className="flex items-center justify-between py-2 text-sm"
            >
              <div>
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">
                  Channel: {m.channel ?? "—"}
                </div>
              </div>
              <div className="font-mono">{fmt(m.value, m.unit)}</div>
            </li>
          ))}
        </ul>

        <div className="text-xs">
          Root-zone confidence:{" "}
          <span data-testid="root-zone-confidence">{vm.root_zone_confidence}</span>
        </div>

        {vm.degraded_reasons.length > 0 && (
          <div data-testid="degraded-reasons" className="text-xs text-muted-foreground">
            <div className="font-semibold uppercase tracking-wide">Degraded reasons</div>
            <ul className="list-disc pl-5">
              {vm.degraded_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {vm.invalid_reasons.length > 0 && (
          <div data-testid="invalid-reasons" className="text-xs text-destructive">
            <div className="font-semibold uppercase tracking-wide">Invalid reasons</div>
            <ul className="list-disc pl-5">
              {vm.invalid_reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}
