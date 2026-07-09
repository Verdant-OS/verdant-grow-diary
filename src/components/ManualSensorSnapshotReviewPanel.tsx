/**
 * ManualSensorSnapshotReviewPanel — presenter for pre-save review of a
 * MANUAL sensor snapshot. Never renders a "live" chip. No writes.
 * Parent owns draft state and the actual save action.
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  SensorSnapshotReviewFinding,
  SensorSnapshotReviewResult,
  SensorSnapshotNormalizedPreview,
} from "@/lib/sensorSnapshotReviewRules";

interface Props {
  result: SensorSnapshotReviewResult;
}

const PREVIEW_FIELDS: Array<{
  key: keyof SensorSnapshotNormalizedPreview;
  label: string;
  unit?: string;
}> = [
  { key: "tempF", label: "Air temp", unit: "°F" },
  { key: "humidity", label: "Humidity", unit: "%" },
  { key: "vpdKpa", label: "VPD", unit: "kPa" },
  { key: "soilWaterContent", label: "Soil water content", unit: "%" },
  { key: "soilEc", label: "Soil EC", unit: "mS/cm" },
  { key: "reservoirEc", label: "Reservoir EC", unit: "mS/cm" },
  { key: "reservoirPh", label: "Reservoir pH" },
  { key: "co2Ppm", label: "CO₂", unit: "ppm" },
  { key: "ppfd", label: "PPFD", unit: "µmol/m²/s" },
];

function confidenceVariant(
  c: SensorSnapshotReviewResult["confidence"],
): "default" | "secondary" | "outline" {
  if (c === "high") return "default";
  if (c === "medium") return "secondary";
  return "outline";
}

function findingRole(severity: SensorSnapshotReviewFinding["severity"]): string | undefined {
  if (severity === "blocker") return "alert";
  if (severity === "warning") return "status";
  return undefined;
}

export default function ManualSensorSnapshotReviewPanel({ result }: Props) {
  const { source, confidence, findings, normalizedPreview, canSave } = result;

  const presentPreview = PREVIEW_FIELDS.filter(({ key }) => {
    const v = normalizedPreview[key];
    return v !== null && v !== undefined;
  });

  return (
    <Card
      data-testid="manual-sensor-snapshot-review-panel"
      data-can-save={canSave ? "true" : "false"}
      data-source={source}
    >
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold leading-none tracking-tight">
            Snapshot review
          </h2>
          <Badge variant="outline" data-testid="snapshot-source-chip">
            {source}
          </Badge>
          <Badge
            variant={confidenceVariant(confidence)}
            data-testid="snapshot-confidence-chip"
          >
            {confidence} confidence
          </Badge>
        </div>
        {normalizedPreview.capturedAt ? (
          <p className="text-xs text-muted-foreground">
            Captured at{" "}
            <span data-testid="snapshot-captured-at">
              {normalizedPreview.capturedAt}
            </span>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="text-sm font-medium"
          data-testid="snapshot-ready-status"
        >
          {canSave
            ? "Ready to save this manual snapshot."
            : "Fix blockers before saving."}
        </p>

        {findings.length > 0 && (
          <ul
            className="space-y-2"
            data-testid="snapshot-findings"
          >
            {findings.map((f) => (
              <li
                key={f.key}
                role={findingRole(f.severity)}
                data-severity={f.severity}
                data-testid={`snapshot-finding-${f.key}`}
                className="text-sm"
              >
                <span className="font-medium">{f.label}: </span>
                <span className="text-muted-foreground">{f.message}</span>
              </li>
            ))}
          </ul>
        )}

        {presentPreview.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Normalized preview</h3>
            <dl
              className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"
              data-testid="snapshot-normalized-preview"
            >
              {presentPreview.map(({ key, label, unit }) => (
                <div key={key} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd data-testid={`snapshot-preview-${key}`}>
                    {String(normalizedPreview[key])}
                    {unit ? ` ${unit}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
