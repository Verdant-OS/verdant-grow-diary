/**
 * PlantDetailAiDoctorReadinessGate — presenter-only UI safety gate.
 *
 * Hard constraints:
 *  - No AI/model calls, no session creation, no Supabase writes.
 *  - "Add missing context" focuses an in-page anchor; never submits or
 *    opens a new route.
 *  - Gate copy + primary-action mapping lives in the view-model, not here.
 */
import { useCallback, useMemo } from "react";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import {
  evaluateAiDoctorContextFromSources,
  AI_DOCTOR_READINESS_LABELS,
  type AiDoctorContextPlantSource,
} from "@/lib/aiDoctorContextViewModel";
import {
  buildAiDoctorContextQuickActions,
} from "@/lib/aiDoctorContextQuickActionsViewModel";
import {
  buildAiDoctorReadinessGate,
} from "@/lib/aiDoctorReadinessGateViewModel";
import type { AiDoctorContextReadiness } from "@/lib/aiDoctorContextRules";
import AiDoctorContextQuickActions from "@/components/AiDoctorContextQuickActions";
import {
  useTimelineMemory,
  TIMELINE_MEMORY_DEFAULT_LIMIT,
} from "@/hooks/useTimelineMemory";

export interface PlantDetailAiDoctorReadinessGateProps {
  plantId: string;
  plant:
    | (AiDoctorContextPlantSource & {
        id?: string | null;
        name?: string | null;
        growId?: string | null;
        tentId?: string | null;
      })
    | null;
  /** True when a safe AI Doctor flow already exists on this screen. */
  hasSafeAiDoctorFlow?: boolean;
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

export default function PlantDetailAiDoctorReadinessGate({
  plantId,
  plant,
  hasSafeAiDoctorFlow,
}: PlantDetailAiDoctorReadinessGateProps) {
  const { items } = useTimelineMemory(
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

  const gate = useMemo(
    () =>
      buildAiDoctorReadinessGate({
        readiness: result.readiness,
        hasSafeAiDoctorFlow,
      }),
    [result.readiness, hasSafeAiDoctorFlow],
  );

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

  const onPrimary = useCallback(() => {
    const id = gate.primary.anchorId;
    if (!id || typeof document === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof (el as HTMLElement).focus === "function") {
      (el as HTMLElement).focus({ preventScroll: true });
    }
  }, [gate.primary.anchorId]);

  const style = READINESS_STYLES[gate.readiness];

  return (
    <section
      aria-labelledby="plant-ai-doctor-readiness-gate-heading"
      data-testid="plant-ai-doctor-readiness-gate"
      data-readiness={gate.readiness}
      className="glass rounded-2xl p-4 my-3 space-y-3"
    >
      <header className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2
            id="plant-ai-doctor-readiness-gate-heading"
            className="text-base font-semibold tracking-tight"
          >
            AI Doctor Readiness
          </h2>
          <p
            className="text-xs text-muted-foreground"
            data-testid="plant-ai-doctor-readiness-gate-message"
          >
            {gate.message}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${style.badge}`}
          data-testid="plant-ai-doctor-readiness-gate-badge"
        >
          {style.icon}
          {AI_DOCTOR_READINESS_LABELS[gate.readiness]}
        </span>
      </header>

      <div>
        <button
          type="button"
          onClick={onPrimary}
          data-testid={gate.primary.testId}
          data-action-kind={gate.primary.kind}
          data-anchor-id={gate.primary.anchorId ?? ""}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium hover:bg-background/60"
        >
          {gate.primary.label}
        </button>
      </div>

      {gate.showQuickActions && quickActions.length > 0 ? (
        <AiDoctorContextQuickActions
          actions={quickActions}
          testIdPrefix="plant-ai-doctor-readiness-gate"
        />
      ) : null}
    </section>
  );
}
