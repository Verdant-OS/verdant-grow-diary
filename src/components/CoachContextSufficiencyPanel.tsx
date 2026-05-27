/**
 * CoachContextSufficiencyPanel — presenter-only panel that summarizes the
 * pure result returned by `evaluateAiContextSufficiency` so the user can see,
 * before asking, whether Verdant has enough real grow context.
 *
 * No queries, no writes, no classification logic — pure presenter.
 */
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AiContextSufficiencyResult } from "@/lib/aiContextSufficiencyRules";
import {
  CONFIDENCE_CEILING_CAPS,
  CONFIDENCE_LIMITED_COPY,
} from "@/lib/aiDoctorConfidenceRules";

function ceilingPct(ceiling: AiContextSufficiencyResult["confidenceCeiling"]): number {
  return Math.round(CONFIDENCE_CEILING_CAPS[ceiling] * 100);
}

const MISSING_LABEL: Record<string, string> = {
  "active-grow": "An active grow",
  plants: "At least one plant",
  "plant-stage": "Plant stage",
  "plant-strain": "Plant strain",
  "plant-medium": "Growing medium",
  "recent-diary": "Recent diary entries",
  "recent-watering-or-feeding": "Recent watering or feeding",
  "sensor-source": "A real sensor data source",
  "env:temp": "Recent temperature",
  "env:rh": "Recent humidity",
  "env:vpd": "Recent VPD",
  "nutrient:ph": "Recent pH",
  "nutrient:ec": "Recent EC",
  "visual:photo": "A photo for visual diagnosis",
};

const WARNING_LABEL: Record<string, string> = {
  "partial-plant-stage": "Some plants are missing stage",
  "partial-plant-strain": "Some plants are missing strain",
  "partial-plant-medium": "Some plants are missing medium",
  "sensor-source:demo": "Sensor data is demo/mock, not live",
  "sensor-source:mixed": "Sensor data is a mix of live and demo",
  "sensor-source:unknown": "Sensor data source is unknown",
  "sensor-reading:invalid-timestamp": "Some sensor readings have invalid timestamps",
  "sensor-reading:no-valid-timestamps": "No sensor readings have valid timestamps",
  "sensor-reading:stale": "Most recent sensor reading is stale",
};

function labelMissing(code: string): string {
  return MISSING_LABEL[code] ?? code;
}
function labelWarning(code: string): string {
  return WARNING_LABEL[code] ?? code;
}

interface Props {
  result: AiContextSufficiencyResult;
  className?: string;
}

export default function CoachContextSufficiencyPanel({ result, className }: Props) {
  const { sufficiency, confidenceCeiling, missing, warnings, trustedForAi } = result;

  // When everything is good and trusted, render a small confirmation note.
  if (
    sufficiency === "sufficient" &&
    confidenceCeiling === "high" &&
    trustedForAi &&
    missing.length === 0 &&
    warnings.length === 0
  ) {
    return (
      <div
        data-testid="coach-context-panel"
        data-sufficiency={sufficiency}
        data-ceiling={confidenceCeiling}
        data-trusted={String(trustedForAi)}
        className={cn(
          "rounded-2xl border border-border/50 bg-secondary/20 p-3 flex items-center gap-2",
          className,
        )}
      >
        <ShieldCheck className="h-4 w-4 text-[hsl(var(--success))]" />
        <span className="text-xs text-muted-foreground">
          Sufficient real grow context. AI confidence is not capped by missing data.
        </span>
        <Badge
          variant="default"
          data-testid="coach-context-confidence-ceiling"
          data-label="high"
          data-ceiling-pct={ceilingPct("high")}
          className="ml-auto text-[10px] uppercase tracking-wide"
        >
          Up to {ceilingPct("high")}% confidence
        </Badge>
      </div>
    );
  }

  const headlineByCeiling: Record<AiContextSufficiencyResult["confidenceCeiling"], string> = {
    high: "AI confidence is not capped, but some context is missing.",
    medium: "AI confidence will be capped at medium because context is partial or demo-backed.",
    low: "AI confidence will be capped at low because real grow context is missing or demo-backed.",
  };

  const Icon = confidenceCeiling === "low" ? ShieldAlert : AlertTriangle;
  const iconClass =
    confidenceCeiling === "low"
      ? "text-destructive"
      : "text-[hsl(var(--warning))]";

  return (
    <div
      data-testid="coach-context-panel"
      data-sufficiency={sufficiency}
      data-ceiling={confidenceCeiling}
      data-trusted={String(trustedForAi)}
      className={cn("rounded-2xl border border-border/50 bg-secondary/30 p-4 space-y-3", className)}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconClass)} />
        <p className="text-sm font-medium">
          Limited grow context for AI Coach
        </p>
        <Badge
          variant={confidenceCeiling === "low" ? "destructive" : "secondary"}
          data-testid="coach-context-confidence-ceiling"
          data-label={confidenceCeiling}
          className="ml-auto text-[10px] uppercase tracking-wide"
        >
          {confidenceCeiling === "low"
            ? "Low confidence"
            : confidenceCeiling === "medium"
              ? "Capped at medium"
              : "Capped"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        {headlineByCeiling[confidenceCeiling]} You can still ask, but answers will be
        labeled as limited-context guidance.
      </p>

      {missing.length > 0 && (
        <div data-testid="coach-context-missing">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Missing context
          </p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {missing.map((code) => (
              <li key={code} data-missing-code={code}>
                {labelMissing(code)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div data-testid="coach-context-warnings">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Warnings
          </p>
          <ul className="text-xs space-y-0.5 list-disc list-inside">
            {warnings.map((code) => (
              <li key={code} data-warning-code={code}>
                {labelWarning(code)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
