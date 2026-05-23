import { useParams, Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import SensorChart from "@/components/SensorChart";
import EmptyState from "@/components/EmptyState";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Box, Lightbulb, Plus } from "lucide-react";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import AddExistingPlantDialog from "@/components/AddExistingPlantDialog";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
import { useGrowTent, useGrowPlants, getGrowDataMeta } from "@/hooks/useGrowData";
import {
  buildTentSensorChartSeries,
  buildTentSensorHeaderView,
} from "@/lib/tentSensorChartRules";

export default function TentDetail() {
  const { id } = useParams();
  const { data: tent, isLoading } = useGrowTent(id);
  const { data: plants = [] } = useGrowPlants(id);
  const { data: readings = [] } = useSensorReadings(id);
  const series = buildTentSensorChartSeries(readings);
  const header = buildTentSensorHeaderView(readings);
  const snap = header.snapshot;
  const tentMeta = getGrowDataMeta(["grow", "tent", id ?? null]);

  if (isLoading) return <div className="glass rounded-2xl h-64 animate-pulse" />;
  if (!tent) {
    return (
      <div>
        <GrowDataSourceDisclosure
          resource="tents"
          hasAnyData={false}
          metas={[tentMeta]}
          testId="tent-detail-data-source-disclosure"
        />
        <EmptyState
          icon={<Box className="h-6 w-6" />}
          title="Tent not found"
          description="This tent isn't in your tracked tents yet."
          action={
            <Button asChild variant="outline">
              <Link to="/tents">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/tents"><ArrowLeft className="h-4 w-4" /> Tents</Link></Button>
      <PageHeader
        title={tent.name}
        description={`${tent.brand} · ${tent.size}`}
        icon={<Box className="h-5 w-5" />}
        actions={<StageBadge stage={tent.stage} />}
      />

      <GrowDataSourceDisclosure
        resource="tent"
        hasAnyData
        metas={[tentMeta]}
        testId="tent-detail-data-source-disclosure"
      />

      <div className="flex flex-wrap gap-2 mb-5" data-testid="tent-detail-metric-chips">
        {snap?.temp !== null && snap?.temp !== undefined && (
          <MetricChip label="T" value={snap.temp} unit="°C" status={snap.temp > 28 || snap.temp < 19 ? "warn" : "ok"} />
        )}
        {snap?.rh !== null && snap?.rh !== undefined && (
          <MetricChip label="RH" value={snap.rh} unit="%" status={snap.rh > 65 || snap.rh < 35 ? "warn" : "ok"} />
        )}
        {snap?.vpd !== null && snap?.vpd !== undefined && (
          <MetricChip label="VPD" value={snap.vpd} unit=" kPa" status={snap.vpd > 1.6 || snap.vpd < 0.6 ? "warn" : "ok"} />
        )}
        {snap?.co2 !== null && snap?.co2 !== undefined && (
          <MetricChip label="CO₂" value={snap.co2} unit=" ppm" />
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lightbulb className={`h-3.5 w-3.5 ${tent.light.on ? "text-[hsl(var(--warning))]" : ""}`} />
          {tent.light.schedule} · {tent.light.wattage}W
        </span>
      </div>

      <div className="glass rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-display font-semibold">Environment</h2>
          {header.hasReadings && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {header.capturedAt && (
                <span data-testid="tent-detail-sensor-captured">
                  Captured {formatDistanceToNow(new Date(header.capturedAt), { addSuffix: true })}
                </span>
              )}
              {header.sourceLabel && (
                <span
                  className="rounded-md border px-1.5 py-0.5"
                  data-testid="tent-detail-sensor-source"
                >
                  {header.sourceLabel}
                </span>
              )}
              {header.stale && (
                <span
                  className="rounded-md border border-[hsl(var(--warning))] px-1.5 py-0.5 text-[hsl(var(--warning))]"
                  data-testid="tent-detail-sensor-stale"
                >
                  Stale
                </span>
              )}
            </div>
          )}
        </div>
        {series.length === 0 ? (
          <p
            className="text-sm text-muted-foreground py-6 text-center"
            data-testid="tent-detail-sensor-empty"
          >
            No sensor readings yet.
          </p>
        ) : (
          <SensorChart data={series as unknown as Parameters<typeof SensorChart>[0]["data"]} metric="temp" height={200} />
        )}
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display font-semibold">Plants in this tent ({plants.length})</h2>
          <div className="flex flex-wrap gap-2">
            <AddExistingPlantDialog
              tentId={id ?? ""}
              growId={tent.growId ?? null}
            />
            <CreatePlantDialog
              defaultTentId={id}
              defaultGrowId={tent.growId ?? undefined}
              trigger={
                <Button size="sm" className="gradient-leaf text-primary-foreground gap-1">
                  <Plus className="h-4 w-4" /> Add Plant to This Tent
                </Button>
              }
            />
          </div>
        </div>
        {plants.length === 0 ? (
          <div
            className="flex flex-col items-start gap-3 py-4"
            data-testid="tent-detail-plants-empty"
          >
            <p className="text-sm text-muted-foreground">
              No plants in this tent yet.
            </p>
            <div className="flex flex-wrap gap-2">
              <AddExistingPlantDialog
                tentId={id ?? ""}
                growId={tent.growId ?? null}
                trigger={
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    data-testid="tent-detail-empty-add-existing-plant"
                  >
                    Add Existing Plant
                  </Button>
                }
              />
              <CreatePlantDialog
                defaultTentId={id}
                defaultGrowId={tent.growId ?? undefined}
                trigger={
                  <Button
                    size="sm"
                    className="gradient-leaf text-primary-foreground gap-1"
                    data-testid="tent-detail-empty-add-plant"
                  >
                    <Plus className="h-4 w-4" /> Add Plant to This Tent
                  </Button>
                }
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="tent-detail-plants-grid">
            {plants.map((p) => (
              <Link
                key={p.id}
                to={`/plants/${p.id}`}
                className="rounded-xl border border-border/40 overflow-hidden hover:border-primary/50 transition"
                data-testid="tent-detail-plant-card"
              >
                <div className="aspect-video bg-secondary/40"><img src={p.photo} alt="" className="w-full h-full object-cover" /></div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm" data-testid="tent-detail-plant-name">{p.name}</span>
                    <StageBadge stage={p.stage} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5" data-testid="tent-detail-plant-strain">{p.strain}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
