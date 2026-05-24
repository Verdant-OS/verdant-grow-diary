import { useParams, Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Box, Sprout } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import EmptyState from "@/components/EmptyState";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import AssignTentDialog from "@/components/AssignTentDialog";
import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";
import PlantRecentActivityPanel from "@/components/PlantRecentActivityPanel";
import PlantRecentMoveCard from "@/components/PlantRecentMoveCard";
import PlantAssignedTentAlertsPanel from "@/components/PlantAssignedTentAlertsPanel";
import PlantAssignedTentActionsPanel from "@/components/PlantAssignedTentActionsPanel";
import PlantStatusStrip from "@/components/PlantStatusStrip";
import { Button } from "@/components/ui/button";
import { useGrowPlant, useGrowTent, getGrowDataMeta } from "@/hooks/useGrowData";
import { format, formatDistanceToNow } from "date-fns";

export default function PlantDetail() {
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
              <Link to="/plants">
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
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/plants"><ArrowLeft className="h-4 w-4" /> Plants</Link></Button>
      <PageHeader title={plant.name} description={plant.strain} icon={<Sprout className="h-5 w-5" />} actions={<StageBadge stage={plant.stage} />} />
      <GrowDataSourceDisclosure
        resource="plant"
        hasAnyData
        metas={[plantMeta, tentMeta]}
        testId="plant-detail-data-source-disclosure"
      />
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 glass rounded-2xl overflow-hidden">
          <div className="aspect-square bg-secondary/40"><img src={plant.photo} alt="" className="w-full h-full object-cover" /></div>
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
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 gap-1" data-testid="plant-detail-view-tent">
                      <Link to={`/tents/${tent.id}`}>
                        <Box className="h-3.5 w-3.5" /> View Tent <ArrowRight className="h-3.5 w-3.5" />
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
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Age</div><div>{ageDays} days</div></div>
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Started</div><div>{format(new Date(plant.startedAt), "PP")}</div></div>
            <div><div className="text-xs text-muted-foreground uppercase tracking-wider">Health</div><div className="capitalize">{plant.health}</div></div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last note</div>
            <p className="text-sm">{plant.lastNote}</p>
            <p className="text-xs text-muted-foreground mt-1">Updated {formatDistanceToNow(new Date(plant.startedAt), { addSuffix: true })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/logs">Open Logs</Link></Button>
            <Button
              asChild
              size="sm"
              className="gradient-leaf text-primary-foreground"
              data-testid="plant-detail-daily-grow-check-entry"
            >
              <Link to={`/daily-check?plantId=${plant.id}`}>Daily Grow Check</Link>
            </Button>
          </div>
          <PlantTentEnvironmentPanel
            tentId={plant.tentId ?? null}
            tentName={tent?.name ?? null}
            plantId={plant.id}
            plantName={plant.name}
            growId={plant.growId ?? null}
          />
          <PlantRecentActivityPanel plantId={plant.id} plantName={plant.name} />
          <PlantAssignedTentAlertsPanel
            tentId={plant.tentId ?? null}
            tentName={tent?.name ?? null}
            growId={plant.growId ?? null}
          />
          <PlantAssignedTentActionsPanel
            tentId={plant.tentId ?? null}
            tentName={tent?.name ?? null}
            growId={plant.growId ?? null}
          />
        </div>
      </div>
    </div>
  );
}
