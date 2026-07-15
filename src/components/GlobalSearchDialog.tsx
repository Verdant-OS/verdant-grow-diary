/**
 * GlobalSearchDialog — command palette for jumping to any in-app
 * destination. Presenter-only, no writes, no network.
 *
 * Data comes from the generic `globalSearchItems` module so this
 * component stays reusable and page-agnostic.
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
  GLOBAL_SEARCH_ITEMS,
  filterGlobalSearchItems,
  type GlobalSearchItem,
} from "@/lib/globalSearchItems";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items?: readonly GlobalSearchItem[];
}

export default function GlobalSearchDialog({
  open,
  onOpenChange,
  items = GLOBAL_SEARCH_ITEMS,
}: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    const filtered = filterGlobalSearchItems(items, query);
    const map = new Map<string, GlobalSearchItem[]>();
    for (const it of filtered) {
      const arr = map.get(it.group) ?? [];
      arr.push(it);
      map.set(it.group, arr);
    }
    return Array.from(map.entries());
  }, [items, query]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search pages, tools, guides…"
        value={query}
        onValueChange={setQuery}
        data-testid="global-search-input"
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {groups.map(([group, gItems]) => (
          <CommandGroup key={group} heading={group}>
            {gItems.map((it) => (
              <CommandItem
                key={it.to}
                value={`${it.label} ${it.to} ${(it.keywords ?? []).join(" ")}`}
                onSelect={() => {
                  onOpenChange(false);
                  navigate(it.to);
                }}
                data-testid={`global-search-item-${it.to}`}
              >
                <span>{it.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {it.to}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
