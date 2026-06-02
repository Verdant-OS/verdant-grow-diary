import { useMemo, useRef, useState } from "react";
import {
  previewRepresentativeCsv,
  type RepresentativeDraftReading,
  type RepresentativePreviewResult,
} from "@/lib/representativeCsvSensorPreviewRules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * RepresentativeCsvPreview — DEMO/SAMPLE ONLY.
 *
 * Lets a grower pick a local .csv file matching the synthetic representative
 * partner-data shape (AROYA-style columns). Parses in memory, renders the
 * normalized preview table, and labels everything as CSV + Representative
 * sample + Not live data.
 *
 * Hard constraints:
 *  - No DB writes, no Supabase calls, no functions.invoke.
 *  - No alerts, no action_queue, no AI Doctor calls.
 *  - No file persistence and no Storage upload.
 *  - Tent/grow mapping is required for any future insert and is NOT inferred
 *    from the CSV Room/Zone columns.
 */
export default function RepresentativeCsvPreview() {
  const [result, setResult] = useState<RepresentativePreviewResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = previewRepresentativeCsv(text);
      setResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse CSV";
      setError(message);
    }
  };

  return (
    <main className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">CSV import</Badge>
          <Badge variant="outline">Representative sample</Badge>
          <Badge variant="destructive">Not live data</Badge>
        </div>
        <h1 className="text-2xl font-semibold">Representative CSV preview</h1>
        <p className="text-sm text-muted-foreground">
          Preview a representative partner-data CSV sample. This is a synthetic
          shape used to test Verdant&rsquo;s intake workflow. Nothing is written
          to your grow, no readings are stored, and no file is uploaded. Mapping
          to a Verdant tent and grow would be required before any future import.
        </p>
      </header>

      <section
        aria-label="Upload representative CSV sample"
        className="rounded-lg border border-dashed p-6"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose representative CSV sample file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => inputRef.current?.click()}>
            Choose CSV file
          </Button>
          <span className="text-sm text-muted-foreground">
            {fileName ? `Loaded: ${fileName}` : "No file selected"}
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      {result && <PreviewSummaryStrip result={result} />}
      {result && <PreviewTable result={result} />}
    </main>
  );
}

function PreviewSummaryStrip({ result }: { result: RepresentativePreviewResult }) {
  return (
    <section
      aria-label="Preview summary"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      <SummaryCell label="Total rows" value={result.summary.total} />
      <SummaryCell label="Valid" value={result.summary.valid} />
      <SummaryCell label="Warnings" value={result.summary.warning} />
      <SummaryCell label="Invalid" value={result.summary.invalid} />
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function PreviewTable({ result }: { result: RepresentativePreviewResult }) {
  const rows = useMemo(() => result.rows, [result]);
  return (
    <section aria-label="Normalized representative CSV rows" className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Captured at (UTC)</TableHead>
            <TableHead>Sensor</TableHead>
            <TableHead>Room / Zone</TableHead>
            <TableHead>Air °C</TableHead>
            <TableHead>RH %</TableHead>
            <TableHead>VPD kPa</TableHead>
            <TableHead>CO₂ ppm</TableHead>
            <TableHead>PPFD</TableHead>
            <TableHead>VWC %</TableHead>
            <TableHead>EC mS/cm</TableHead>
            <TableHead>Sub °C</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <PreviewRow key={row.rowIndex} row={row} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function stateVariant(state: RepresentativeDraftReading["state"]) {
  if (state === "invalid") return "destructive" as const;
  if (state === "warning") return "secondary" as const;
  return "outline" as const;
}

function fmt(n: number | null, digits = 2): string {
  if (n === null) return "—";
  return n.toFixed(digits);
}

function PreviewRow({ row }: { row: RepresentativeDraftReading }) {
  return (
    <TableRow>
      <TableCell>{row.rowIndex + 1}</TableCell>
      <TableCell>
        <Badge variant={stateVariant(row.state)}>{row.state}</Badge>
      </TableCell>
      <TableCell>{row.captured_at ?? "—"}</TableCell>
      <TableCell>{row.sensor ?? "—"}</TableCell>
      <TableCell>
        {[row.room, row.zone].filter(Boolean).join(" / ") || "—"}
      </TableCell>
      <TableCell>{fmt(row.air_temp_c, 1)}</TableCell>
      <TableCell>{fmt(row.humidity_pct, 1)}</TableCell>
      <TableCell>{fmt(row.vpd_kpa, 2)}</TableCell>
      <TableCell>{fmt(row.co2_ppm, 0)}</TableCell>
      <TableCell>{fmt(row.ppfd, 0)}</TableCell>
      <TableCell>{fmt(row.vwc_pct, 1)}</TableCell>
      <TableCell>{fmt(row.substrate_ec_mscm, 2)}</TableCell>
      <TableCell>{fmt(row.substrate_temp_c, 1)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.reasons.length > 0 ? row.reasons.join(", ") : ""}
      </TableCell>
    </TableRow>
  );
}
