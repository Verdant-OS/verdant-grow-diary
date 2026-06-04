/**
 * SensorsIngestNormalizer — read-only, in-app debug screen that lets a
 * developer or grower paste a sensor ingest JSON payload and see how
 * Verdant would normalize it.
 *
 * Hard constraints:
 *  - No network requests. No Supabase. No `functions.invoke`. No writes.
 *  - No alerts, no Action Queue, no automation, no device control.
 *  - The screen never implies the pasted payload was ingested.
 *  - All classification logic lives in the pure helper
 *    `explainWebhookNormalizationPayload`. JSX is presentation only.
 */
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import SensorSourceLineageLine from "@/components/SensorSourceLineageLine";
import { Button } from "@/components/ui/button";
import {
  explainWebhookNormalizationPayload,
  WEBHOOK_NORMALIZER_EXAMPLES,
  type WebhookNormalizationExplanation,
} from "@/lib/webhookNormalizationExplainer";

interface ParseState {
  kind: "idle" | "ok" | "json-error";
  parseError?: string;
  explanation?: WebhookNormalizationExplanation;
}

const IDLE: ParseState = { kind: "idle" };

export default function SensorsIngestNormalizer() {
  const [raw, setRaw] = useState<string>("");
  const [state, setState] = useState<ParseState>(IDLE);

  const exampleButtons = useMemo(() => WEBHOOK_NORMALIZER_EXAMPLES, []);

  function handleParse() {
    const text = raw.trim();
    if (!text) {
      setState({ kind: "json-error", parseError: "Paste a JSON payload first." });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setState({
        kind: "json-error",
        parseError:
          err instanceof Error ? `Invalid JSON — ${err.message}` : "Invalid JSON",
      });
      return;
    }
    const explanation = explainWebhookNormalizationPayload(parsed);
    setState({ kind: "ok", explanation });
  }

  function handleClear() {
    setRaw("");
    setState(IDLE);
  }

  function loadExample(id: string) {
    const ex = exampleButtons.find((e) => e.id === id);
    if (!ex) return;
    setRaw(JSON.stringify(ex.payload, null, 2));
    setState(IDLE);
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Ingest Normalizer"
        description="Paste a sensor ingest JSON payload to see how Verdant would normalize it. This screen is read-only: nothing is sent, stored, or ingested."
      />

      <section
        aria-labelledby="webhook-normalizer-input-heading"
        className="rounded-lg border border-border bg-card p-4"
      >
        <h2
          id="webhook-normalizer-input-heading"
          className="mb-2 text-sm font-semibold"
        >
          Payload
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          This tool runs entirely in your browser. It never sends network
          requests, never calls the backend, and never writes any data. No
          new endpoint is created by this screen.
        </p>

        <div className="mb-3 flex flex-wrap gap-2" data-testid="webhook-normalizer-examples">
          {exampleButtons.map((ex) => (
            <Button
              key={ex.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadExample(ex.id)}
              data-testid={`webhook-normalizer-example-${ex.id}`}
              title={ex.description}
            >
              {ex.label}
            </Button>
          ))}
        </div>

        <label htmlFor="webhook-normalizer-textarea" className="sr-only">
          Sensor ingest JSON payload
        </label>
        <textarea
          id="webhook-normalizer-textarea"
          data-testid="webhook-normalizer-textarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder='{"tent_id":"…","source":"mqtt","vendor":"ecowitt","captured_at":"2026-06-04T12:00:00Z","metrics":{"temp_c":24.7,"humidity_pct":58}}'
          className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
        />

        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            onClick={handleParse}
            data-testid="webhook-normalizer-parse"
          >
            Parse
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            data-testid="webhook-normalizer-clear"
          >
            Clear
          </Button>
        </div>
      </section>

      {state.kind === "json-error" ? (
        <div
          role="alert"
          data-testid="webhook-normalizer-json-error"
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {state.parseError}
        </div>
      ) : null}

      {state.kind === "idle" ? (
        <div
          data-testid="webhook-normalizer-empty-state"
          className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground"
        >
          Paste a payload and run normalization to preview the result.
        </div>
      ) : null}

      {state.kind === "ok" && state.explanation ? (
        <NormalizationResult explanation={state.explanation} />
      ) : null}
    </div>
  );
}

function NormalizationResult({
  explanation,
}: {
  explanation: WebhookNormalizationExplanation;
}) {
  return (
    <section
      aria-labelledby="webhook-normalizer-results-heading"
      data-testid="webhook-normalizer-result"
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2
          id="webhook-normalizer-results-heading"
          className="text-base font-semibold"
          data-testid="webhook-normalizer-results-heading"
        >
          Normalization Results
        </h2>
      </div>

      <div
        className="rounded-lg border border-border bg-card p-4"
        data-testid="webhook-normalizer-disclaimer"
      >
        <p className="text-xs text-muted-foreground">
          <strong>Preview only.</strong> This payload has not been ingested.
          The normalizer here is the same pure helper used server-side, but
          no row is written and no edge function is called.
        </p>
      </div>

      <div
        className="rounded-lg border border-border bg-card p-4"
        data-testid="webhook-normalizer-source-vendor"
      >
        <h3 className="mb-2 text-sm font-semibold">Source &amp; vendor lineage</h3>
        <SensorSourceLineageLine
          source={(explanation.source.canonical as string) ?? "unknown"}
          vendor={explanation.vendor.canonical}
        />
        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div
            className="rounded border border-border/60 bg-muted/30 p-2"
            data-testid="webhook-normalizer-source-beforeafter"
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Raw source → Normalized
            </div>
            <div className="mt-1 font-mono">
              <span data-testid="webhook-normalizer-source-raw">
                {String(explanation.source.raw ?? "—")}
              </span>
              <span aria-hidden className="mx-1 opacity-60">→</span>
              <span data-testid="webhook-normalizer-source-canonical">
                {explanation.source.canonical ?? "—"}
              </span>
            </div>
            {explanation.source.reason ? (
              <div
                className="mt-1 text-destructive"
                data-testid="webhook-normalizer-source-reason"
              >
                {explanation.source.reason}
              </div>
            ) : null}
          </div>
          <div
            className="rounded border border-border/60 bg-muted/30 p-2"
            data-testid="webhook-normalizer-vendor-beforeafter"
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Raw vendor → Lineage (never used for auth)
            </div>
            <div className="mt-1 font-mono">
              <span data-testid="webhook-normalizer-vendor-raw">
                {String(explanation.vendor.raw ?? "—")}
              </span>
              <span aria-hidden className="mx-1 opacity-60">→</span>
              <span data-testid="webhook-normalizer-vendor-canonical">
                {explanation.vendor.canonical ?? "—"}
              </span>
            </div>
          </div>
        </dl>
      </div>


      <FieldList
        title="Accepted fields"
        testId="webhook-normalizer-accepted"
        items={explanation.acceptedMetrics.map((m) => ({
          key: m.alias,
          label: `${m.alias} → ${m.canonical}`,
          detail: String(m.value),
        }))}
        emptyLabel="No fields accepted."
      />

      <FieldList
        title="Skipped fields"
        testId="webhook-normalizer-skipped"
        items={explanation.skippedMetrics.map((m) => ({
          key: m.alias,
          label: m.alias,
          detail: m.reason,
        }))}
        emptyLabel="No fields skipped."
      />

      <FieldList
        title="Rejected fields"
        testId="webhook-normalizer-rejected"
        items={explanation.rejectedMetrics.map((m) => ({
          key: m.alias,
          label: m.alias,
          detail: m.reason,
        }))}
        emptyLabel="No fields rejected."
      />

      {explanation.payloadErrors.length > 0 ? (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          data-testid="webhook-normalizer-payload-errors"
        >
          <h3 className="mb-2 text-sm font-semibold">Payload errors</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {explanation.payloadErrors.map((err, idx) => (
              <li key={`${err}-${idx}`}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {explanation.warnings.length > 0 ? (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          data-testid="webhook-normalizer-warnings"
        >
          <h3 className="mb-2 text-sm font-semibold">Warnings</h3>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            {explanation.warnings.map((w, idx) => (
              <li key={`${w}-${idx}`}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Sanitized raw_payload preview</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          This is what would be persisted into{" "}
          <code>sensor_readings.raw_payload</code> after stripping{" "}
          <code>user_id</code> and auth-like fields. Vendor lineage is
          preserved here for traceability only.
        </p>
        <pre
          data-testid="webhook-normalizer-sanitized"
          className="overflow-x-auto rounded bg-muted p-3 font-mono text-[11px]"
        >
          {JSON.stringify(explanation.sanitizedRawPayload, null, 2)}
        </pre>
      </div>
    </section>
  );
}

function FieldList({
  title,
  testId,
  items,
  emptyLabel,
}: {
  title: string;
  testId: string;
  items: { key: string; label: string; detail: string }[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid={testId}>
      <h3 className="mb-2 text-sm font-semibold">
        {title}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({items.length})
        </span>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {items.map((item) => (
            <li
              key={item.key}
              data-testid={`${testId}-item`}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              <span className="font-mono font-medium">{item.label}</span>
              <span className="text-muted-foreground">— {item.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
