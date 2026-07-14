import { Camera, Leaf, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPhenoEvidenceGoal } from "@/lib/phenoEvidenceGoals";
import type { ParsedPhenoEvidenceReceipt } from "@/lib/phenoEvidenceCaptureRules";
import { formatQuickLogOccurredAt } from "@/lib/quickLogGroupedTimelineFilterViewModel";
import { stageLabel } from "@/lib/grow";

interface Props {
  receipt: ParsedPhenoEvidenceReceipt;
  noteText: string | null;
}

function freshnessLabel(value: ParsedPhenoEvidenceReceipt["sensorContext"]): string | null {
  if (!value) return null;
  if (value.freshness === "fresh") return "Fresh";
  if (value.freshness === "stale") return "Stale";
  if (value.freshness === "invalid") return "Invalid";
  return "Unknown freshness";
}

export default function PhenoEvidenceTimelineCard({ receipt, noteText }: Props) {
  const goal = getPhenoEvidenceGoal(receipt.evidenceGoal);
  const sensorLabel = freshnessLabel(receipt.sensorContext);
  return (
    <div
      data-testid="pheno-evidence-timeline-card"
      data-goal={receipt.evidenceGoal}
      className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-600" aria-hidden />
          <div>
            <p className="text-sm font-medium">Pheno evidence · {goal.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatQuickLogOccurredAt(receipt.entryAt)}
              {receipt.stage ? ` · ${stageLabel(receipt.stage)}` : " · Stage not recorded"}
            </p>
          </div>
        </div>
        <Badge variant="secondary" aria-label="Source: Manual">
          Manual
        </Badge>
      </div>

      {noteText?.trim() && <p className="text-sm whitespace-pre-wrap">{noteText.trim()}</p>}

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        {receipt.hasPhoto && (
          <span className="inline-flex items-center gap-1" data-testid="pheno-evidence-photo-badge">
            <Camera className="h-3 w-3" aria-hidden /> Photo attached
          </span>
        )}
        {sensorLabel && (
          <span
            className="inline-flex items-center gap-1"
            data-testid="pheno-evidence-sensor-badge"
          >
            <Radio className="h-3 w-3" aria-hidden /> Sensor context · {sensorLabel}
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Evidence receipt only · no automatic selection, Action Queue item, or device control.
      </p>
    </div>
  );
}
