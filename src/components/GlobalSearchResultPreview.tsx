/**
 * GlobalSearchResultPreview — presenter-only side panel that shows a
 * lightweight preview of the currently-highlighted GlobalSearch result so the
 * grower can confirm they're about to open the right item without leaving the
 * command palette.
 *
 * No queries, no writes, no navigation — the parent dialog owns selection and
 * routing. Content comes entirely from the already-fetched result row.
 */
import { Check, Copy, Dna, ExternalLink, Leaf, SquareArrowOutUpRight, Sprout, Tent } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  GlobalSearchEntityType,
  GlobalSearchResult,
} from "@/hooks/useGlobalSearch";

const TYPE_LABELS: Record<GlobalSearchEntityType, string> = {
  grow: "Grow",
  tent: "Tent",
  plant: "Plant",
  cultivar: "Cultivar reference",
};

const TYPE_ICONS: Record<GlobalSearchEntityType, typeof Sprout> = {
  grow: Sprout,
  tent: Tent,
  plant: Leaf,
  cultivar: Dna,
};

const TYPE_HINTS: Record<GlobalSearchEntityType, string> = {
  grow: "Opens the grow overview with plants, tents, and timeline.",
  tent: "Opens the tent view with its assigned plants and sensors.",
  plant: "Opens the plant detail with diary timeline and photos.",
  cultivar: "Opens the public cultivar reference — no private data.",
};

export interface GlobalSearchResultPreviewProps {
  row: GlobalSearchResult | null;
  routePath: string | null;
  query: string;
  onOpen: () => void;
  className?: string;
}

export default function GlobalSearchResultPreview({
  row,
  routePath,
  query,
  onOpen,
  className,
}: GlobalSearchResultPreviewProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [routePath]);

  const absoluteUrl = routePath
    ? (typeof window !== "undefined" ? window.location.origin : "") + routePath
    : null;

  const handleOpenInNewTab = useCallback(() => {
    if (!absoluteUrl) return;
    window.open(absoluteUrl, "_blank", "noopener,noreferrer");
  }, [absoluteUrl]);

  const handleCopyLink = useCallback(async () => {
    if (!absoluteUrl) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteUrl);
      } else {
        const el = document.createElement("textarea");
        el.value = absoluteUrl;
        el.setAttribute("readonly", "");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      toast.success("Link copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  }, [absoluteUrl]);

  if (!row || !routePath) {
    return (
      <aside
        aria-label="Result preview"
        data-testid="global-search-preview"
        data-state="empty"
        className={cn(
          "hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-l md:bg-muted/20 md:px-3 md:py-3 md:text-xs md:text-muted-foreground",
          className,
        )}
      >
        <p className="m-auto max-w-[10rem] text-center leading-snug">
          Highlight a result to preview it here before opening.
        </p>
      </aside>
    );
  }

  const Icon = TYPE_ICONS[row.entity_type];
  const typeLabel = TYPE_LABELS[row.entity_type];
  const hint = TYPE_HINTS[row.entity_type];

  return (
    <aside
      aria-label={`Preview of ${typeLabel} ${row.label}`}
      data-testid="global-search-preview"
      data-state="result"
      data-entity-type={row.entity_type}
      data-entity-id={row.id}
      className={cn(
        "hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-3 md:border-l md:bg-muted/20 md:px-3 md:py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background text-muted-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span
          className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          data-testid="global-search-preview-type"
        >
          {typeLabel}
        </span>
      </div>

      <div className="min-w-0 space-y-0.5">
        <p
          className="truncate text-sm font-semibold text-foreground"
          title={row.label}
          data-testid="global-search-preview-label"
        >
          {row.label}
        </p>
        {row.sublabel ? (
          <p
            className="truncate text-xs text-muted-foreground"
            title={row.sublabel}
            data-testid="global-search-preview-sublabel"
          >
            {row.sublabel}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span
          className={cn(
            "rounded-sm border px-1.5 py-0.5 font-medium",
            row.match_kind === "exact"
              ? "border-primary/40 bg-primary/10 text-primary"
              : row.match_kind === "prefix"
                ? "border-foreground/20 bg-muted text-foreground/80"
                : "border-border bg-transparent",
          )}
          data-testid="global-search-preview-match-kind"
        >
          {row.match_kind}
        </span>
        <span className="tabular-nums" data-testid="global-search-preview-score">
          r{row.rank}·{row.score.toFixed(2)}
        </span>
        {query.trim().length > 0 ? (
          <span className="normal-case tracking-normal text-muted-foreground">
            for “{query.trim()}”
          </span>
        ) : null}
      </div>

      <p
        className="text-xs leading-snug text-muted-foreground"
        data-testid="global-search-preview-hint"
      >
        {hint}
      </p>

      <div className="mt-auto space-y-2">
        <div
          className="truncate rounded-sm border bg-background px-2 py-1 text-[11px] font-mono text-muted-foreground"
          title={routePath}
          data-testid="global-search-preview-route"
        >
          {routePath}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onOpen}
          className="w-full"
          data-testid="global-search-preview-open"
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Open {typeLabel.toLowerCase()}
        </Button>
      </div>
    </aside>
  );
}
