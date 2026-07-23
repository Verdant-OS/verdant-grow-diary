/**
 * GlobalSearchDialog — one command palette for RLS-backed private entity
 * matches, bundled public cultivar references, and static destinations.
 *
 * Private grow/tent/plant matches come from public.verdant_search. Public
 * references remain read-only bundled data until the database cutover gate is
 * proven. The presenter performs no writes and never falls back to demo rows.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import {
  BookOpen,
  FileText,
  Leaf,
  Sprout,
  Tent,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { VERDANT_CULTIVARS } from "@/constants/verdantCultivars";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import {
  buildGlobalSearchItems,
  filterGlobalSearchItems,
  type GlobalSearchItem,
  type GlobalSearchItemKind,
} from "@/lib/globalSearchItems";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional deterministic override used by isolated presenter tests. */
  items?: readonly GlobalSearchItem[];
}

const ITEM_ICONS: Record<GlobalSearchItemKind, LucideIcon> = {
  grow: Sprout,
  tent: Tent,
  plant: Leaf,
  cultivar: BookOpen,
  page: FileText,
};

export default function GlobalSearchDialog({ open, onOpenChange, items }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const privateSearch = useGlobalSearch(items === undefined ? query : "");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const resolvedItems = useMemo(
    () =>
      items ??
      buildGlobalSearchItems({
        entityResults: privateSearch.results,
        cultivars: VERDANT_CULTIVARS,
      }),
    [items, privateSearch.results],
  );

  const groups = useMemo(() => {
    const filtered = filterGlobalSearchItems(resolvedItems, query);
    const grouped = new Map<string, GlobalSearchItem[]>();
    for (const item of filtered) {
      const group = grouped.get(item.group) ?? [];
      group.push(item);
      grouped.set(item.group, group);
    }
    return Array.from(grouped.entries());
  }, [query, resolvedItems]);

  const hasQuery = query.trim().length > 0;
  const hasResults = groups.some(([, groupItems]) => groupItems.length > 0);
  const emptyCopy = privateSearch.isLoading
    ? "Searching your grow records…"
    : privateSearch.isError
      ? "Private grow records are temporarily unavailable. No matching public reference or page was found."
      : "No matches for that search.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg">
        <CommandPrimitive
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground"
        >
          <CommandInput
            placeholder="Search grows, tents, plants, strains, and pages…"
            value={query}
            onValueChange={setQuery}
            data-testid="global-search-input"
          />
          <CommandList>
            {hasQuery && privateSearch.isLoading && hasResults ? (
              <div
                className="px-4 py-2 text-xs text-muted-foreground"
                data-testid="global-search-loading"
              >
                Searching private grow records…
              </div>
            ) : null}

            {hasQuery && privateSearch.isError && hasResults ? (
              <div className="px-4 py-2 text-xs text-destructive">
                Private grow records are temporarily unavailable. Public reference and page results remain available.
              </div>
            ) : null}

            {!hasResults ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyCopy}</div>
            ) : (
              groups.map(([group, groupItems]) => (
                <CommandGroup key={group} heading={group}>
                  {groupItems.map((item) => {
                    const Icon = ITEM_ICONS[item.kind];
                    return (
                      <CommandItem
                        key={item.to}
                        value={item.to}
                        onSelect={() => {
                          onOpenChange(false);
                          navigate(item.to);
                        }}
                        data-testid={`global-search-item-${item.to}`}
                      >
                        <Icon
                          className="mr-2 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm text-foreground">{item.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.description ?? item.to}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))
            )}
          </CommandList>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
