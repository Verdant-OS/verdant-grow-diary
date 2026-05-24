import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  /** Short title (e.g. "Current grow data"). */
  title: string;
  /** Help copy body. Click-to-open, not hover-only. */
  body: string;
  /** Data-testid suffix, e.g. "current-grow-data" → info-popover-current-grow-data. */
  testKey: string;
  /** Accessible label for the trigger button. Defaults to `${title} help`. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Reusable click/tap-only help popover. Replaces hover-only tooltips for
 * grow-room usability (mobile, gloved hands, grow-room phones).
 *
 * Pure presentation. No I/O.
 */
export default function InfoPopover({
  title,
  body,
  testKey,
  ariaLabel,
  className,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? `${title} help`}
          data-testid={`info-popover-trigger-${testKey}`}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 text-xs"
        data-testid={`info-popover-content-${testKey}`}
      >
        <div className="font-medium text-sm mb-1">{title}</div>
        <p className="text-muted-foreground leading-relaxed">{body}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Canonical contextual help copy reused across the Plants page (and any
 * future grower-facing surface). Centralized so tests and UI never drift.
 */
export const HELP_COPY = {
  currentGrowData:
    "Plants saved in your Verdant workspace. This is current grow data, not a live sensor reading.",
  manualSnapshot:
    "This is a reading you entered by hand from a meter, sensor display, or app. It helps Verdant understand the grow, but it is not live connected sensor data.",
  liveSensorData:
    "This comes from a connected sensor or bridge and represents the latest received grow-room reading.",
  simulatedData:
    "This is test/demo data. Use it to explore Verdant, but do not treat it as real tent data.",
  staleData:
    "This reading is old. Check your sensor or enter a fresh manual snapshot before making decisions.",
  mixedData:
    "Some information here comes from real/manual readings and some may be demo, missing, or older context.",
  archivedMergedPlants:
    "These plants are kept for history and audit, but hidden from normal active grow work by default.",
  vpd: "Vapor Pressure Deficit — how dry the air feels to your plants. Lower means more humid, higher means drier. Verdant labels readings stale or unavailable when they cannot be trusted.",
} as const;

export type HelpCopyKey = keyof typeof HELP_COPY;
