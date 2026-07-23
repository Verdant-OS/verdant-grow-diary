/**
 * GlobalSearchDialog — command palette that queries the shared
 * public.verdant_search RPC via useGlobalSearch and jumps to the
 * matching grow / tent / plant detail route.
 *
 * cmdk's built-in client-side filter is disabled (shouldFilter={false})
 * so results render in exactly the deterministic order the RPC returns
 * (exact → prefix → fuzzy).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Leaf, Sprout, Tent } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GROUP_ORDER: GlobalSearchEntityType[] = ["grow", "tent", "plant"];
const GROUP_HEADINGS: Record<GlobalSearchEntityType, string> = {
  grow: "Grows",
  tent: "Tents",
  plant: "Plants",
};
const GROUP_ICONS: Record<GlobalSearchEntityType, typeof Sprout> = {
  grow: Sprout,
  tent: Tent,
  plant: Leaf,
};

function routeFor(row: GlobalSearchResult): string {
  switch (row.entity_type) {
    case "grow":
      return growDetailPath(row.id);
    case "tent":
      return tentDetailPath(row.id);
    case "plant":
      return plantDetailPath(row.id);
  }
}

export default function GlobalSearchDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { results, isLoading, isError } = useGlobalSearch(query);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const grouped = useMemo(() => {
    const map: Record<GlobalSearchEntityType, GlobalSearchResult[]> = {
      grow: [],
      tent: [],
      plant: [],
    };
    // Preserve RPC ordering within each entity_type.
    for (const row of results) {
      map[row.entity_type]?.push(row);
    }
    return map;
  }, [results]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;
  const hasAny = results.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <CommandPrimitive
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
        >
          <CommandInput
            placeholder="Search your grows, tents, and plants…"
            value={query}
            onValueChange={setQuery}
            data-testid="global-search-input"
          />
          <CommandList>
            {!hasQuery ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Type to search your grows, tents, and plants.
              </div>
            ) : isLoading ? (
              <div
                className="py-6 text-center text-sm text-muted-foreground"
                data-testid="global-search-loading"
              >
                Searching…
              </div>
            ) : isError ? (
              <div className="py-6 text-center text-sm text-destructive">
                Search failed. Try again in a moment.
              </div>
            ) : !hasAny ? (
              <CommandEmpty>No matches for that search.</CommandEmpty>
            ) : (
              GROUP_ORDER.map((type) => {
                const rows = grouped[type];
                if (rows.length === 0) return null;
                const Icon = GROUP_ICONS[type];
                return (
                  <CommandGroup key={type} heading={GROUP_HEADINGS[type]}>
                    {rows.map((row) => (
                      <CommandItem
                        key={`${type}:${row.id}`}
                        value={`${type}:${row.id}`}
                        onSelect={() => {
                          onOpenChange(false);
                          navigate(routeFor(row));
                        }}
                        data-testid={`global-search-item-${type}-${row.id}`}
                      >
                        <Icon
                          className={cn("mr-2 h-4 w-4 shrink-0 text-muted-foreground")}
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm text-foreground">
                            {row.label}
                          </span>
                          {row.sublabel ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {row.sublabel}
                            </span>
                          ) : null}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })
            )}
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
