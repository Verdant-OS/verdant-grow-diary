/**
 * SensorSnapshotTruthStrip — presenter-only. Renders the latest sensor
 * snapshot using the same truth vocabulary as SensorNormalizationPreviewPanel
 * (source / identity / transport / confidence / warnings / read-only).
 *
 * Rules (stop-ship if violated):
 *  - No data fetching, no writes, no Supabase imports.
 *  - Never marks stale / manual / csv / demo / invalid as healthy.
 *  - Never renders raw payloads, secrets, or private internal IDs beyond
 *    what the read model already exposes.
 */
import { Badge } from "@/components/ui/badge";
import type {
  SensorSnapshotReadModel,
  SensorSnapshotReadModelTone,
} from "@/lib/sensors/sensorSnapshotReadModel";

interface Props {
  model: SensorSnapshotReadModel;
  className?: string;
  testId?: string;
}

const TONE_CLASS: Record<SensorSnapshotReadModelTone, string> = {
  info: "border-primary/40 text-foreground",
  neutral: "text-foreground",
  warning: "border-[hsl(var(--warning))] text-[hsl(var(--warning))]",
  danger: "border-destructive text-destructive",
  muted: "text-muted-foreground",
};

const TONE_VARIANT: Record<
  SensorSnapshotReadModelTone,
  "default" | "secondary" | "destructive" | "outline"
> = {
  info: "secondary",
  neutral: "secondary",
  warning: "outline",
  danger: "destructive",
  muted: "outline",
};

export function SensorSnapshotTruthStrip({
  model,
  className,
  testId = "sensor-snapshot-truth-strip",
}: Props) {
  return (
    <section
      data-testid={testId}
      data-has-snapshot={model.hasSnapshot ? "true" : "false"}
      data-is-stale={model.isStale ? "true" : "false"}
      data-is-invalid={model.isInvalid ? "true" : "false"}
      data-source={model.source}
      className={`rounded-lg border border-border/60 p-3 text-sm space-y-2 ${className ?? ""}`}
      aria-label="Sensor snapshot truth"
    >
      <div
        className="flex flex-wrap gap-1.5"
        data-testid={`${testId}-badges`}
      >
        {model.badges.map((b) => (
          <Badge
            key={b.label}
            variant={TONE_VARIANT[b.tone]}
            className={`text-[11px] ${TONE_CLASS[b.tone]}`}
          >
            {b.label}
          </Badge>
        ))}
      </div>

      <p
        className="text-[11px] text-muted-foreground"
        data-testid={`${testId}-captured`}
      >
        {model.capturedAtLabel}
      </p>

      {model.warnings.length > 0 ? (
        <ul
          role="list"
          aria-label="Sensor snapshot warnings"
          data-testid={`${testId}-warnings`}
          className="text-[11px] text-amber-700 space-y-0.5"
        >
          {model.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      {model.emptyState ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid={`${testId}-empty`}
          role={model.isInvalid ? "alert" : undefined}
        >
          {model.emptyState}
        </p>
      ) : null}

      <p
        className="text-[11px] text-muted-foreground"
        data-testid={`${testId}-preview-only`}
      >
        {model.previewOnlyNote}
      </p>

      <p
        className="text-[11px] text-muted-foreground"
        data-testid={`${testId}-raw-note`}
      >
        {model.rawPayloadNote}
      </p>
    </section>
  );
}

export default SensorSnapshotTruthStrip;
