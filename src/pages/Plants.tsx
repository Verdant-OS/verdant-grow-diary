import { Link } from "react-router-dom";
import { Sprout, Filter } from "lucide-react";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import EmptyState from "@/components/EmptyState";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import { useGrowPlants, useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { plantsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export default function Plants() {
  // Shared URL `?growId=` resolution against RLS-loaded grows.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const validGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const { data: plants = [] } = useGrowPlants(undefined, urlGrowId ?? undefined);
  // Real tent records (Supabase-backed with documented mock fallback) drive
  // filter labels so demo tents never masquerade as live filter chips.
  const { data: tents = [] } = useGrowTents(urlGrowId ?? undefined);
  const plantsMeta = getGrowDataMeta(["grow", "plants", "all", urlGrowId ?? "all"]);
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);
  const [tentFilter, setTentFilter] = useState<string>("all");
  const filtered = tentFilter === "all" ? plants : plants.filter((p) => p.tentId === tentFilter);

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Plants" section="plants" />
      <PageHeader title="Plants" description="Every plant across every tent." icon={<Sprout className="h-5 w-5" />} actions={<CreatePlantDialog defaultGrowId={validGrowId} />} />
      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="plants"
          clearHref={plantsPath()}
          backHref={backHref}
        />
      )}
      <GrowDataSourceDisclosure
        resource="plants"
        hasAnyData={plants.length > 0}
        metas={[plantsMeta, tentsMeta]}
        testId="plants-data-source-disclosure"
      />
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {[{ id: "all", name: "All tents" }, ...tents.map((t) => ({ id: t.id, name: t.name }))].map((t) => (
          <button key={t.id} onClick={() => setTentFilter(t.id)}
            className={cn("text-xs px-2.5 py-1 rounded-full border transition", tentFilter === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 border-border/50 hover:bg-secondary")}>
            {t.name}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState icon={<Sprout className="h-6 w-6" />} title="No plants" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const tent = tents.find((t) => t.id === p.tentId);
            const dot = p.health === "healthy" ? "bg-[hsl(var(--success))]" : p.health === "watch" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
            return (
              <Link key={p.id} to={`/plants/${p.id}`} className="glass rounded-2xl overflow-hidden hover:border-primary/50 transition animate-fade-in">
                <div className="aspect-[4/3] bg-secondary/40"><img src={p.photo} alt="" className="w-full h-full object-cover" /></div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1"><span className="font-medium text-sm">{p.name}</span><StageBadge stage={p.stage} /></div>
                  <p className="text-xs text-muted-foreground">{p.strain}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
                    <span className="capitalize">{p.health}</span>
                    {tent && <span>· {tent.name}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
