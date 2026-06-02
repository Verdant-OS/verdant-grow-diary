/**
 * CoachAiDoctorContextPanel — read-only AI Doctor context readiness panel
 * for the AI Doctor screen (Coach). Presenter only. No AI calls, no
 * session creation, no Supabase writes, no alerts, no action queue.
 *
 * Reuses the deterministic `evaluateAiDoctorContext` rules and the
 * `aiDoctorContextViewModel` tooltip helpers so vocabulary is not
 * duplicated inside JSX.
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

export interface CoachDiaryEntryLike {
  entry_type?: string | null;
  entry_at?: string | number | Date | null;
  created_at?: string | number | Date | null;
  details?: unknown;
}

export interface CoachAiDoctorContextPanelProps {
  plant: AiDoctorContextPlantSource | null;
  diaryEntries?: readonly CoachDiaryEntryLike[];
  /** Optional pre-computed manual snapshot list; defaults to deriving from diary. */
  manualSnapshots?: readonly AiDoctorContextManualSnapshotInput[];
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

export default function CoachAiDoctorContextPanel({
  plant,
  diaryEntries,
  manualSnapshots,
  className,
}: CoachAiDoctorContextPanelProps) {
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
      plant: plantToAiDoctorContextPlant(plant),
      recentEvents: events,
      recentManualSnapshots: manualSnapshots ?? derivedSnaps,
    });
  }, [plant, diaryEntries, manualSnapshots]);

  const style = READINESS_STYLES[result.readiness];

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
