/**
 * CsvPreviewHelpPanel — calm, partner-safe explanation of what the CSV/TSV
 * preview does and what its suspicious-value flags mean.
 *
 * Pure presentation. No I/O. No network. No persistence.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

const SAFETY_BULLETS = [
  "Preview only",
  "Nothing is saved",
  "Not live data",
  "No automation",
  "No device control",
  "No alerts or Action Queue items created",
] as const;

const FLAG_EXPLANATIONS: ReadonlyArray<{ label: string; body: string }> = [
  {
    label: "Humidity stuck at 0 or 100",
    body: "The sensor reports the same extreme value across many rows — usually offline, miswired, or saturated.",
  },
  {
    label: "pH out of range",
    body: "Values fall outside the 2–12 grow window (or outside the physical 0–14 scale).",
  },
  {
    label: "EC unit ambiguity",
    body: "The column header says mS/cm but values look like µS/cm (or vice versa).",
  },
  {
    label: "Lux is not PPFD",
    body: "Verdant treats illuminance (lux) and photosynthetic light (PPFD) separately, so lux columns are left unmapped.",
  },
  {
    label: "Temperature unit mismatch",
    body: "Numbers above 50 with no °C/°F in the header may actually be Fahrenheit.",
  },
  {
    label: "Date/time parse issues",
    body: "Timestamp values that don't parse are skipped from the timeline preview — original file is untouched.",
  },
  {
    label: "Unmapped fields",
    body: "Columns Verdant doesn't recognize are listed clearly. You can override the mapping locally — nothing is sent anywhere.",
  },
];

export default function CsvPreviewHelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <aside
      data-testid="csv-preview-help-panel"
      aria-label="CSV preview help"
      className="rounded-lg border border-border bg-card/40 p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">What this preview does</h2>
          <p className="text-muted-foreground">
            Verdant parses your file locally and shows how it would map into
            plant memory — without saving, syncing, or contacting a server.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          data-testid="csv-preview-help-toggle"
          aria-expanded={open}
        >
          {open ? "Hide details" : "Show details"}
        </Button>
      </div>

      <ul
        data-testid="csv-preview-help-safety-bullets"
        className="mt-3 grid gap-1 sm:grid-cols-2 text-xs text-muted-foreground"
      >
        {SAFETY_BULLETS.map((b) => (
          <li key={b}>· {b}</li>
        ))}
      </ul>

      {open && (
        <div
          data-testid="csv-preview-help-flags"
          className="mt-4 space-y-3 border-t border-border pt-3"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What Verdant flags during mapping
          </h3>
          <ul className="space-y-2">
            {FLAG_EXPLANATIONS.map((f) => (
              <li key={f.label} data-testid={`csv-preview-help-flag-${f.label}`}>
                <p className="font-medium">{f.label}</p>
                <p className="text-muted-foreground text-xs">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
