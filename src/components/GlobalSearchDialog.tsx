/**
 * GlobalSearchDialog — the ONE command palette for Verdant discovery.
 *
 * Private owner-scoped grows / tents / plants come from the RLS-enforced
 * public.verdant_search RPC; public cultivar references come from the bundled
 * Strain Reference Library V1 constants. Both are merged by useGlobalSearch into
 * one deterministic result model and rendered here as distinct groups.
 *
 * cmdk's built-in client-side filter is disabled (shouldFilter={false}) so
 * results render in exactly the deterministic order the hook returns
 * (rank → group → score → label). A private RPC failure surfaces an inline
 * notice and never presents "no matches" as a verified empty conclusion.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { AlertTriangle, Clock, Dna, Leaf, NotebookPen, Plus, RefreshCw, SearchX, Sprout, Tent, X } from "lucide-react";
import {
  deriveSelectionContextFromPathname,
  resolveFastAddIntent,
  type FastAddActionId,
} from "@/lib/fastAddActionRules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  useGlobalSearch,
  type GlobalSearchEntityType,
  type GlobalSearchResult,
} from "@/hooks/useGlobalSearch";
import { growDetailPath, plantDetailPath, tentDetailPath } from "@/lib/routes";
import { highlightMatch } from "@/lib/highlightMatch";
import {
  clearRecentSearches,
  pushRecentSearch,
  readRecentSearches,
} from "@/lib/recentGlobalSearches";
import {
  DEFAULT_FILTERS,
  readGlobalSearchSession,
  writeGlobalSearchSession,
  clearGlobalSearchSession,
  readGlobalSearchHistory,
  pushGlobalSearchHistory,
  clearGlobalSearchHistory,
  readGlobalSearchLastSelected,
  writeGlobalSearchLastSelected,
  clearGlobalSearchLastSelected,
  type GlobalSearchHistoryEntry,
  type GlobalSearchLastSelected,
} from "@/lib/globalSearchSession";
import GlobalSearchResultPreview from "@/components/GlobalSearchResultPreview";



interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER: GlobalSearchEntityType[] = ["grow", "tent", "plant", "cultivar"];
const GROUP_HEADINGS: Record<GlobalSearchEntityType, string> = {
  grow: "Grows",
  tent: "Tents",
  plant: "Plants",
  cultivar: "Cultivars",
};
const GROUP_ICONS: Record<GlobalSearchEntityType, typeof Sprout> = {
  grow: Sprout,
  tent: Tent,
  plant: Leaf,
  cultivar: Dna,
};

function routeFor(row: GlobalSearchResult): string {
  switch (row.entity_type) {
    case "grow":
      return growDetailPath(row.id);
    case "tent":
      return tentDetailPath(row.id);
    case "plant":
      return plantDetailPath(row.id);
    case "cultivar":
      // Public bundled cultivar reference — never a private plant link.
      return `/cultivars/${row.id}`;
  }
}

const INITIAL_VISIBLE = 10;
const PAGE_SIZE = 10;

export default function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  // Best-effort current-context derivation so empty-state "Create" buttons can
  // prefill the Quick Log form with the plant/tent the grower is looking at.
  // Returns null on routes like /dashboard where no plant/tent segment matches.
  const createContext = useMemo(
    () => deriveSelectionContextFromPathname(location.pathname),
    [location.pathname],
  );
  // Lazy initializers hydrate from sessionStorage exactly once so reopening
  // the palette within the same tab resumes the last query + filter toggles.
  const [query, setQuery] = useState<string>(
    () => readGlobalSearchSession().query,
  );
  const [recent, setRecent] = useState<string[]>([]);
  const [history, setHistory] = useState<GlobalSearchHistoryEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [previewRow, setPreviewRow] = useState<GlobalSearchResult | null>(null);
  const [lastSelected, setLastSelected] = useState<GlobalSearchLastSelected | null>(
    () => readGlobalSearchLastSelected(),
  );
  const [enabledTypes, setEnabledTypes] = useState<
    Record<GlobalSearchEntityType, boolean>
  >(() => readGlobalSearchSession().filters);
  const { results, isLoading, isError, retry } = useGlobalSearch(query);

  useEffect(() => {
    if (open) {
      setRecent(readRecentSearches());
      setHistory(readGlobalSearchHistory());
      // Re-hydrate on open in case another tab / dialog instance updated it.
      const restored = readGlobalSearchSession();
      setQuery(restored.query);
      setEnabledTypes(restored.filters);
      setLastSelected(readGlobalSearchLastSelected());
    }
    // Intentionally do NOT clear query/filters on close — session memory is
    // the whole point of this hook.
  }, [open]);

  // Persist query + filters whenever they change so the next open resumes.
  useEffect(() => {
    writeGlobalSearchSession({ query, filters: enabledTypes });
  }, [query, enabledTypes]);

  // Debounced push to session history: capture stable {query, filters} tuples
  // (≥2 chars) so re-running a prior search is one click. Selecting a result
  // also pushes immediately (in handleSelectResult).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timeout = setTimeout(() => {
      setHistory(pushGlobalSearchHistory({ query: q, filters: enabledTypes }));
    }, 600);
    return () => clearTimeout(timeout);
  }, [query, enabledTypes]);


  const filteredResults = useMemo(
    () => results.filter((row) => enabledTypes[row.entity_type]),
    [results, enabledTypes],
  );

  // Reset pagination whenever the query, filters, or new results arrive.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, results, enabledTypes]);

  const visibleResults = useMemo(
    () => filteredResults.slice(0, visibleCount),
    [filteredResults, visibleCount],
  );

  // Keep the preview panel in sync: prefer the last-selected row (if still
  // visible), otherwise keep the current selection, otherwise fall back to the
  // first visible result. Clear when nothing is visible.
  useEffect(() => {
    if (visibleResults.length === 0) {
      setPreviewRow(null);
      return;
    }
    setPreviewRow((prev) => {
      if (prev && visibleResults.some((r) => r.id === prev.id && r.entity_type === prev.entity_type)) {
        return prev;
      }
      if (lastSelected) {
        const restored = visibleResults.find(
          (r) => r.id === lastSelected.id && r.entity_type === lastSelected.entity_type,
        );
        if (restored) return restored;
      }
      return visibleResults[0];
    });
  }, [visibleResults, lastSelected]);

  // Persist the row the user is previewing so reopening the palette restores
  // it. Only writes when the preview is a real row the user is actively
  // considering — never overwrites with null on unmount.
  useEffect(() => {
    if (!previewRow) return;
    const entry = { entity_type: previewRow.entity_type, id: previewRow.id };
    writeGlobalSearchLastSelected(entry);
    setLastSelected({ ...entry, ts: Date.now() });
  }, [previewRow]);



  const grouped = useMemo(() => {
    const map: Record<GlobalSearchEntityType, GlobalSearchResult[]> = {
      grow: [],
      tent: [],
      plant: [],
      cultivar: [],
    };
    // Preserve the hook's deterministic order within each entity_type.
    for (const row of visibleResults) {
      map[row.entity_type]?.push(row);
    }
    return map;
  }, [visibleResults]);

  const totalsByGroup = useMemo(() => {
    const map: Record<GlobalSearchEntityType, number> = {
      grow: 0,
      tent: 0,
      plant: 0,
      cultivar: 0,
    };
    for (const row of results) map[row.entity_type] += 1;
    return map;
  }, [results]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasAny = results.length > 0;
  const hasFilteredAny = filteredResults.length > 0;
  const shownCount = visibleResults.length;
  const remaining = Math.max(0, filteredResults.length - shownCount);
  const canShowMore = remaining > 0;
  const enabledCount = GROUP_ORDER.filter((t) => enabledTypes[t]).length;
  const allEnabled = enabledCount === GROUP_ORDER.length;

  const toggleType = (t: GlobalSearchEntityType) => {
    setEnabledTypes((prev) => {
      const next = { ...prev, [t]: !prev[t] };
      // Guard: never let the user disable every category — reset to all-on.
      const anyOn = GROUP_ORDER.some((k) => next[k]);
      if (!anyOn) {
        return { ...DEFAULT_FILTERS };
      }
      return next;
    });
  };

  const resetFilters = () =>
    setEnabledTypes({ ...DEFAULT_FILTERS });


  const handleSelectResult = (row: GlobalSearchResult) => {
    if (trimmed) {
      setRecent(pushRecentSearch(trimmed));
      setHistory(pushGlobalSearchHistory({ query: trimmed, filters: enabledTypes }));
    }
    const entry = { entity_type: row.entity_type, id: row.id };
    writeGlobalSearchLastSelected(entry);
    setLastSelected({ ...entry, ts: Date.now() });
    onOpenChange(false);
    navigate(routeFor(row));
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecent([]);
  };

  const handleReplayHistory = (entry: GlobalSearchHistoryEntry) => {
    setEnabledTypes({ ...entry.filters });
    setQuery(entry.query);
    // Bump this entry to the top so repeated replays keep it fresh.
    setHistory(pushGlobalSearchHistory({ query: entry.query, filters: entry.filters }));
  };

  const handleClearHistory = () => {
    clearGlobalSearchHistory();
    setHistory([]);
  };

  // Nuke everything the palette remembers for this session: resumed
  // query + filter toggles (sessionStorage), replayable history entries,
  // and the localStorage "recent searches" list. Also resets the live UI
  // state back to defaults so the user sees a clean slate immediately.
  const handleClearAllSearchState = () => {
    clearGlobalSearchSession();
    clearGlobalSearchHistory();
    clearRecentSearches();
    clearGlobalSearchLastSelected();
    setHistory([]);
    setRecent([]);
    setLastSelected(null);
    setPreviewRow(null);
    setQuery("");
    setEnabledTypes({ ...DEFAULT_FILTERS });
  };


  // Value-key used by cmdk for both list-item identity and the highlighted
  // (keyboard-active) selection reported via CommandPrimitive#onValueChange.
  const rowKey = (row: GlobalSearchResult) => `${row.entity_type}:${row.id}`;
  const rowByKey = useMemo(() => {
    const map = new Map<string, GlobalSearchResult>();
    for (const row of visibleResults) map.set(rowKey(row), row);
    return map;
  }, [visibleResults]);
  const activeValue = previewRow ? rowKey(previewRow) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg md:max-w-3xl">
        <CommandPrimitive
          shouldFilter={false}
          value={activeValue}
          onValueChange={(next) => {
            const row = rowByKey.get(next);
            if (row) setPreviewRow(row);
          }}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
        >
          <div className="relative">
            <CommandInput
              placeholder="Search your grows, tents, plants, and cultivars…"
              value={query}
              onValueChange={setQuery}
              onKeyDown={(event) => {
                // Esc clears a non-empty query first; a second Esc closes the dialog.
                if (event.key === "Escape" && trimmed.length > 0) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
                  return;
                }
                // Mod+Backspace wipes the whole query in one shot.
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === "Backspace" &&
                  trimmed.length > 0
                ) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              className={hasQuery ? "pr-9" : undefined}
              data-testid="global-search-input"
            />
            {hasQuery ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search (Esc)"
                title="Clear search (Esc)"
                data-testid="global-search-clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {hasQuery && !isLoading && hasAny ? (
            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              role="group"
              aria-label="Result summary and category filters"
              data-testid="global-search-result-count"
            >
              <span
                className="text-sm font-semibold text-foreground tabular-nums"
                aria-live="polite"
              >
                {filteredResults.length}{" "}
                {filteredResults.length === 1 ? "result" : "results"}
                {!allEnabled && filteredResults.length !== results.length ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    of {results.length}
                  </span>
                ) : null}
              </span>
              {hasFilteredAny ? (
                <span className="tabular-nums">
                  Showing 1–{shownCount} of {filteredResults.length}
                </span>
              ) : null}
              {!allEnabled ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-sm px-1.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="global-search-filters-reset"
                >
                  Show all
                </button>
              ) : null}
              <span
                className="ml-auto flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Filter results by category"
              >
                {GROUP_ORDER.map((t) => {
                  const Icon = GROUP_ICONS[t];
                  const total = totalsByGroup[t];
                  const isOn = enabledTypes[t];
                  const isDisabled = total === 0;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="switch"
                      aria-checked={isOn}
                      aria-label={`${GROUP_HEADINGS[t]} (${total}) — ${isOn ? "shown" : "hidden"}`}
                      onClick={() => toggleType(t)}
                      disabled={isDisabled}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isOn
                          ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
                          : "border-border bg-background text-muted-foreground line-through opacity-70 hover:opacity-100",
                        isDisabled && "cursor-not-allowed opacity-40 hover:opacity-40",
                      )}
                      data-testid={`global-search-filter-${t}`}
                      data-state={isOn ? "on" : "off"}
                    >
                      <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="tabular-nums">{total}</span>
                      <span className="text-muted-foreground">{GROUP_HEADINGS[t]}</span>
                    </button>
                  );
                })}
              </span>
            </div>
          ) : null}


          <div className="flex min-h-0 flex-1">
            <CommandList className="flex-1">

            {!hasQuery ? (
              recent.length > 0 || history.length > 0 ? (
                <>
                  {history.length > 0 ? (
                    <CommandGroup
                      heading="This session"
                      data-testid="global-search-history"
                    >
                      {history.map((entry) => {
                        const activeFilters = GROUP_ORDER.filter(
                          (t) => entry.filters[t],
                        );
                        const allOn = activeFilters.length === GROUP_ORDER.length;
                        const key = `history:${entry.query}:${activeFilters.join(",")}`;
                        return (
                          <CommandItem
                            key={key}
                            value={key}
                            onSelect={() => handleReplayHistory(entry)}
                            data-testid={`global-search-history-item-${entry.query}`}
                            className="flex items-center gap-2"
                          >
                            <Clock
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="truncate text-sm text-foreground">
                              {entry.query}
                            </span>
                            {!allOn ? (
                              <span
                                className="ml-auto flex flex-wrap items-center gap-1"
                                aria-label={`Filters: ${activeFilters
                                  .map((t) => GROUP_HEADINGS[t])
                                  .join(", ")}`}
                              >
                                {activeFilters.map((t) => {
                                  const Icon = GROUP_ICONS[t];
                                  return (
                                    <span
                                      key={t}
                                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                                      data-testid={`global-search-history-filter-${t}`}
                                    >
                                      <Icon className="h-3 w-3" aria-hidden="true" />
                                      {GROUP_HEADINGS[t]}
                                    </span>
                                  );
                                })}
                              </span>
                            ) : null}
                          </CommandItem>
                        );
                      })}
                      <div className="flex justify-end px-1 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleClearHistory}
                          data-testid="global-search-history-clear"
                          className="h-7 text-xs text-muted-foreground"
                        >
                          Clear session history
                        </Button>
                      </div>
                    </CommandGroup>
                  ) : null}
                  {recent.length > 0 ? (
                    <CommandGroup
                      heading="Recent searches"
                      data-testid="global-search-recent"
                    >
                      {recent.map((term) => (
                        <CommandItem
                          key={`recent:${term}`}
                          value={`recent:${term}`}
                          onSelect={() => setQuery(term)}
                          data-testid={`global-search-recent-item-${term}`}
                        >
                          <Clock
                            className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm text-foreground">
                            {term}
                          </span>
                        </CommandItem>
                      ))}
                      <div className="flex justify-end px-1 pt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={handleClearRecent}
                          data-testid="global-search-recent-clear"
                          className="h-7 text-xs text-muted-foreground"
                        >
                          Clear recent
                        </Button>
                      </div>
                    </CommandGroup>
                  ) : null}
                  <div className="flex justify-center border-t border-border/40 px-2 pb-2 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={handleClearAllSearchState}
                      data-testid="global-search-clear-all"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    >
                      Clear search history
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-muted-foreground">
                  <p>Type to search your grows, tents, plants, and cultivars.</p>
                </div>
              )
            ) : isLoading ? (
              <div

                className="space-y-1 py-2"
                role="status"
                aria-live="polite"
                aria-label="Searching your grows, tents, plants, and cultivars"
                data-testid="global-search-loading"
              >
                <span className="sr-only">Searching…</span>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-sm px-2 py-3"
                    data-testid="global-search-loading-row"
                  >
                    <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-2/5" : "w-1/2")} />
                      <Skeleton className={cn("h-3", i % 2 === 0 ? "w-3/5" : "w-1/3")} />
                    </div>
                    <Skeleton className="ml-2 h-4 w-16 shrink-0 rounded-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {isError ? (
                  <div
                    role="alert"
                    className="mx-2 my-2 flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm text-destructive"
                    data-testid="global-search-error"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p className="text-left leading-snug">
                        Your grows, tents, and plants couldn’t be searched just
                        now. Cultivar references below may be incomplete.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => retry()}
                        data-testid="global-search-retry"
                        className="h-8"
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Retry
                      </Button>
                    </div>
                  </div>
                ) : null}
                {hasAny && !hasFilteredAny && !isError ? (
                  <div
                    className="mx-auto flex max-w-xs flex-col items-center gap-3 py-6 text-center"
                    data-testid="global-search-filtered-empty"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <SearchX className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        All categories are hidden
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {results.length}{" "}
                        {results.length === 1 ? "result matches" : "results match"}{" "}
                        “{trimmed}”, but the current filters hide{" "}
                        {results.length === 1 ? "it" : "them all"}.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={resetFilters}
                      data-testid="global-search-filtered-empty-reset"
                    >
                      Show all categories
                    </Button>
                  </div>
                ) : null}
                {!hasAny && !isError ? (
                  <CommandEmpty className="py-6">
                    <div
                      className="mx-auto flex max-w-xs flex-col items-center gap-3 text-center"
                      data-testid="global-search-empty"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <SearchX className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          No matches for “{trimmed}”
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Nothing in your grows, tents, plants, or the cultivar
                          library matched. Log what’s happening in the tent
                          instead — that’s how Verdant learns.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setQuery("")}
                          data-testid="global-search-empty-clear"
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          Clear query
                        </Button>
                        {(
                          [
                            { actionId: "diary_note", label: "Note", testId: "note", fallbackType: "observation" },
                            { actionId: "watering", label: "Watering", testId: "watering", fallbackType: "watering" },
                            { actionId: "feeding", label: "Feeding", testId: "feeding", fallbackType: "feeding" },
                            { actionId: "environment", label: "Environment check", testId: "environment", fallbackType: "environment" },
                            { actionId: "training", label: "Training", testId: "training", fallbackType: null },
                          ] as ReadonlyArray<{
                            actionId: FastAddActionId;
                            label: string;
                            testId: string;
                            fallbackType: "observation" | "watering" | "feeding" | "environment" | null;
                          }>
                        ).map(({ actionId, label, testId, fallbackType }) => (
                          <Button
                            key={actionId}
                            type="button"
                            size="sm"
                            variant={actionId === "diary_note" ? "default" : "secondary"}
                            onClick={() => {
                              onOpenChange(false);
                              // With plant/tent context: dispatch the same Quick
                              // Log prefill event the plant/tent detail pages
                              // already listen for. The form opens prefilled
                              // with plant + occurred_at=now; the grower still
                              // confirms and saves — no silent writes here.
                              if (createContext) {
                                const intent = resolveFastAddIntent(actionId, createContext);
                                if (intent.kind === "open-quicklog" || intent.kind === "open-quicklog-v2") {
                                  const detail =
                                    intent.kind === "open-quicklog-v2" ? intent.detail : intent.prefill;
                                  if (typeof window !== "undefined") {
                                    window.dispatchEvent(
                                      new CustomEvent(intent.eventName, { detail }),
                                    );
                                  }
                                  return;
                                }
                              }
                              // No plant/tent in the current route — fall back
                              // to the public Quick Log starter with a type hint
                              // when the starter supports it (training does not).
                              navigate(fallbackType ? `/quick-log?type=${fallbackType}` : "/quick-log");
                            }}
                            data-testid={`global-search-empty-start-${testId}`}
                          >
                            {createContext ? (
                              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            ) : (
                              <NotebookPen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            {createContext ? `Create ${label.toLowerCase()}` : label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CommandEmpty>
                ) : null}
                {GROUP_ORDER.map((type) => {
                  const rows = grouped[type];
                  if (rows.length === 0) return null;
                  const Icon = GROUP_ICONS[type];
                  return (
                    <CommandGroup
                      key={type}
                      heading={
                        rows.length < totalsByGroup[type]
                          ? `${GROUP_HEADINGS[type]} (${rows.length} of ${totalsByGroup[type]})`
                          : `${GROUP_HEADINGS[type]} (${rows.length})`
                      }
                    >
                      {rows.map((row) => (
                        <CommandItem
                          key={`${type}:${row.id}`}
                          value={`${type}:${row.id}`}
                          onSelect={() => handleSelectResult(row)}
                          onMouseEnter={() => setPreviewRow(row)}
                          onFocus={() => setPreviewRow(row)}
                          data-testid={`global-search-item-${type}-${row.id}`}
                          className="data-[selected=true]:ring-2 data-[selected=true]:ring-primary/60 data-[selected=true]:ring-inset"
                        >

                          <Icon
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0 text-muted-foreground",
                            )}
                            aria-hidden="true"
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm text-foreground">
                              {highlightMatch(row.label, trimmed)}
                            </span>
                            {row.sublabel ? (
                              <span className="truncate text-xs text-muted-foreground">
                                {highlightMatch(row.sublabel, trimmed)}
                              </span>
                            ) : null}
                          </div>
                          <div
                            className="ml-2 flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                            aria-label={`Match ${row.match_kind}, rank ${row.rank}, score ${row.score.toFixed(2)}`}
                            data-testid={`global-search-item-meta-${row.entity_type}-${row.id}`}
                          >
                            <span
                              className={cn(
                                "rounded-sm border px-1.5 py-0.5 font-medium",
                                row.match_kind === "exact"
                                  ? "border-primary/40 bg-primary/10 text-primary"
                                  : row.match_kind === "prefix"
                                    ? "border-foreground/20 bg-muted text-foreground/80"
                                    : "border-border bg-transparent",
                              )}
                            >
                              {row.match_kind}
                            </span>
                            <span className="tabular-nums">
                              r{row.rank}·{row.score.toFixed(2)}
                            </span>
                          </div>

                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}
                {canShowMore ? (
                  <div
                    className="flex flex-col items-center gap-1 border-t px-3 py-3"
                    data-testid="global-search-show-more-wrapper"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setVisibleCount((n) =>
                          Math.min(results.length, n + PAGE_SIZE),
                        )
                      }
                      data-testid="global-search-show-more"
                    >
                      Show {Math.min(PAGE_SIZE, remaining)} more
                    </Button>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {remaining} more{" "}
                      {remaining === 1 ? "result" : "results"} available
                    </span>
                  </div>
                ) : null}
              </>
            )}
            </CommandList>
            {hasQuery && !isLoading && !isError ? (
              <GlobalSearchResultPreview
                row={previewRow}
                routePath={previewRow ? routeFor(previewRow) : null}
                query={query}
                onOpen={() => {
                  if (previewRow) handleSelectResult(previewRow);
                }}
              />
            ) : null}
          </div>
        </CommandPrimitive>

      </DialogContent>
    </Dialog>
  );
}
