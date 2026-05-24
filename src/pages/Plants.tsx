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
import PlantCardActionsMenu from "@/components/PlantCardActionsMenu";
import InfoPopover, { HELP_COPY } from "@/components/InfoPopover";
import { Badge } from "@/components/ui/badge";
import { useGrowPlants, useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { plantsPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  filterVisiblePlants,
  getActivePlantCount,
  getArchivedPlantLabel,
  shouldShowArchivedToggle,
  isArchivedPlant,
  isMergedPlant,
} from "@/lib/archivedPlantVisibilityRules";

export default function Plants() {
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const validGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const [showArchived, setShowArchived] = useState(false);
  const { data: activePlants = [] } = useGrowPlants(undefined, urlGrowId ?? undefined);
  const { data: allPlants = [] } = useGrowPlants(
    undefined,
    urlGrowId ?? undefined,
    { includeArchived: true },
  );
  const { data: tents = [] } = useGrowTents(urlGrowId ?? undefined);
  const plantsMeta = getGrowDataMeta(["grow", "plants", "all", urlGrowId ?? "all"]);
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);
  const [tentFilter, setTentFilter] = useState<string>("all");
  const hasArchived = shouldShowArchivedToggle(allPlants);
  const archivedCount = allPlants.filter(
    (p) => isArchivedPlant(p) || isMergedPlant(p),
  ).length;
  const visible = filterVisiblePlants(allPlants, { showArchived });
  const filtered = tentFilter === "all" ? visible : visible.filter((p) => p.tentId === tentFilter);

  // Filter button entries with per-tent counts (respects archived visibility).
  const filterEntries = [
    {
      id: "all",
      name: "All tents",
      count: showArchived ? allPlants.length : getActivePlantCount(allPlants),
    },
    ...tents.map((t) => {
      const inTent = allPlants.filter((p) => p.tentId === t.id);
      const count = showArchived ? inTent.length : getActivePlantCount(inTent);
      return { id: t.id, name: t.name, count };
    }),
  ];

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Plants" section="plants" />
      <PageHeader
        title="Plants"
        description="Every plant you're tracking, across every tent."
        icon={<Sprout className="h-5 w-5" />}
        actions={<CreatePlantDialog defaultGrowId={validGrowId} />}
      />

      {/* Current grow context strip — replaces unclear "selected" state. */}
      <div
        className="mb-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap"
        data-testid="plants-current-grow-strip"
      >
        {urlGrowId ? (
          <span>
            Current grow:{" "}
            <span className="text-foreground font-medium" data-testid="plants-current-grow-name">
              {scopedGrowName ?? "this grow"}
            </span>
          </span>
        ) : (
          <span data-testid="plants-current-grow-empty">
            No grow selected. Showing plants across every grow you can see.
          </span>
        )}
        <InfoPopover
          title="Current grow data"
          body={HELP_COPY.currentGrowData}
          testKey="plants-current-grow-data"
        />
      </div>

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
        hasAnyData={activePlants.length > 0 || allPlants.length > 0}
        metas={[plantsMeta, tentsMeta]}
        testId="plants-data-source-disclosure"
      />

      {/* Contextual help cluster — click/tap popovers, never hover-only. */}
      <div
        className="mb-4 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap"
        data-testid="plants-help-cluster"
      >
        <span className="uppercase tracking-wider">What do these labels mean?</span>
        <InfoPopover
          title="Manual snapshot"
          body={HELP_COPY.manualSnapshot}
          testKey="plants-manual-snapshot"
        />
        <InfoPopover
          title="Live sensor data"
          body={HELP_COPY.liveSensorData}
          testKey="plants-live-sensor-data"
        />
        <InfoPopover
          title="Simulated data"
          body={HELP_COPY.simulatedData}
          testKey="plants-simulated-data"
        />
        <InfoPopover
          title="Stale data"
          body={HELP_COPY.staleData}
          testKey="plants-stale-data"
        />
        <InfoPopover
          title="Mixed data"
          body={HELP_COPY.mixedData}
          testKey="plants-mixed-data"
        />
        <InfoPopover
          title="Archived / merged plants"
          body={HELP_COPY.archivedMergedPlants}
          testKey="plants-archived-merged"
        />
      </div>

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
        {filterEntries.map((t) => (
          <button
            key={t.id}
            onClick={() => setTentFilter(t.id)}
            data-testid={`plants-tent-filter-${t.id}`}
            data-count={t.count}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full border transition",
              tentFilter === t.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/50 border-border/50 hover:bg-secondary",
            )}
          >
            {t.name} ({t.count})
          </button>
        ))}
        {hasArchived && archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            data-testid="plants-show-archived-toggle"
            data-archived-count={archivedCount}
            aria-pressed={showArchived}
            className={cn(
              "ml-auto text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1",
              showArchived
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/50 border-border/50 hover:bg-secondary",
            )}
          >
            <Archive className="h-3 w-3" />
            {showArchived ? `Hide archived (${archivedCount})` : `Show archived (${archivedCount})`}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Sprout className="h-6 w-6" />}
          title="No plants yet"
          description="Add your first plant and assign it to a tent."
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const tent = tents.find((t) => t.id === p.tentId);
            const dot =
              p.health === "healthy"
                ? "bg-[hsl(var(--success))]"
                : p.health === "watch"
                  ? "bg-[hsl(var(--warning))]"
                  : "bg-destructive";
            const archivedLabel = getArchivedPlantLabel(p);
            const isInactive = archivedLabel.kind !== "active";
            return (
              <div key={p.id} className="relative animate-fade-in">
                <Link
                  to={`/plants/${p.id}`}
                  data-testid="plant-card"
                  data-archived={isInactive ? "true" : "false"}
                  data-archived-kind={archivedLabel.kind}
                  className={cn(
                    "glass rounded-2xl overflow-hidden hover:border-primary/50 transition block",
                    isInactive && "opacity-70",
                  )}
                >
                  <PlantPhoto
                    src={p.photo}
                    alt={p.name}
                    className="aspect-[4/3]"
                    caption="No plant photo yet"
                    ctaLabel="Add photo"
                  />
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-1 gap-1 pr-8">
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
                {/* Always-visible Manage menu — never hover-only. */}
                <div
                  className="absolute top-2 right-2 z-10"
                  onClick={(e) => e.stopPropagation()}
                  data-testid="plant-card-manage-slot"
                >
                  <PlantCardActionsMenu
                    plant={{
                      id: p.id,
                      name: p.name,
                      strain: p.strain ?? null,
                      stage: p.stage,
                      health: p.health,
                      startedAt: p.startedAt ?? null,
                      tentId: p.tentId ?? null,
                      growId: p.growId ?? null,
                      lastNote: p.lastNote ?? null,
                      isArchived: p.isArchived ?? false,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
