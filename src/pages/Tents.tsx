import { Link } from "react-router-dom";
import { Box, Lightbulb } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import MetricChip from "@/components/MetricChip";
import EmptyState from "@/components/EmptyState";
import CreateTentDialog from "@/components/CreateTentDialog";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { useSensorReadings, usePlants } from "@/hooks/useMockData";
import { useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { tentsPath } from "@/lib/routes";
import { tempFFromC } from "@/lib/temperatureUnits";

export default function Tents() {
  // Shared URL `?growId=` resolution against RLS-loaded grows.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const validGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const { data: tents = [], isLoading } = useGrowTents(urlGrowId ?? undefined);
  const { data: readings = [] } = useSensorReadings();
  const { data: plants = [] } = usePlants();
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Tents" section="tents" />
      <PageHeader
        title="Tents"
        description="Your grow tents — environment, lighting, and assigned plants."
        icon={<Box className="h-5 w-5" />}
        actions={<CreateTentDialog defaultGrowId={validGrowId} />}
      />

      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="tents"
          clearHref={tentsPath()}
          backHref={backHref}
        />
      )}

      <GrowDataSourceDisclosure
        resource="tents"
        hasAnyData={tents.length > 0}
        metas={[tentsMeta]}
        testId="tents-data-source-disclosure"
      />


      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="glass rounded-2xl h-48 animate-pulse" />)}
        </div>
      ) : tents.length === 0 ? (
        <EmptyState icon={<Box className="h-6 w-6" />} title="No tents yet" description="Set up your first tent to start tracking." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tents.map((t) => {
            const last = readings.filter((r) => r.tentId === t.id).at(-1);
            const plantCount = plants.filter((p) => p.tentId === t.id).length;
            return (
              <Link key={t.id} to={`/tents/${t.id}`} className="glass rounded-2xl p-5 hover:border-primary/50 transition group flex flex-col gap-3 animate-fade-in">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold group-hover:text-primary transition">{t.name}</h3>
                    <p className="text-xs text-muted-foreground">{t.brand} · {t.size}</p>
                  </div>
                  <StageBadge stage={t.stage} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {last && <MetricChip label="T" value={last.temp} unit="°C" status={last.temp > 28 || last.temp < 19 ? "warn" : "ok"} />}
                  {last && <MetricChip label="RH" value={last.rh} unit="%" status={last.rh > 65 || last.rh < 35 ? "warn" : "ok"} />}
                  {last && <MetricChip label="VPD" value={last.vpd} unit=" kPa" status={last.vpd > 1.6 || last.vpd < 0.6 ? "warn" : "ok"} />}
                </div>

                <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                  <span>{plantCount} plants</span>
                  <span className="inline-flex items-center gap-1">
                    <Lightbulb className={`h-3 w-3 ${t.light.on ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}`} />
                    {t.light.on ? `On · ${t.light.schedule}` : "Off"}
                  </span>
                  {t.alertCount > 0 ? <span className="text-destructive">● {t.alertCount} alert{t.alertCount > 1 ? "s" : ""}</span> : <span className="text-[hsl(var(--success))]">● healthy</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
