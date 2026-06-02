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
  const { data: plant, isLoading } = useGrowPlant(id);
  const { data: tent } = useGrowTent(plant?.tentId);
  const plantMeta = getGrowDataMeta(["grow", "plant", id ?? null]);
  const tentMeta = getGrowDataMeta(["grow", "tent", plant?.tentId ?? null]);

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
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
            <Button asChild variant="outline">
              <Link to={plantsPath()}>
                <ArrowLeft className="h-4 w-4" /> Back
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
      <PlantDetailPhotoStrip plantId={plant.id} growId={plant.growId ?? null} />
      <PlantDetailWhatsMissing
        plantId={plant.id}
        growId={plant.growId ?? null}
        stage={plant.stage ?? null}
        hasPlantPhoto={!!plant.photo}
      />
      <PlantDetailRecentActivityRecap plantId={plant.id} />
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
      <PlantDetailAiDoctorLiveReview plantId={plant.id} plant={plant} />

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
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Started</div>
              <div>{format(new Date(plant.startedAt), "PP")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Health</div>
              <div className="capitalize">{plant.health}</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Last note
            </div>
            <p className="text-sm">{plant.lastNote}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Updated {formatDistanceToNow(new Date(plant.startedAt), { addSuffix: true })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => setQuickLogOpen(true)}
              data-testid="plant-detail-quick-log-open"
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
            >
              <Zap className="h-3.5 w-3.5" /> Quick Log
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={logsPath()}>Open Logs</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              data-testid="plant-detail-daily-grow-check-entry"
            >
              <Link to={`/daily-check?plantId=${plant.id}&from=plant-detail`}>
                Daily Grow Check
              </Link>
            </Button>
          </div>
          <PlantQuickLog
            open={quickLogOpen}
            onOpenChange={setQuickLogOpen}
            plantId={plant.id}
            plantName={plant.name}
            growId={plant.growId ?? null}
            tentId={plant.tentId ?? null}
          />
          <PlantManualSensorFreshnessCard
            plantId={plant.id}
            onUpdate={() => setQuickLogOpen(true)}
          />
          <PlantTentEnvironmentPanel
            tentId={plant.tentId ?? null}
            tentName={tent?.name ?? null}
            plantId={plant.id}
            plantName={plant.name}
            growId={plant.growId ?? null}
            plantStage={plant.stage ?? null}
          />

          <PlantRecentActivityPanel plantId={plant.id} plantName={plant.name} />
          <div
            id={PLANT_RELATIVE_TIMELINE_ANCHOR_ID}
            tabIndex={-1}
            aria-label="Plant Relative Timeline section"
            className="scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <PlantRelativeTimelineSection
              plantId={plant.id}
              plantStartedAt={plant.startedAt}
              currentStage={plant.stage}
              plantName={plant.name}
              tentName={tent?.name ?? null}
              growId={plant.growId ?? null}
              tentId={plant.tentId ?? null}
            />
          </div>

          <ManualSnapshotTimelineSection scope="plant" plantId={plant.id} />
          <QuickLogGroupedTimelineSection
            scope="plant"
            plantId={plant.id}
            tentId={plant.tentId ?? null}
          />
          <TimelineMemorySection scope="plant" plantId={plant.id} />



          <section
            aria-labelledby="plant-daily-grow-check-section-heading"
            data-testid="plant-daily-grow-check-section"
            className="space-y-4 sm:space-y-3"
          >
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
              <h2
                id="plant-daily-grow-check-section-heading"
                className="text-base font-semibold tracking-tight"
              >
                Daily Grow Check
              </h2>
              <p className="text-xs leading-snug text-muted-foreground">
                <span>Status: today's entry and recent activity.</span>
                <span aria-hidden="true" className="hidden sm:inline">
                  {" "}
                  ·{" "}
                </span>
                <span className="block sm:inline">Next: log today's check to keep rhythm.</span>
              </p>
            </div>
            <DailyGrowCheckOnboardingCard
              focusedPlantId={plant.id}
              focusedTentId={plant.tentId ?? null}
              tentIds={plant.tentId ? [plant.tentId] : null}
              hideWhenReady
            />
            <PlantDailyGrowCheckConsistencyCard
              plantId={plant.id}
              currentTentId={plant.tentId ?? null}
            />
            <PlantDailyGrowCheckHistoryCard
              plantId={plant.id}
              currentTentId={plant.tentId ?? null}
              hideHeaderCta
            />
          </section>
          <div
            id={PLANT_DETAIL_SECTION_ANCHORS.alerts}
            tabIndex={-1}
            aria-label="Plant alerts section"
            className="scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <PlantAssignedTentAlertsPanel
              tentId={plant.tentId ?? null}
              tentName={tent?.name ?? null}
              growId={plant.growId ?? null}
            />
          </div>
          <div
            id={PLANT_DETAIL_SECTION_ANCHORS.actions}
            tabIndex={-1}
            aria-label="Plant actions section"
            className="scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <PlantAssignedTentActionsPanel
              tentId={plant.tentId ?? null}
              tentName={tent?.name ?? null}
              growId={plant.growId ?? null}
            />
          </div>
          <div
            id={PLANT_DETAIL_SECTION_ANCHORS.doctor}
            tabIndex={-1}
            aria-label="Plant Doctor sessions section"
            className="scroll-mt-16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
          >
            <PlantAiDoctorSessionsPanel plantId={plant.id} />
          </div>

        </div>
      </div>
    </div>
  );
}

function ArchivedPlantBanner({ plantId, lastNote }: { plantId: string; lastNote: string }) {
  const targetId = getMergeTargetPlantId({ lastNote });
  const isMerged = !!targetId;
  return (
    <div
      data-testid="plant-detail-archived-banner"
      data-merge-target-id={targetId ?? ""}
      className="my-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100 space-y-2"
    >
      <div className="flex items-start gap-2">
        {isMerged ? (
          <GitMerge className="h-4 w-4 mt-0.5 shrink-0" />
        ) : (
          <Archive className="h-4 w-4 mt-0.5 shrink-0" />
        )}
        <div>
          <div className="font-medium">
            {isMerged ? "This plant was merged into another plant." : "This plant was archived."}
          </div>
          <p className="text-xs text-amber-200/80 mt-0.5">
            History is preserved for audit. No data was deleted.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" data-testid="plant-detail-archived-back">
          <Link to={plantsPath()}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Plants
          </Link>
        </Button>
        {targetId && targetId !== plantId && (
          <Button
            asChild
            size="sm"
            className="gradient-leaf text-primary-foreground"
            data-testid="plant-detail-archived-view-target"
          >
            <Link to={plantDetailPath(targetId)}>
              View target plant <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
