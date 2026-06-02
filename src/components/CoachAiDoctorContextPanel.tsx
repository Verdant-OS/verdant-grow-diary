/**
 * CoachAiDoctorContextPanel — read-only AI Doctor context readiness panel
 * for the AI Doctor screen (Coach). Presenter only. No AI calls, no
 * session creation, no Supabase writes, no alerts, no action queue.
 *
 * Reuses the deterministic `evaluateAiDoctorContext` rules and the
 * `aiDoctorContextViewModel` tooltip helpers so vocabulary is not
 * duplicated inside JSX.
 *
 * Plant selection rules (avoid silently using `plants[0]`):
 *   - If `selectedPlantId` matches a plant in `plants`, use that plant.
 *   - Else if `plants.length === 1`, use that single plant.
 *   - Else if a legacy `plant` prop is supplied (back-compat for callers
 *     that have already resolved their own active plant), use it.
 *   - Else render the calm "Select a plant" fallback.
 */
import { useMemo } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import {
  evaluateAiDoctorContext,
  AI_DOCTOR_INSUFFICIENT_NOTICE,
  type AiDoctorContextEventInput,
  type AiDoctorContextManualSnapshotInput,
  type AiDoctorContextReadiness,
} from "@/lib/aiDoctorContextRules";
import {
  AI_DOCTOR_READINESS_LABELS,
  labelEvidence,
  labelMissing,
  tooltipForEvidence,
  tooltipForMissing,
  plantToAiDoctorContextPlant,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import {
  buildAiDoctorContextQuickActions,
  AI_DOCTOR_NO_WARNING_CONTEXT_COPY,
} from "@/lib/aiDoctorContextQuickActionsViewModel";
import AiDoctorContextQuickActions from "@/components/AiDoctorContextQuickActions";

export interface CoachDiaryEntryLike {
  entry_type?: string | null;
  entry_at?: string | number | Date | null;
  created_at?: string | number | Date | null;
  details?: unknown;
}

export interface CoachAiDoctorContextPanelProps {
  /** Legacy single-plant prop. New callers should prefer `plants`+`selectedPlantId`. */
  plant?: AiDoctorContextPlantSource | null;
  /** Full plant list available in the current grow/tent context. */
  plants?: readonly AiDoctorContextPlantSource[];
  /** Explicit selected plant id from route/search/UI selection. */
  selectedPlantId?: string | null;
  diaryEntries?: readonly CoachDiaryEntryLike[];
  /** Optional pre-computed manual snapshot list; defaults to deriving from diary. */
  manualSnapshots?: readonly AiDoctorContextManualSnapshotInput[];
  /** Optional grow id used to build sensor/snapshot quick-action targets. */
  growId?: string | null;
  className?: string;
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

function classifyEntry(
  entryType: string | null | undefined,
): AiDoctorContextEventInput["category"] {
  const t = (entryType ?? "").toLowerCase();
  if (t === "watering") return "watering";
  if (t === "feeding") return "feeding";
  if (t === "photo") return "photos";
  if (t === "note") return "notes";
  if (t === "manual_sensor_snapshot" || t === "sensor_snapshot")
    return "manual_sensor_snapshot";
  return "other";
}

function isManualSnapshotEntry(e: CoachDiaryEntryLike): boolean {
  const d = e.details as { source?: unknown } | null | undefined;
  return !!d && typeof d === "object" && (d as { source?: unknown }).source === "manual";
}

/**
 * Resolve the plant the panel should describe without silently
 * defaulting to the first item in a multi-plant list.
 */
function resolveActivePlant(
  plants: readonly AiDoctorContextPlantSource[] | undefined,
  selectedPlantId: string | null | undefined,
  legacyPlant: AiDoctorContextPlantSource | null | undefined,
): { plant: AiDoctorContextPlantSource | null; ambiguous: boolean } {
  const list = Array.isArray(plants) ? plants : [];
  if (selectedPlantId) {
    const match = list.find(
      (p) => p && typeof p.id === "string" && p.id === selectedPlantId,
    );
    if (match) return { plant: match, ambiguous: false };
  }
  if (list.length === 1) return { plant: list[0] ?? null, ambiguous: false };
  if (legacyPlant) return { plant: legacyPlant, ambiguous: false };
  if (list.length > 1) return { plant: null, ambiguous: true };
  return { plant: null, ambiguous: false };
}

export const COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY =
  "Select a plant to review AI Doctor context.";

export default function CoachAiDoctorContextPanel({
  plant,
  plants,
  selectedPlantId,
  diaryEntries,
  manualSnapshots,
  growId,
  className,
}: CoachAiDoctorContextPanelProps) {
  const { plant: activePlant, ambiguous } = useMemo(
    () => resolveActivePlant(plants, selectedPlantId, plant),
    [plants, selectedPlantId, plant],
  );

  const result = useMemo(() => {
    const events: AiDoctorContextEventInput[] = [];
    const derivedSnaps: AiDoctorContextManualSnapshotInput[] = [];
    const entries = Array.isArray(diaryEntries) ? diaryEntries : [];
    for (const e of entries) {
      const at = e.entry_at ?? e.created_at ?? null;
      events.push({ at, category: classifyEntry(e.entry_type) });
      if (isManualSnapshotEntry(e)) {
        derivedSnaps.push({ at, severity: "ok" });
      }
    }
    return evaluateAiDoctorContext({
      plant: plantToAiDoctorContextPlant(activePlant),
      recentEvents: events,
      recentManualSnapshots: manualSnapshots ?? derivedSnaps,
    });
  }, [activePlant, diaryEntries, manualSnapshots]);

  const quickActions = useMemo(
    () =>
      buildAiDoctorContextQuickActions({
        missing: result.missing,
        plantId: activePlant?.id ?? null,
        plantName: activePlant?.name ?? null,
        growId: growId ?? null,
      }),
    [result.missing, activePlant, growId],
  );

  if (ambiguous) {
    return (
      <section
        aria-labelledby="coach-ai-doctor-context-heading"
        data-testid="coach-ai-doctor-context-panel"
        data-ambiguous="true"
        className={`glass rounded-2xl p-4 space-y-2 ${className ?? ""}`}
      >
        <h2
          id="coach-ai-doctor-context-heading"
          className="text-base font-semibold tracking-tight"
        >
          AI Doctor Context
        </h2>
        <p
          className="text-xs text-muted-foreground"
          data-testid="coach-ai-doctor-context-ambiguous-notice"
        >
          {COACH_AI_DOCTOR_CONTEXT_AMBIGUOUS_COPY}
        </p>
      </section>
    );
  }

  const style = READINESS_STYLES[result.readiness];
  const noWarningContext = result.counts.recentWarnings === 0;

  return (
    <section
      aria-labelledby="coach-ai-doctor-context-heading"
      data-testid="coach-ai-doctor-context-panel"
      data-readiness={result.readiness}
      className={`glass rounded-2xl p-4 space-y-3 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2
            id="coach-ai-doctor-context-heading"
            className="text-base font-semibold tracking-tight"
          >
            AI Doctor Context
          </h2>
          <p className="text-xs text-muted-foreground">
            A read-only summary of the context Verdant has available before
            you ask for guidance. This panel does not run AI or claim a
            diagnosis.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${style.badge}`}
          data-testid="coach-ai-doctor-context-readiness"
        >
          {style.icon}
          {AI_DOCTOR_READINESS_LABELS[result.readiness]}
        </span>
      </header>

      {result.readiness !== "strong" ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="coach-ai-doctor-context-notice"
        >
          More context would improve confidence. {AI_DOCTOR_INSUFFICIENT_NOTICE}
        </p>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <div data-testid="coach-ai-doctor-context-evidence">
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
        <div data-testid="coach-ai-doctor-context-missing">
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
          testIdPrefix="coach-ai-doctor-context"
        />
      ) : null}

      {noWarningContext ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="coach-ai-doctor-context-no-warning"
        >
          {AI_DOCTOR_NO_WARNING_CONTEXT_COPY}
        </p>
      ) : null}

      <p
        className="text-xs"
        data-testid="coach-ai-doctor-context-safe-next-step"
      >
        <span className="font-medium">Safe next step: </span>
        <span className="text-muted-foreground">{result.safeNextStep}</span>
      </p>
    </section>
  );
}
