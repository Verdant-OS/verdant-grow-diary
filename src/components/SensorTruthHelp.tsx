/**
 * SensorTruthHelp — short in-app explainer for sensor source labels and
 * `captured_at` semantics. Presentation-only; no logic, no I/O.
 *
 * Safety:
 *  - No automation/device-control copy.
 *  - Does not claim Ecowitt is "live"; describes provenance.
 */
import { cn } from "@/lib/utils";

export interface SensorTruthHelpProps {
  className?: string;
  testId?: string;
}

export default function SensorTruthHelp({
  className,
  testId = "sensor-truth-help",
}: SensorTruthHelpProps) {
  return (
    <section
      data-testid={testId}
      aria-labelledby="sensor-truth-help-title"
      className={cn(
        "rounded-lg border border-border bg-muted/30 p-4 text-sm text-foreground",
        className,
      )}
    >
      <h3
        id="sensor-truth-help-title"
        data-testid="sensor-truth-help-title"
        className="mb-2 text-base font-semibold"
      >
        Sensor truth
      </h3>
      <p data-testid="sensor-truth-help-body" className="text-muted-foreground">
        Verdant labels where each reading came from so you know how much to
        trust it. <strong className="text-foreground">Ecowitt</strong> readings
        come from your connected Ecowitt hardware.{" "}
        <strong className="text-foreground">Manual</strong> readings were
        entered by you. <strong className="text-foreground">CSV</strong>{" "}
        readings came from an import.{" "}
        <strong className="text-foreground">Stale</strong> means the reading is
        old. <strong className="text-foreground">Unknown</strong> means Verdant
        cannot verify the source or time.
      </p>
      <p
        data-testid="sensor-truth-help-captured-at"
        className="mt-3 text-muted-foreground"
      >
        <strong className="text-foreground">captured_at</strong> is when the
        sensor reading was actually taken. It may be different from when you
        logged an event.
      </p>
    </section>
  );
}
