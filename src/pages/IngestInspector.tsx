/**
 * Ingest Inspector — read-only operator/grower surface for recent
 * sensor webhook readings.
 *
 * Safety:
 *  - Read-only. No writes, no edits, no resend/replay, no delete.
 *  - No automation, no device control, no Action Queue, no alerts.
 *  - Raw payload is collapsed by default and secrets are redacted.
 *  - user_id is never rendered.
 */
import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIngestInspectorReadings } from "@/hooks/useIngestInspectorReadings";
import {
  INGEST_INSPECTOR_DISCLOSURE_LINES,
  METRIC_UNIT,
  extractVendorLineage,
  filterInspectorReadings,
  inspectorSourceLabel,
  redactRawPayload,
  type InspectorReadingLike,
} from "@/lib/ingestInspectorRules";

const ALL = "__all__";

function formatValue(metric: string, value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const unit = METRIC_UNIT[metric] ?? "";
  return unit ? `${value} ${unit}` : String(value);
}

function ReadingRow({
  reading,
  tentName,
}: {
  reading: InspectorReadingLike;
  tentName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const vendor = extractVendorLineage(reading.raw_payload);
  const capturedAt = reading.captured_at ?? reading.ts;
  const sourceLabel = inspectorSourceLabel(reading.source);

  return (
    <li
      data-testid="ingest-inspector-row"
      data-source={reading.source}
      data-vendor={vendor ?? ""}
      className="rounded-xl border bg-card/40 p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="ingest-inspector-captured-at"
          className="font-mono text-xs text-muted-foreground"
        >
          {new Date(capturedAt).toLocaleString()}
        </span>
        <Badge
          data-testid="ingest-inspector-source-badge"
          variant="secondary"
          className="uppercase tracking-wide"
        >
          {sourceLabel}
        </Badge>
        {vendor && (
          <Badge
            data-testid="ingest-inspector-vendor-badge"
            variant="outline"
            className="uppercase tracking-wide"
          >
            {vendor}
          </Badge>
        )}
        {reading.quality && reading.quality !== "ok" && (
          <Badge
            data-testid="ingest-inspector-quality-badge"
            variant="destructive"
          >
            {reading.quality}
          </Badge>
        )}
        {tentName && (
          <span className="text-xs text-muted-foreground">{tentName}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {reading.metric}
        </span>
        <span className="font-display text-base">
          {formatValue(reading.metric, reading.value)}
        </span>
      </div>

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          data-testid="ingest-inspector-raw-toggle"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {open ? "Hide raw payload" : "Show raw payload"}
        </button>
        {open && (
          <pre
            data-testid="ingest-inspector-raw-payload"
            className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/30 p-2 text-[11px]"
          >
            {JSON.stringify(redactRawPayload(reading.raw_payload), null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}

export default function IngestInspector() {
  const query = useIngestInspectorReadings();
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [vendorFilter, setVendorFilter] = useState<string>(ALL);
  const [tentFilter, setTentFilter] = useState<string>(ALL);

  const rows = query.data?.rows ?? [];
  const tentNames = query.data?.tentNames ?? {};

  const sourceOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.source))).sort(),
    [rows],
  );
  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = extractVendorLineage(r.raw_payload);
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  }, [rows]);
  const tentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.tent_id) set.add(r.tent_id);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(
    () =>
      filterInspectorReadings(rows, {
        source: sourceFilter === ALL ? null : sourceFilter,
        vendor: vendorFilter === ALL ? null : vendorFilter,
        tentId: tentFilter === ALL ? null : tentFilter,
      }),
    [rows, sourceFilter, vendorFilter, tentFilter],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ingest Inspector"
        description="Read-only view of recent sensor webhook readings."
      />

      <Card data-testid="ingest-inspector-disclosure">
        <CardContent className="py-3 text-xs text-muted-foreground space-y-0.5">
          {INGEST_INSPECTOR_DISCLOSURE_LINES.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-muted-foreground">Source</label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger data-testid="ingest-inspector-source-filter">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sources</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {inspectorSourceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Vendor</label>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger data-testid="ingest-inspector-vendor-filter">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All vendors</SelectItem>
                {vendorOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tent</label>
            <Select value={tentFilter} onValueChange={setTentFilter}>
              <SelectTrigger data-testid="ingest-inspector-tent-filter">
                <SelectValue placeholder="All tents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tents</SelectItem>
                {tentOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {tentNames[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent readings</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading && (
            <div
              data-testid="ingest-inspector-loading"
              className="space-y-2"
              aria-busy="true"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-muted/40"
                />
              ))}
            </div>
          )}
          {query.error && (
            <div
              data-testid="ingest-inspector-error"
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
            >
              <p>Couldn’t load recent readings.</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                data-testid="ingest-inspector-retry"
                onClick={() => query.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {!query.isLoading && !query.error && filtered.length === 0 && (
            <EmptyState
              title="No recent ingest readings."
              description="Once a bridge sends readings, they will appear here."
            />
          )}
          {!query.isLoading && !query.error && filtered.length > 0 && (
            <ul
              data-testid="ingest-inspector-list"
              className="space-y-2"
            >
              {filtered.map((r) => (
                <ReadingRow
                  key={r.id}
                  reading={r}
                  tentName={r.tent_id ? tentNames[r.tent_id] ?? null : null}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
