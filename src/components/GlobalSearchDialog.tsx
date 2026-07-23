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
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { AlertTriangle, Clock, Dna, Leaf, NotebookPen, RefreshCw, SearchX, Sprout, Tent, X } from "lucide-react";
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

export default function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const { results, isLoading, isError, retry } = useGlobalSearch(query);

  useEffect(() => {
    if (open) {
      setRecent(readRecentSearches());
    } else {
      setQuery("");
    }
  }, [open]);

  const grouped = useMemo(() => {
    const map: Record<GlobalSearchEntityType, GlobalSearchResult[]> = {
      grow: [],
      tent: [],
      plant: [],
      cultivar: [],
    };
    // Preserve the hook's deterministic order within each entity_type.
    for (const row of results) {
      map[row.entity_type]?.push(row);
    }
    return map;
  }, [results]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasAny = results.length > 0;

  const handleSelectResult = (row: GlobalSearchResult) => {
    if (trimmed) {
      setRecent(pushRecentSearch(trimmed));
    }
    onOpenChange(false);
    navigate(routeFor(row));
  };

  const handleClearRecent = () => {
    clearRecentSearches();
    setRecent([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <CommandPrimitive
          shouldFilter={false}
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
              role="status"
              aria-live="polite"
              data-testid="global-search-result-count"
            >
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {results.length} {results.length === 1 ? "result" : "results"}
              </span>
              <span className="tabular-nums">
                Showing 1–{results.length} of {results.length}
              </span>
              <span className="ml-auto flex flex-wrap items-center gap-1.5">
                {GROUP_ORDER.filter((t) => grouped[t].length > 0).map((t) => {
                  const Icon = GROUP_ICONS[t];
                  return (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground"
                      data-testid={`global-search-count-${t}`}
                    >
                      <Icon className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="tabular-nums">{grouped[t].length}</span>
                      <span className="text-muted-foreground">{GROUP_HEADINGS[t]}</span>
                    </span>
                  );
                })}
              </span>
            </div>
          ) : null}

          <CommandList>
            {!hasQuery ? (
              recent.length > 0 ? (
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
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Type to search your grows, tents, plants, and cultivars.
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
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          navigate("/quick-log");
                        }}
                        data-testid="global-search-empty-quicklog"
                      >
                        <NotebookPen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Start a Quick Log
                      </Button>
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
                      heading={`${GROUP_HEADINGS[type]} (${rows.length})`}
                    >
                      {rows.map((row) => (
                        <CommandItem
                          key={`${type}:${row.id}`}
                          value={`${type}:${row.id}`}
                          onSelect={() => handleSelectResult(row)}
                          data-testid={`global-search-item-${type}-${row.id}`}
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
              </>
            )}
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
