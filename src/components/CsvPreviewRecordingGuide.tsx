/**
 * CsvPreviewRecordingGuide — collapsible in-page overlay with a 90-second
 * recording script using the actual UI labels of the CSV/TSV preview page.
 *
 * Pure presentation. No tracking, no network, no persistence.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

const CALLOUTS: ReadonlyArray<{ label: string; body: string }> = [
  { label: "Source label", body: "Confirm it shows `csv` or `tsv` — never `live`." },
  { label: "Preview only / not saved", body: "Read the status badge out loud." },
  { label: "Not live data", body: "Surface the safety banner copy." },
  { label: "Mapping table", body: "Show one editable override dropdown." },
  { label: "Suspicious flags", body: "Highlight humidity-stuck or pH-out-of-range." },
  { label: "Timeline preview", body: "Change the time window or sampling control." },
  { label: "Download report", body: "Click Download CSV Preview Report — local JSON only." },
];

export const RECORDING_CLOSE_LINE =
  "Give us your export. Verdant turns it into plant memory. No API access, no write-back, no device control.";

const SCRIPT_STEPS: ReadonlyArray<{ time: string; line: string }> = [
  {
    time: "0:00–0:10",
    line: "Open /sensors/csv-preview. Read the safety banner: Preview only — not live data — no automation.",
  },
  {
    time: "0:10–0:30",
    line: "Drag a vendor CSV onto the dropzone. Point at the source label (csv) and the status badge (Preview only — not saved).",
  },
  {
    time: "0:30–0:50",
    line: "Walk through the mapping table. Open one Override dropdown to show local-only re-mapping.",
  },
  {
    time: "0:50–1:10",
    line: "Drop a TSV export. Call out the auto-detected tsv source and the suspicious flags (humidity stuck, EC ambiguity, pH out of range).",
  },
  {
    time: "1:10–1:25",
    line: "Change the time window and sampling. Click Download CSV Preview Report — local JSON, no upload.",
  },
  { time: "1:25–1:30", line: RECORDING_CLOSE_LINE },
];

export default function CsvPreviewRecordingGuide() {
  // Page is information-dense — collapsed by default.
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="csv-preview-recording-guide"
      aria-label="How to record this demo"
      className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">How to record this demo</h2>
          <p className="text-muted-foreground text-xs">
            90-second script using the actual UI labels on this page.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          data-testid="csv-preview-recording-toggle"
          aria-expanded={open}
        >
          {open ? "Hide script" : "Show script"}
        </Button>
      </div>

      {open && (
        <div data-testid="csv-preview-recording-content" className="mt-3 space-y-4">
          <ol className="space-y-2">
            {SCRIPT_STEPS.map((s) => (
              <li key={s.time} className="text-xs">
                <span className="font-mono text-muted-foreground mr-2">{s.time}</span>
                <span>{s.line}</span>
              </li>
            ))}
          </ol>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              UI callouts
            </h3>
            <ul className="grid gap-1 sm:grid-cols-2 text-xs">
              {CALLOUTS.map((c) => (
                <li key={c.label}>
                  <span className="font-medium">{c.label}:</span>{" "}
                  <span className="text-muted-foreground">{c.body}</span>
                </li>
              ))}
            </ul>
          </div>
          <p
            data-testid="csv-preview-recording-close-line"
            className="text-xs italic text-muted-foreground border-t border-border pt-3"
          >
            {RECORDING_CLOSE_LINE}
          </p>
        </div>
      )}
    </section>
  );
}
