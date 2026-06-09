import { useParams, Link } from "react-router-dom";
import { AlertTriangle, Archive, ArrowLeft, ArrowRight, Box, GitMerge, Sprout } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import EmptyState from "@/components/EmptyState";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import PlantDetailDataSourceDisclosure from "@/components/PlantDetailDataSourceDisclosure";
import AssignTentDialog from "@/components/AssignTentDialog";
import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";
import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";
import ManualSnapshotTimelineSection from "@/components/ManualSnapshotTimelineSection";
import TimelineMemorySection from "@/components/TimelineMemorySection";
import QuickLogGroupedTimelineSection from "@/components/QuickLogGroupedTimelineSection";
import PlantDailyGrowCheckHistoryCard from "@/components/PlantDailyGrowCheckHistoryCard";
import DailyGrowCheckOnboardingCard from "@/components/DailyGrowCheckOnboardingCard";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";
import PlantRecentMoveCard from "@/components/PlantRecentMoveCard";
import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";
import PlantAssignedTentActionsPanel from "@/components/PlantAssignedTentActionsPanel";
import PlantStatusStrip from "@/components/PlantStatusStrip";
import QuickLogV2Fab from "@/components/QuickLogV2Fab";
import PlantQuickStatusStrip from "@/components/PlantQuickStatusStrip";
import PlantDetailQuickActions from "@/components/PlantDetailQuickActions";
import PlantDetailPhotoStrip from "@/components/PlantDetailPhotoStrip";
import PlantDetailRecentActivityRecap from "@/components/PlantDetailRecentActivityRecap";
import PlantDetailWhatsMissing from "@/components/PlantDetailWhatsMissing";
import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";
import PlantDetailDoctorContextPreview from "@/components/PlantDetailDoctorContextPreview";
import PlantDetailAiDoctorContextPanel from "@/components/PlantDetailAiDoctorContextPanel";
import PlantDetailAiDoctorReadinessGate from "@/components/PlantDetailAiDoctorReadinessGate";
import PlantDetailAiDoctorSafeReviewStart from "@/components/PlantDetailAiDoctorSafeReviewStart";
import AiDoctorReviewResultPreview from "@/components/AiDoctorReviewResultPreview";
import PlantDetailAiDoctorLiveReview from "@/components/PlantDetailAiDoctorLiveReview";
import PlantDetailAskDoctorHelper from "@/components/PlantDetailAskDoctorHelper";
import { PLANT_RELATIVE_TIMELINE_ANCHOR_ID } from "@/lib/plantDetailQuickActions";
import PlantDetailSectionNav from "@/components/PlantDetailSectionNav";
import { PLANT_DETAIL_SECTION_ANCHORS } from "@/lib/plantDetailSectionAnchors";

import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";
import PlantAiDoctorSessionsPanel from "@/components/PlantAiDoctorSessionsPanel";
import PlantPhoto from "@/components/PlantPhoto";
import { Badge } from "@/components/ui/badge";
import {
  getArchivedPlantLabel,
  getMergeTargetPlantId,
  isActivePlant,
} from "@/lib/archivedPlantVisibilityRules";
import { Button } from "@/components/ui/button";
import { useGrowPlant, useGrowTent, getGrowDataMeta } from "@/hooks/useGrowData";
import { format, formatDistanceToNow } from "date-fns";

import PlantQuickLog from "@/components/PlantQuickLog";
import PlantManualSensorFreshnessCard from "@/components/PlantManualSensorFreshnessCard";
import { useState } from "react";
import { Zap } from "lucide-react";

import { logsPath, plantDetailPath, plantsPath, tentDetailPath } from "@/lib/routes";

export default function PlantDetail() {
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const { id } = useParams();
  const { data: plant, isLoading, isError, refetch } = useGrowPlant(id);
  const { data: tent } = useGrowTent(plant?.tentId);
  const plantMeta = getGrowDataMeta(["grow", "plant", id ?? null]);
  const tentMeta = getGrowDataMeta(["grow", "tent", plant?.tentId ?? null]);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading plant"
        aria-busy="true"
        data-testid="plant-detail-loading"
        className="glass rounded-2xl h-64 animate-pulse"
      />
    );
  }
  if (isError) {
    return (
      <div data-testid="plant-detail-error">
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Couldn't load this plant"
          description="Something went wrong while loading plant details. Check your connection and retry."
          action={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => refetch()}
                data-testid="plant-detail-error-retry"
                className="min-h-11"
              >
                Retry
              </Button>
              <Button asChild variant="ghost" className="min-h-11">
                <Link to={plantsPath()}>
                  <ArrowLeft className="h-4 w-4" /> Back to plants
                </Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }
  if (!plant) {
    return (
      <div>
        <GrowDataSourceDisclosure
          resource="plants"
          hasAnyData={false}
          metas={[plantMeta]}
          testId="plant-detail-data-source-disclosure"
        />
        <EmptyState
          icon={<Sprout className="h-6 w-6" />}
          title="Plant not found"
          description="This plant isn't in your tracked plants yet."
          action={
            <Button asChild variant="outline" className="min-h-11">
              <Link to={plantsPath()}>
                <ArrowLeft className="h-4 w-4" /> Back to plants
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const ageDays = Math.floor((Date.now() - new Date(plant.startedAt).getTime()) / 86400000);
  return (
    <div>
      <QuickLogV2Fab defaultTargetKey={`plant:${plant.id}`} />
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to={plantsPath()}>
          <ArrowLeft className="h-4 w-4" /> Plants
        </Link>
      </Button>
      <PageHeader
        title={plant.name}
        description={plant.strain}
        icon={<Sprout className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            {!isActivePlant(plant) && (
              <Badge
                variant="outline"
                data-testid="plant-detail-archived-badge"
                data-archived-kind={getArchivedPlantLabel(plant).kind}
                className="gap-1 border-amber-500/40 text-amber-300"
              >
                {getArchivedPlantLabel(plant).kind === "merged" ? (
                  <GitMerge className="h-3 w-3" />
                ) : (
                  <Archive className="h-3 w-3" />
                )}
                {getArchivedPlantLabel(plant).label}
              </Badge>
            )}
            <StageBadge stage={plant.stage} />
          </div>
        }
      />
      <PlantDetailDataSourceDisclosure
        metas={[plantMeta, tentMeta]}
        testId="plant-detail-data-source-disclosure"
      />

      <PlantQuickStatusStrip
        plantId={plant.id}
        plantStartedAt={plant.startedAt}
        stage={plant.stage}
        tentId={plant.tentId ?? null}
        growId={plant.growId ?? null}
      />
      <PlantDetailQuickActions
        plantId={plant.id}
        plantName={plant.name}
        growId={plant.growId ?? null}
        tentId={plant.tentId ?? null}
        tentName={tent?.name ?? null}
      />
      <PlantDetailAskDoctorHelper
        plantId={plant.id}
        stage={plant.stage ?? null}
        hasPlantPhoto={!!plant.photo}
      />
      <PlantDetailSectionNav
        hasAlertsSection
        hasActionsSection
        hasDoctorSection
        hasAssignedTent={!!plant.tentId}
      />
      <PlantDetailPhotoStrip
        plantId={plant.id}
        growId={plant.growId ?? null}
        onUploadPhoto={() => setQuickLogOpen(true)}
      />

      <PlantDetailWhatsMissing
        plantId={plant.id}
        growId={plant.growId ?? null}
        stage={plant.stage ?? null}
        hasPlantPhoto={!!plant.photo}
      />
      <PlantDetailRecentActivityRecap
        plantId={plant.id}
        onAddQuickCheck={() => setQuickLogOpen(true)}
      />
      <PlantDetailAiDoctorReadiness
        plantId={plant.id}
        growId={plant.growId ?? null}
        stage={plant.stage ?? null}
        hasPlantPhoto={!!plant.photo}
      />
      <PlantDetailDoctorContextPreview
        plantId={plant.id}
        stage={plant.stage ?? null}
        hasPlantPhoto={!!plant.photo}
        growId={plant.growId ?? null}
        tentId={plant.tentId ?? null}
        plantName={plant.name}
        tentName={tent?.name ?? null}
      />
      <PlantDetailAiDoctorReadinessGate
        plantId={plant.id}
        plant={plant}
        hasSafeAiDoctorFlow
      />
      <PlantDetailAiDoctorSafeReviewStart
        plantId={plant.id}
        plant={plant}
      />
      <AiDoctorReviewResultPreview
        testIdPrefix="plant-detail"
      />
      <PlantDetailAiDoctorLiveReview
        plantId={plant.id}
        plant={plant}
        growId={plant.growId ?? null}
        tentId={plant.tentId ?? null}
      />

      <div id="plant-ai-doctor-context-panel" tabIndex={-1} className="scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        <PlantDetailAiDoctorContextPanel
          plantId={plant.id}
          plant={plant}
        />
      </div>




      {!isActivePlant(plant) && (
        <ArchivedPlantBanner plantId={plant.id} lastNote={plant.lastNote} />
      )}
      <div className="mb-3">
        <PlantCardActionsMenu
          plant={{
            id: plant.id,
            name: plant.name,
            strain: plant.strain,
            stage: plant.stage,
            health: plant.health,
            startedAt: plant.startedAt,
            tentId: plant.tentId ?? null,
            growId: plant.growId ?? null,
            lastNote: plant.lastNote,
            isArchived: plant.isArchived ?? false,
          }}
          variant="row"
          hideView
        />
      </div>
      <div
        id={PLANT_DETAIL_SECTION_ANCHORS.overview}
        tabIndex={-1}
        aria-label="Plant overview section"
        className="grid lg:grid-cols-3 gap-4 scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
      >
        <div className="lg:col-span-1 glass rounded-2xl overflow-hidden">
          <PlantPhoto
            src={plant.photo}
            alt={plant.name}
            className="aspect-square"
            caption="No plant photo yet"
          />
        </div>
        <div className="lg:col-span-2 glass rounded-2xl p-5 space-y-3">
          <PlantStatusStrip
            tentId={plant.tentId ?? null}
            tentName={tent?.name ?? null}
            growId={plant.growId ?? null}
          />
          <PlantRecentMoveCard plantId={plant.id} />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div data-testid="plant-detail-tent">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Tent</div>
              {tent ? (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span>{tent.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1"
                      data-testid="plant-detail-view-tent"
                    >
                      <Link to={tentDetailPath(tent.id)}>
                        <Box className="h-3.5 w-3.5" /> View Tent{" "}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <AssignTentDialog
                      plantId={plant.id}
                      growId={plant.growId ?? null}
                      currentTentId={plant.tentId ?? null}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div
                    className="flex items-center gap-1.5 text-[hsl(var(--warning))]"
                    data-testid="plant-detail-no-tent"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> No tent assigned.
                  </div>
                  <AssignTentDialog
                    plantId={plant.id}
                    growId={plant.growId ?? null}
                    currentTentId={null}
                  />
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Age</div>
              <div>{ageDays} days</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Health</div>
              <div>{plant.health}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Started</div>
              <div>{format(new Date(plant.startedAt), "MMM d, yyyy")}</div>
            </div>
          </div>
        </div>
      </div>
      {plant.lastNote && (
        <div className="glass rounded-2xl p-4 mt-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Latest note</div>
          <p className="text-sm">{plant.lastNote}</p>
        </div>
      )}
      <PlantManualSensorFreshnessCard
        plantId={plant.id}
        className="mt-4"
      />
      <PlantDailyGrowCheckConsistencyCard
        plantId={plant.id}
      />
      <PlantDailyGrowCheckHistoryCard
        plantId={plant.id}
      />
      <DailyGrowCheckOnboardingCard />
      <PlantTentEnvironmentPanel plantId={plant.id} tentId={plant.tentId ?? null} />
      <PlantAssignedTentAlertsPanel
        plantId={plant.id}
        tentId={plant.tentId ?? null}
      />
      <PlantAssignedTentActionsPanel
        plantId={plant.id}
        tentId={plant.tentId ?? null}
      />
      <PlantRecentActivityPanel plantId={plant.id} />
      <PlantRelativeTimelineSection plantId={plant.id} />
      <TimelineMemorySection plantId={plant.id} />
      <ManualSnapshotTimelineSection plantId={plant.id} />
      <QuickLogGroupedTimelineSection rawEntries={[]} />
      <PlantAiDoctorSessionsPanel plantId={plant.id} />
      <PlantQuickLog
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        plantId={plant.id}
        plantName={plant.name}
        growId={plant.growId ?? null}
        tentId={plant.tentId ?? null}
        onSaved={() => refetch()}
      />
    </div>
  );
}

function ArchivedPlantBanner({ plantId, lastNote }: { plantId: string; lastNote?: string | null }) {
  const mergeTargetId = getMergeTargetPlantId(lastNote ?? "");
  if (!mergeTargetId) return null;
  return (
    <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="font-medium mb-1">This plant has been merged</div>
      <p className="text-amber-100/80 mb-3">
        New observations should be added to the surviving plant record.
      </p>
      <Button asChild variant="outline" size="sm" className="border-amber-400/40 text-amber-50 hover:bg-amber-500/15">
        <Link to={plantDetailPath(mergeTargetId)}>Open surviving plant</Link>
      </Button>
    </div>
  );
}
