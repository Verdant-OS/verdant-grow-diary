/**
 * CanonicalSourceLegend — presenter-only inline help affordance that
 * explains the six canonical Verdant sensor sources.
 *
 * - Keyboard reachable: button toggles a visible content region.
 * - Stale / invalid are NEVER described as healthy.
 * - Provider keys (e.g. "ecowitt") are NOT listed as canonical sources.
 */
import { useId, useState } from "react";

export const CANONICAL_SOURCE_LEGEND_ENTRIES: ReadonlyArray<{
  key: "live" | "manual" | "csv" | "demo" | "stale" | "invalid";
  label: string;
  description: string;
}> = [
  {
    key: "live",
    label: "Live",
    description: "Accepted current sensor reading from a connected/live source.",
  },
  {
    key: "manual",
    label: "Manual",
    description: "User-entered reading recorded by the grower.",
  },
  {
    key: "csv",
    label: "CSV",
    description: "Imported reading from a CSV history file.",
  },
  {
    key: "demo",
    label: "Demo",
    description: "Sample / demo data — not real telemetry.",
  },
  {
    key: "stale",
    label: "Stale",
    description: "Old reading that should not be treated as current.",
  },
  {
    key: "invalid",
    label: "Invalid",
    description:
      "Bad or suspicious reading that should not be treated as healthy.",
  },
] as const;

export const CANONICAL_SOURCE_LEGEND_TRIGGER_LABEL =
  "What do source labels mean?" as const;

export interface CanonicalSourceLegendProps {
  className?: string;
  testId?: string;
  /** Optional initial open state for SSR/testing. */
  defaultOpen?: boolean;
}

export default function CanonicalSourceLegend({
  className,
  testId = "canonical-source-legend",
  defaultOpen = false,
}: CanonicalSourceLegendProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const contentId = useId();
  return (
    <div
      data-testid={testId}
      className={["inline-flex flex-col gap-1", className].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        data-testid={`${testId}-trigger`}
        aria-expanded={open}
        aria-controls={contentId}
        aria-label={CANONICAL_SOURCE_LEGEND_TRIGGER_LABEL}
        onClick={() => setOpen((v) => !v)}
        className="self-start text-[11px] underline text-muted-foreground hover:text-foreground"
      >
        {CANONICAL_SOURCE_LEGEND_TRIGGER_LABEL}
      </button>
      {open && (
        <div
          id={contentId}
          data-testid={`${testId}-content`}
          role="region"
          aria-label="Sensor source labels"
          className="rounded border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground"
        >
          <p className="mb-1 text-foreground/90">
            Verdant uses six canonical source labels. Provider names like
            <span className="font-mono"> ecowitt </span>
            are not canonical sources.
          </p>
          <ul className="space-y-1">
            {CANONICAL_SOURCE_LEGEND_ENTRIES.map((e) => (
              <li
                key={e.key}
                data-testid={`${testId}-entry-${e.key}`}
                className="flex items-start gap-2"
              >
                <span className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-foreground/80">
                  {e.label}
                </span>
                <span>{e.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
