import { useParams, Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import SensorChart from "@/components/SensorChart";
import EmptyState from "@/components/EmptyState";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Box, Lightbulb, Plus } from "lucide-react";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import { usePlants, useSensorReadings, useCameras } from "@/hooks/useMockData";
import { useGrowTent, getGrowDataMeta, type GrowDataSourceMeta } from "@/hooks/useGrowData";

// Plants, sensor readings, and cameras inside this page still come from the
// useMockData hooks (Phase 1 has not migrated them yet). Surface that as
// explicit demo metadata so the disclosure honestly reports Mixed/Demo.
const DEMO_SUBDATA_META: GrowDataSourceMeta = {
  isDemoData: true,
  dataSource: "mock",
  sourceReason: "tent-detail:subdata-mock",
};

export default function TentDetail() {
  const { id } = useParams();
  const { data: tent, isLoading } = useGrowTent(id);
  const { data: plants = [] } = usePlants(id);
  const { data: readings = [] } = useSensorReadings(id);
  const { data: cameras = [] } = useCameras();
  const cam = cameras.find((c) => c.tentId === id);
  const last = readings.at(-1);
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
          description="This tent does not exist in your real grow data."
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
        metas={[tentMeta, DEMO_SUBDATA_META]}
        testId="tent-detail-data-source-disclosure"
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {last && <MetricChip label="T" value={last.temp} unit="°C" status={last.temp > 28 || last.temp < 19 ? "warn" : "ok"} />}
        {last && <MetricChip label="RH" value={last.rh} unit="%" status={last.rh > 65 || last.rh < 35 ? "warn" : "ok"} />}
        {last && <MetricChip label="VPD" value={last.vpd} unit=" kPa" status={last.vpd > 1.6 || last.vpd < 0.6 ? "warn" : "ok"} />}
        {last && <MetricChip label="CO₂" value={last.co2} unit=" ppm" />}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Lightbulb className={`h-3.5 w-3.5 ${tent.light.on ? "text-[hsl(var(--warning))]" : ""}`} />
          {tent.light.schedule} · {tent.light.wattage}W
        </span>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 glass rounded-2xl p-4">
          <h2 className="font-display font-semibold mb-3">Environment · 7 days</h2>
          <SensorChart data={readings} metric="temp" height={200} />
        </div>
        <div className="glass rounded-2xl p-4">
          <h2 className="font-display font-semibold mb-3">Camera</h2>
          {cam ? (
            <Link to={`/cameras/${cam.id}`} className="block aspect-video rounded-xl overflow-hidden border border-border/40">
              <img src={cam.thumbnail} alt={cam.name} className="w-full h-full object-cover" />
            </Link>
          ) : <p className="text-sm text-muted-foreground">No camera assigned.</p>}
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="font-display font-semibold">Plants in this tent ({plants.length})</h2>
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
        {plants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No plants in this tent yet. Add Plant.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plants.map((p) => (
              <Link key={p.id} to={`/plants/${p.id}`} className="rounded-xl border border-border/40 overflow-hidden hover:border-primary/50 transition">
                <div className="aspect-video bg-secondary/40"><img src={p.photo} alt="" className="w-full h-full object-cover" /></div>
                <div className="p-3">
                  <div className="flex items-center justify-between"><span className="font-medium text-sm">{p.name}</span><StageBadge stage={p.stage} /></div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.strain}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
