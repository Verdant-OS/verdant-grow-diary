import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * PartnerCsvPreviewLanding — static partner-facing explainer for the
 * read-only CSV/TSV sensor preview flow.
 *
 * Pure presentation. No forms, no lead capture, no fetch, no Supabase,
 * no AI, no Action Queue or alerts writes.
 */
export default function PartnerCsvPreviewLanding() {
  return (
    <main
      data-testid="partner-csv-preview-landing"
      className="container mx-auto max-w-4xl p-4 md:p-8 space-y-10"
    >
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Turn hardware exports into plant memory — read-only.
        </h1>
        <p className="text-muted-foreground">
          Verdant accepts a CSV or TSV export from your sensors, controllers,
          or data logger and shows how it would map into a grower's plant
          memory — without saving, syncing, writing back, or controlling a
          single device.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild>
            <Link to="/sensors/csv-preview" data-testid="partner-csv-preview-cta">
              Open CSV/TSV Preview
            </Link>
          </Button>
        </div>
      </header>

      <section aria-labelledby="how-it-works" className="space-y-3">
        <h2 id="how-it-works" className="text-xl font-semibold">
          How it works
        </h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm">
          <li>Upload a CSV or TSV export from any sensor or controller.</li>
          <li>Verdant detects the headers in your browser.</li>
          <li>Verdant proposes mappings to canonical fields.</li>
          <li>Verdant flags suspicious readings (stuck humidity, lux vs PPFD, EC units, pH range).</li>
          <li>Verdant previews a timeline from the rows.</li>
          <li>Verdant generates a local JSON report you can download and share.</li>
        </ol>
      </section>

      <section
        aria-labelledby="safety"
        data-testid="partner-csv-preview-safety"
        className="rounded-lg border border-border bg-muted/30 p-4 space-y-2"
      >
        <h2 id="safety" className="text-lg font-semibold">
          Safety guarantees
        </h2>
        <ul className="text-sm space-y-1">
          <li>· No API access required for the first proof.</li>
          <li>· No write-back to your systems.</li>
          <li>· No device control.</li>
          <li>· No automation.</li>
          <li>· No database save during preview.</li>
          <li>· Not live data — source is labeled `csv` or `tsv`, never `live`.</li>
          <li>· Parsing happens entirely in the grower's browser.</li>
        </ul>
      </section>

      <section aria-labelledby="ask" className="space-y-3">
        <h2 id="ask" className="text-xl font-semibold">
          What we'd love from you
        </h2>
        <ul className="list-disc pl-5 text-sm space-y-1">
          <li>An anonymized sample export.</li>
          <li>Header definitions for each column.</li>
          <li>Units for each measurement (°C/°F, mS/cm vs µS/cm, etc.).</li>
          <li>Timestamp and timezone rules.</li>
          <li>Preferred source/vendor identifiers.</li>
        </ul>
      </section>

      <footer className="pt-4 border-t border-border">
        <Button asChild variant="outline">
          <Link to="/sensors/csv-preview">Open CSV/TSV Preview</Link>
        </Button>
      </footer>
    </main>
  );
}
