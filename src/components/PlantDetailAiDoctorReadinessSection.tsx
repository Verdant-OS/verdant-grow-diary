/**
 * PlantDetailAiDoctorReadinessSection — the Plant Detail AI review body.
 * Spec: docs/specs/ai-doctor-readiness-single-summary.md (R1, R7–R8).
 *
 * Order: one readiness summary, then the live review (C, which owns the
 * Start review control), then one collapsed "How this was decided"
 * disclosure holding F, A, B and D unchanged. The disclosure is a native
 * <details>, so its children stay mounted and keep reporting signals while
 * it is closed. A hash link to D's anchor opens it.
 *
 * No new queries: the summary is built from values the surfaces already
 * compute, reported through their optional onReadinessSignal props.
 */
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { useLocation } from "@/lib/react-router-compat";
import { useNowTick } from "@/hooks/useNowTick";
import AiDoctorReadinessSummary from "@/components/AiDoctorReadinessSummary";
import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";
import PlantDetailAiDoctorContextReadinessMount from "@/components/PlantDetailAiDoctorContextReadinessMount";
import PlantDetailTimelineEvidenceReadinessLaunch from "@/components/PlantDetailTimelineEvidenceReadinessLaunch";
import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";
import { PLANT_AI_DOCTOR_CONTEXT_PANEL_ANCHOR_ID } from "@/lib/plantDetailDisclosureRules";
import {
  buildAiDoctorReadinessSummary,
  resolveReadinessHold,
  type ReadinessASignal,
  type ReadinessCSignal,
  type ReadinessFSignal,
} from "@/lib/aiDoctorReadinessSummaryRules";
import { AI_DOCTOR_READINESS_SUMMARY_PROVENANCE_LABEL } from "@/constants/aiDoctorReadinessSummaryCopy";

type LivePlant = ComponentProps<typeof PlantDetailAiDoctorLiveReview>["plant"];
type ContextPanelPlant = ComponentProps<typeof PlantDetailAiDoctorContextPanel>["plant"];

export interface PlantDetailAiDoctorReadinessSectionProps {
  plantId: string;
  growId: string | null;
  tentId: string | null;
  tentName: string | null;
  plantName: string;
  strain: string | null | undefined;
  stage: string | null;
  medium: string | null;
  potSize: string | null;
  plantType: string | null;
  hasPlantPhoto: boolean;
  plant: NonNullable<LivePlant> & ContextPanelPlant;
}

const CONTEXT_PANEL_HASH = `#${PLANT_AI_DOCTOR_CONTEXT_PANEL_ANCHOR_ID}`;

export default function PlantDetailAiDoctorReadinessSection({
  plantId,
  growId,
  tentId,
  tentName,
  plantName,
  strain,
  stage,
  medium,
  potSize,
  plantType,
  hasPlantPhoto,
  plant,
}: PlantDetailAiDoctorReadinessSectionProps) {
  const [fSignal, setFSignal] = useState<ReadinessFSignal | null>(null);
  const [aSignal, setASignal] = useState<ReadinessASignal | null>(null);
  const [cSignal, setCSignal] = useState<ReadinessCSignal | null>(null);
  const onFSignal = useCallback((s: ReadinessFSignal) => setFSignal(s), []);
  const onASignal = useCallback((s: ReadinessASignal) => setASignal(s), []);
  const onCSignal = useCallback((s: ReadinessCSignal) => setCSignal(s), []);

  const nowMs = useNowTick();
  const summary = useMemo(
    () =>
      buildAiDoctorReadinessSummary({
        hold: resolveReadinessHold(fSignal, cSignal),
        gate: cSignal?.gate ?? null,
        ctx: cSignal?.ctx ?? null,
        view: aSignal?.view ?? null,
        missing: cSignal?.missing ?? [],
        sensor: cSignal?.sensor ? { scope: "tent", scopeName: tentName, ...cSignal.sensor } : null,
        now: new Date(nowMs),
      }),
    [aSignal, cSignal, fSignal, nowMs, tentName],
  );

  const { hash } = useLocation();
  const [provenanceOpen, setProvenanceOpen] = useState(hash === CONTEXT_PANEL_HASH);
  useEffect(() => {
    if (hash === CONTEXT_PANEL_HASH) setProvenanceOpen(true);
  }, [hash]);

  return (
    <>
      <AiDoctorReadinessSummary summary={summary} onRetry={fSignal?.retry} />
      <PlantDetailAiDoctorLiveReview
        plantId={plantId}
        plant={plant}
        growId={growId}
        tentId={tentId}
        onReadinessSignal={onCSignal}
        hidePreStartConfidenceCopy
      />
      <details
        data-testid="ai-doctor-readiness-provenance"
        open={provenanceOpen}
        onToggle={(event) => setProvenanceOpen((event.currentTarget as HTMLDetailsElement).open)}
        className="min-w-0 space-y-3 rounded-2xl"
      >
        <summary className="min-h-11 cursor-pointer rounded-2xl px-4 py-3 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
          {AI_DOCTOR_READINESS_SUMMARY_PROVENANCE_LABEL}
        </summary>
        <div className="space-y-3 pt-2">
          <PlantDetailAiDoctorReadiness
            plantId={plantId}
            growId={growId}
            tentId={tentId}
            stage={stage}
            hasPlantPhoto={hasPlantPhoto}
            onReadinessSignal={onFSignal}
          />
          <PlantDetailAiDoctorContextReadinessMount
            plantId={plantId}
            growId={growId}
            tentId={tentId}
            plantName={plantName}
            strain={strain}
            stage={stage}
            medium={medium}
            potSize={potSize}
            plantType={plantType}
            onReadinessSignal={onASignal}
          />
          <PlantDetailTimelineEvidenceReadinessLaunch
            plantId={plantId}
            growId={growId}
            tentId={tentId}
            plantName={plantName}
            strain={strain}
            stage={stage}
            hasPlantPhoto={hasPlantPhoto}
          />
          <div
            id={PLANT_AI_DOCTOR_CONTEXT_PANEL_ANCHOR_ID}
            tabIndex={-1}
            className="min-w-0 scroll-mt-16 rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PlantDetailAiDoctorContextPanel plantId={plantId} plant={plant} />
          </div>
        </div>
      </details>
    </>
  );
}
