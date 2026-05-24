import { Link } from "react-router-dom";
import { Sprout, Filter, Archive, GitMerge, Search, CheckCircle2, Circle, ArrowRight, Sparkles, Gauge } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useGrowPlants, useGrowTents, getGrowDataMeta } from "@/hooks/useGrowData";
import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useGrows } from "@/store/grows";
import { useDiaryEntries } from "@/hooks/use-diary-entries";
import { useSensorReadings } from "@/hooks/use-sensor-readings";
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
import {
  buildGrowFilterOptions,
  filterPlantsByGrow,
  filterPlantsBySearch,
  summarizePlantsPageFilters,
  formatPlantsPageFilterSummary,
  plantsPageEmptyStateCopy,
} from "@/lib/plantsPageFilterRules";
import { buildDashboardDailyGrowCheckPanel } from "@/lib/dashboardDailyGrowCheckPanelRules";
import { buildDailyCheckEntryHref } from "@/lib/dailyCheckPostSubmitRules";
import { useNavigate } from "react-router-dom";

export default function Plants() {
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } = useScopedGrow();
  const navigate = useNavigate();
  const { grows } = useGrows();
  const validGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const { data: activePlants = [] } = useGrowPlants(undefined, urlGrowId ?? undefined);
  const { data: allPlants = [] } = useGrowPlants(
    undefined,
    urlGrowId ?? undefined,
    { includeArchived: true },
  );
  // Cross-grow plant list (for grow-filter option counts). Scoped to active
  // (non-archived/merged) plants — the grow filter intentionally only counts
  // plants growers normally work with.
  const { data: allGrowsActivePlants = [] } = useGrowPlants(undefined, undefined);
  const { data: tents = [] } = useGrowTents(urlGrowId ?? undefined);
  const { data: rawDiary = [] } = useDiaryEntries();
  const { data: rawReadings = [] } = useSensorReadings(undefined, 500);
  const plantsMeta = getGrowDataMeta(["grow", "plants", "all", urlGrowId ?? "all"]);
  const tentsMeta = getGrowDataMeta(["grow", "tents", urlGrowId ?? "all"]);
  const [tentFilter, setTentFilter] = useState<string>("all");

  // Daily Grow Check: derive checked-today per plant using the same rules
  // module Dashboard and Plant Detail use. Read-only; never invents state.
  const dailyCheckByPlant = useMemo(() => {
    const panel = buildDashboardDailyGrowCheckPanel({
      now: new Date(),
      scopedGrowId: urlGrowId ?? null,
      plants: allPlants.map((p) => ({
        id: p.id,
        name: p.name,
        tentId: p.tentId,
        growId: (p as { growId?: string | null }).growId ?? null,
        isArchived: p.isArchived,
        lastNote: p.lastNote,
      })),
      tents: tents.map((t) => ({ id: t.id, name: t.name })),
      manualReadings: rawReadings
        .filter((r) => r.source === "manual")
        .map((r) => ({
          ts: r.ts,
          created_at: r.created_at,
          id: r.id,
          tent_id: r.tent_id,
        })),
      diaryEntries: rawDiary.map((e) => ({
        entry_at: e.entry_at,
        created_at: e.created_at,
        id: e.id,
        plant_id: e.plant_id,
        tent_id: e.tent_id,
      })),
    });
    const map = new Map<string, { checkedToday: boolean; methodLabel: string | null }>();
    for (const row of panel.rows)
      map.set(row.plantId, { checkedToday: row.checkedToday, methodLabel: row.methodLabel });
    return map;
  }, [allPlants, tents, rawReadings, rawDiary, urlGrowId]);

  // Grow filter — sourced from the workspace grows list + active plants.
  const growFilterOptions = useMemo(
    () => buildGrowFilterOptions(grows, allGrowsActivePlants),
    [grows, allGrowsActivePlants],
  );

  const hasArchived = shouldShowArchivedToggle(allPlants);
  const archivedCount = allPlants.filter(
    (p) => isArchivedPlant(p) || isMergedPlant(p),
  ).length;

  // Pipeline: archived visibility → grow scope (already in query) →
  // tent tab → plant search. Each step is independent and labeled in the UI.
  const visibleAfterArchive = filterVisiblePlants(allPlants, { showArchived });
  const visibleAfterTent =
    tentFilter === "all"
      ? visibleAfterArchive
      : visibleAfterArchive.filter((p) => p.tentId === tentFilter);
  const filtered = filterPlantsBySearch(visibleAfterTent, search, tents);

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

  // Filter summary — counts only active plants under the current grow scope.
  const summary = summarizePlantsPageFilters(allPlants, {
    selectedGrowId: urlGrowId,
    selectedGrowName: scopedGrowName,
    search,
  });
  const summaryLine = formatPlantsPageFilterSummary(summary);

  const emptyCopy = plantsPageEmptyStateCopy(filtered.length, {
    selectedGrowId: urlGrowId,
    selectedGrowName: scopedGrowName,
    search,
  });

  const handleGrowFilterChange = (value: string) => {
    // "" → All grows (clear scope).
    navigate(value ? plantsPath(value) : plantsPath());
  };

  return (
    <div>
      <GrowBreadcrumbs growId={urlGrowId} growName={scopedGrowName} current="Plants" section="plants" />
      <PageHeader
        title="Plants"
        description="Every plant you're tracking, across every tent."
        icon={<Sprout className="h-5 w-5" />}
        actions={<CreatePlantDialog defaultGrowId={validGrowId} />}
      />

      {/* Grow filter + plant search row — the two controls are deliberately
          labeled separately so the grow filter is not mistaken for a plant
          picker. */}
      <div
        className="mb-3 grid gap-3 sm:grid-cols-2"
        data-testid="plants-filter-controls"
      >
        <div data-testid="plants-grow-filter">
          <label
            htmlFor="plants-grow-filter-select"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
          >
            Filter by grow
            <InfoPopover
              title="Filter by grow"
              body="Use this to filter plants by grow. Choose 'All grows' to show every plant you can see."
              testKey="plants-grow-filter"
            />
          </label>
          <select
            id="plants-grow-filter-select"
            data-testid="plants-grow-filter-select"
            aria-label="Filter plants by grow"
            value={urlGrowId ?? ""}
            onChange={(e) => handleGrowFilterChange(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {growFilterOptions.map((o) => (
              <option
                key={o.id || "__all__"}
                value={o.id}
                data-testid={`plants-grow-filter-option-${o.id || "all"}`}
                data-plant-count={o.plantCount}
              >
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div data-testid="plants-search">
          <label
            htmlFor="plants-search-input"
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground mb-1"
          >
            Search plants
            <InfoPopover
              title="Search plants"
              body="Search visible plants by name, strain, or tent. This does not change which grow is selected."
              testKey="plants-search"
            />
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="plants-search-input"
              data-testid="plants-search-input"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plants by name, strain, or tent…"
              className="h-9 pl-8 text-sm"
              aria-label="Search plants by name, strain, or tent"
            />
          </div>
        </div>
      </div>

      {/* Current grow context strip — explains exactly what is shown. */}
      <div
        className="mb-3 flex items-center gap-2 text-xs text-muted-foreground flex-wrap"
        data-testid="plants-current-grow-strip"
      >
        <span data-testid="plants-filter-summary">{summaryLine}</span>
        {summary.archivedHiddenCount > 0 && !showArchived && (
          <span
            className="text-muted-foreground/80"
            data-testid="plants-archived-hidden-note"
          >
            · {summary.archivedHiddenCount} archived/merged hidden
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
          title={emptyCopy ?? "No plants yet"}
          description={
            search.trim()
              ? "Try a different name, strain, or tent."
              : urlGrowId
                ? "Add your first plant to this grow."
                : "Add your first plant and assign it to a tent."
          }
        />
      ) : (
        <div
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          data-testid="plants-grid"
          data-visible-count={filtered.length}
        >
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
            const dailyCheckEntry = dailyCheckByPlant.get(p.id);
            const checkedToday = !isInactive && dailyCheckEntry?.checkedToday === true;
            const showDailyCheckBadge = !isInactive && dailyCheckByPlant.has(p.id);
            const methodLabel = checkedToday ? dailyCheckEntry?.methodLabel ?? null : null;
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
                    {showDailyCheckBadge && (
                      <div
                        className="mt-2 flex items-center justify-between gap-2"
                        data-testid="plant-card-daily-check-row"
                        data-plant-id={p.id}
                        data-checked-today={checkedToday ? "1" : "0"}
                      >
                        <Badge
                          variant="outline"
                          data-testid="plant-card-daily-check-badge"
                          data-state={checkedToday ? "checked" : "needs"}
                          className={cn(
                            "text-[10px] gap-1",
                            checkedToday
                              ? "border-emerald-500/40 text-emerald-300"
                              : "border-amber-500/40 text-amber-300",
                          )}
                        >
                          {checkedToday ? (
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <Circle className="h-3 w-3" aria-hidden="true" />
                          )}
                          {checkedToday ? "Checked today" : "Needs check"}
                        </Badge>
                        {checkedToday && methodLabel && (
                          <span
                            className="text-[10px] text-muted-foreground truncate"
                            data-testid="plant-card-daily-check-method"
                          >
                            {methodLabel}
                          </span>
                        )}
                      </div>
                    )}
                    {showDailyCheckBadge && !checkedToday && (
                      <div
                        className="mt-2 flex flex-wrap items-center gap-1.5"
                        data-testid="plant-card-daily-check-actions"
                        data-plant-id={p.id}
                      >
                        <Link
                          to={buildDailyCheckEntryHref({ plantId: p.id, source: "plants", method: "note" })}
                          data-testid="plant-card-daily-check-action-note"
                          data-method="note"
                          aria-label={`Add note for ${p.name}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/40 text-[10px] px-2 py-1 hover:bg-accent transition"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" /> Add note
                        </Link>
                        <Link
                          to={buildDailyCheckEntryHref({ plantId: p.id, source: "plants", method: "sensor" })}
                          data-testid="plant-card-daily-check-action-sensor"
                          data-method="sensor"
                          aria-label={`Add sensor snapshot for ${p.name}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/40 text-[10px] px-2 py-1 hover:bg-accent transition"
                        >
                          <Gauge className="h-3 w-3" aria-hidden="true" /> Add sensor snapshot
                        </Link>
                      </div>
                    )}
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
                {showDailyCheckBadge && !checkedToday && (
                  <Link
                    to={`/daily-check?plantId=${p.id}&from=plants`}
                    data-testid="plant-card-daily-check-cta"
                    data-plant-id={p.id}
                    aria-label={`Start today's check for ${p.name}`}
                    className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground text-[11px] px-2.5 py-1 hover:bg-primary/90 transition"
                  >
                    Start check <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
