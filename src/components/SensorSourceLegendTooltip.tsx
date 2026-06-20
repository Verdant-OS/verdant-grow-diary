/**
 * SensorSourceLegendTooltip — accessible legend that explains each
 * canonical sensor source kind (live | manual | csv | demo | stale |
 * invalid).
 *
 * Implemented as a native <details>/<summary> disclosure so it is fully
 * keyboard accessible (Enter/Space toggles, focus visible) without
 * relying on hover.  No I/O, no writes, no AI calls.
 */
import { Info } from "lucide-react";
import {
  SENSOR_SOURCE_KINDS,
  SENSOR_SOURCE_SHORT_LABEL,
  SENSOR_SOURCE_LEGEND,
} from "@/constants/sensorSourceLabels";

interface Props {
  className?: string;
  /** Custom test id suffix so multiple legends on a page remain unique. */
  testIdSuffix?: string;
}

export default function SensorSourceLegendTooltip({ className, testIdSuffix }: Props) {
  const tid = testIdSuffix ? `sensor-source-legend-${testIdSuffix}` : "sensor-source-legend";
  return (
    <details className={className} data-testid={tid}>
      <summary
        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label="Sensor source legend"
        data-testid={`${tid}-summary`}
      >
        <Info className="h-3 w-3" />
        Sensor source legend
      </summary>
      <dl
        className="mt-2 grid grid-cols-1 gap-1.5 rounded-lg border border-border/40 bg-secondary/30 p-3 text-[11px] sm:grid-cols-2"
        data-testid={`${tid}-content`}
      >
        {SENSOR_SOURCE_KINDS.map((kind) => (
          <div key={kind} className="flex flex-col" data-testid={`${tid}-row-${kind}`}>
            <dt className="font-semibold text-foreground">{SENSOR_SOURCE_SHORT_LABEL[kind]}</dt>
            <dd className="text-muted-foreground">{SENSOR_SOURCE_LEGEND[kind]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
