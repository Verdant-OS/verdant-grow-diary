/**
 * PlantDetailAiDoctorContextPanel — read-only AI Doctor Context readiness
 * panel. Presenter only. No live AI calls, no session creation, no writes.
 */
import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  useTimelineMemory,
  TIMELINE_MEMORY_DEFAULT_LIMIT,
} from "@/hooks/useTimelineMemory";
import {
  evaluateAiDoctorContextFromSources,
  AI_DOCTOR_READINESS_LABELS,
  labelEvidence,
  labelMissing,
  tooltipForEvidence,
  tooltipForMissing,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import {
  AI_DOCTOR_INSUFFICIENT_NOTICE,
  type AiDoctorContextReadiness,
} from "@/lib/aiDoctorContextRules";
import {
  buildAiDoctorContextQuickActions,
  AI_DOCTOR_NO_WARNING_CONTEXT_COPY,
} from "@/lib/aiDoctorContextQuickActionsViewModel";
import AiDoctorContextQuickActions from "@/components/AiDoctorContextQuickActions";
import AiDoctorVpdDriftSection from "@/components/AiDoctorVpdDriftSection";
import type { AiDoctorVpdDriftContext } from "@/lib/vpdDriftRules";

export interface PlantDetailAiDoctorContextPanelProps {
  plantId: string;
  plant:
    | (AiDoctorContextPlantSource & {
        id?: string | null;
        name?: string | null;
        growId?: string | null;
        tentId?: string | null;
      })
    | null;
  /**
   * Optional VPD drift context, sourced from
   * `aiDoctorSensorContextRules.mapSensorReadingToAiDoctorContext`. When
   * absent, the drift section is hidden. Display only — no automation.
   */
  vpdDrift?: AiDoctorVpdDriftContext | null;
}

const READINESS_STYLES: Record<
  AiDoctorContextReadiness,
  { badge: string; icon: JSX.Element }
> = {
  strong: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    icon: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
  },
  partial: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    icon: <Info className="h-4 w-4" aria-hidden="true" />,
  },
  insufficient: {
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
  },
};

export default function PlantDetailAiDoctorContextPanel({
  plantId,
  plant,
}: PlantDetailAiDoctorContextPanelProps) {
  const { items, isLoading } = useTimelineMemory(
    { kind: "plant", plantId },
    TIMELINE_MEMORY_DEFAULT_LIMIT,
  );

  const result = useMemo(
    () =>
      evaluateAiDoctorContextFromSources({
        plant,
        timelineItems: items,
      }),
    [plant, items],
  );

  const style = READINESS_STYLES[result.readiness];
  const latestSnap = result.latest.manualSnapshotAt
    ? formatDistanceToNow(new Date(result.latest.manualSnapshotAt), {
        addSuffix: true,
      })
    : null;
  const quickActions = useMemo(
    () =>
      buildAiDoctorContextQuickActions({
        missing: result.missing,
        plantId,
        plantName: plant?.name ?? null,
        growId: plant?.growId ?? null,
        tentId: plant?.tentId ?? null,
      }),
    [result.missing, plantId, plant?.name, plant?.growId, plant?.tentId],
  );
  const noWarningContext = result.counts.recentWarnings === 0;

  return (
    <section
      aria-labelledby="plant-ai-doctor-context-heading"
      data-testid="plant-ai-doctor-context-panel"
      data-readiness={result.readiness}
      className="glass rounded-2xl p-4 my-3 space-y-3"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2
            id="plant-ai-doctor-context-heading"
            className="text-base font-semibold tracking-tight"
          >
            AI Doctor Context
          </h2>
          <p className="text-xs text-muted-foreground">
            A read-only summary of the context Verdant has available. This panel
            does not run AI or claim a diagnosis.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${style.badge}`}
          data-testid="plant-ai-doctor-context-readiness"
        >
          {style.icon}
          {AI_DOCTOR_READINESS_LABELS[result.readiness]}
        </span>
      </header>

      {result.readiness !== "strong" ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="plant-ai-doctor-context-notice"
        >
          {AI_DOCTOR_INSUFFICIENT_NOTICE}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Recent events (7d)" value={result.counts.recentEvents} />
        <Stat
          label="Recent watering/feeding"
          value={result.counts.recentWateringOrFeeding}
        />
        <Stat
          label="Manual snapshots (7d)"
          value={result.counts.recentManualSnapshots}
        />
        <Stat label="Warnings (7d)" value={result.counts.recentWarnings} />
      </div>

      {latestSnap ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="plant-ai-doctor-context-latest-snapshot"
        >
          Latest manual sensor snapshot: {latestSnap}
        </p>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <div data-testid="plant-ai-doctor-context-evidence">
          <div className="text-xs font-medium mb-1">Evidence available</div>
          {result.evidence.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No supporting context yet.
            </p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {result.evidence.map((code) => (
                <li
                  key={code}
                  className="flex items-start gap-1.5"
                  title={tooltipForEvidence(code)}
                  data-tooltip={tooltipForEvidence(code)}
                  data-code={code}
                >
                  <CheckCircle2
                    className="h-3.5 w-3.5 mt-0.5 text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{labelEvidence(code)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="plant-ai-doctor-context-missing">
          <div className="text-xs font-medium mb-1">Missing information</div>
          {result.missing.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing critical missing.
            </p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {result.missing.map((code) => (
                <li
                  key={code}
                  className="flex items-start gap-1.5"
                  title={tooltipForMissing(code)}
                  data-tooltip={tooltipForMissing(code)}
                  data-code={code}
                >
                  <AlertTriangle
                    className="h-3.5 w-3.5 mt-0.5 text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{labelMissing(code)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {quickActions.length > 0 ? (
        <AiDoctorContextQuickActions
          actions={quickActions}
          testIdPrefix="plant-ai-doctor-context"
        />
      ) : null}

      {noWarningContext ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="plant-ai-doctor-context-no-warning"
        >
          {AI_DOCTOR_NO_WARNING_CONTEXT_COPY}
        </p>
      ) : null}

      <p
        className="text-xs"
        data-testid="plant-ai-doctor-context-safe-next-step"
      >
        <span className="font-medium">Safe next step: </span>
        <span className="text-muted-foreground">{result.safeNextStep}</span>
      </p>

      {isLoading ? (
        <p className="text-[11px] text-muted-foreground" aria-live="polite">
          Loading recent context…
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
