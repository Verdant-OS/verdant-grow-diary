/**
 * GlobalSearchDialog — shared command palette for owner-scoped grow entities,
 * public cultivar references, and in-app destinations.
 *
 * Presenter-only: the hook owns read orchestration and the pure search model
 * owns ranking/filtering. No writes and no demo fallback.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  filterGlobalSearchItems,
  type GlobalSearchItem,
} from "@/lib/globalSearchItems";
import { useGlobalSearchItems } from "@/hooks/useGlobalSearchItems";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional deterministic override used by isolated presenter tests. */
  items?: readonly GlobalSearchItem[];
}

export default function GlobalSearchDialog({ open, onOpenChange, items }: Props) {
  const navigate = useNavigate();
  const connected = useGlobalSearchItems(open && items === undefined);
  const resolvedItems = items ?? connected.items;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    const filtered = filterGlobalSearchItems(resolvedItems, query);
    const map = new Map<string, GlobalSearchItem[]>();
    for (const item of filtered) {
      const group = map.get(item.group) ?? [];
      group.push(item);
      map.set(item.group, group);
    }
    return Array.from(map.entries());
  }, [query, resolvedItems]);

  const emptyCopy = connected.loading
    ? "Loading your grow records…"
    : connected.error
      ? "Private grow records are temporarily unavailable. Reference and page search still work."
      : "No results.";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search grows, tents, plants, strains, and pages…"
        value={query}
        onValueChange={setQuery}
        data-testid="global-search-input"
      />
      <CommandList>
        <CommandEmpty>{emptyCopy}</CommandEmpty>
        {groups.map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.to} ${item.description ?? ""} ${(item.keywords ?? []).join(" ")}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigate(item.to);
                }}
                data-testid={`global-search-item-${item.to}`}
              >
                <span>{item.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {item.description ?? item.to}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
