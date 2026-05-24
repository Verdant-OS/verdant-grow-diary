import { Link } from "react-router-dom";
import { Sprout, Filter, Archive, GitMerge } from "lucide-react";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import StageBadge from "@/components/StageBadge";
import EmptyState from "@/components/EmptyState";
import CreatePlantDialog from "@/components/CreatePlantDialog";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import GrowDataSourceDisclosure from "@/components/GrowDataSourceDisclosure";
import PlantPhoto from "@/components/PlantPhoto";
import { Badge } from "@/components/ui/badge";
import { useGrowPlants, useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { plantsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  filterVisiblePlants,
  getArchivedPlantLabel,
  shouldShowArchivedToggle,
} from "@/lib/archivedPlantVisibilityRules";

export default function Plants() {
  // Shared URL `?growId=` resolution against RLS-loaded grows.
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const validGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const [showArchived, setShowArchived] = useState(false);
  // Active plants drive default UX + data-source meta lookups.
  const { data: activePlants = [] } = useGrowPlants(undefined, urlGrowId ?? undefined);
  // Archived plants are loaded separately so we can show the toggle when
  // any exist and surface them when the grower opts in.
  const { data: allPlants = [] } = useGrowPlants(
    undefined,
    urlGrowId ?? undefined,
    { includeArchived: true },
  );
  // Real tent records (Supabase-backed with documented mock fallback) drive
  // filter labels so demo tents never masquerade as live filter chips.
  const { data: tents = [] } = useGrowTents(urlGrowId ?? undefined);
  const plantsMeta = getGrowDataMeta(["grow", "plants", "all", urlGrowId ?? "all"]);
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);
  const [tentFilter, setTentFilter] = useState<string>("all");
  const hasArchived = shouldShowArchivedToggle(allPlants);
  const visible = filterVisiblePlants(allPlants, { showArchived });
  const filtered = tentFilter === "all" ? visible : visible.filter((p) => p.tentId === tentFilter);

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Plants" section="plants" />
      <PageHeader title="Plants" description="Every plant you're tracking, across every tent." icon={<Sprout className="h-5 w-5" />} actions={<CreatePlantDialog defaultGrowId={validGrowId} />} />
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
        {hasArchived && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            data-testid="plants-show-archived-toggle"
            aria-pressed={showArchived}
            className={cn(
              "ml-auto text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1",
              showArchived
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/50 border-border/50 hover:bg-secondary",
            )}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        )}
      </div>
      {filtered.length === 0 ? <EmptyState icon={<Sprout className="h-6 w-6" />} title="No plants yet" description="Add your first plant and assign it to a tent." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const tent = tents.find((t) => t.id === p.tentId);
            const dot = p.health === "healthy" ? "bg-[hsl(var(--success))]" : p.health === "watch" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
            const archivedLabel = getArchivedPlantLabel(p);
            const isInactive = archivedLabel.kind !== "active";
            return (
              <Link
                key={p.id}
                to={`/plants/${p.id}`}
                data-testid="plant-card"
                data-archived={isInactive ? "true" : "false"}
                data-archived-kind={archivedLabel.kind}
                className={cn(
                  "glass rounded-2xl overflow-hidden hover:border-primary/50 transition animate-fade-in",
                  isInactive && "opacity-70",
                )}
              >
                <PlantPhoto src={p.photo} alt={p.name} className="aspect-[4/3]" caption="No plant photo yet" />
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1 gap-1">
                    <span className="font-medium text-sm truncate">{p.name}</span>
                    <StageBadge stage={p.stage} />
                  </div>
                  <p className="text-xs text-muted-foreground">{p.strain}</p>
                  {isInactive && (
                    <Badge
                      variant="outline"
                      data-testid="plant-card-archived-badge"
                      data-archived-kind={archivedLabel.kind}
                      className="mt-1.5 text-[10px] gap-1 border-amber-500/40 text-amber-300"
                    >
                      {archivedLabel.kind === "merged" ? (
                        <GitMerge className="h-3 w-3" />
                      ) : (
                        <Archive className="h-3 w-3" />
                      )}
                      {archivedLabel.kind === "merged" ? "Merged / Archived" : "Archived"}
                    </Badge>
                  )}
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
