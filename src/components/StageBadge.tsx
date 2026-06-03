import { cn } from "@/lib/utils";
import {
  normalizeGrowStage,
  formatGrowStageBadge,
} from "@/constants/growStages";

/* ── canonical stage styles ── */
const CANONICAL_STYLE_MAP: Record<string, string> = {
  seedling:
    "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30",
  vegetative: "bg-primary/15 text-primary border-primary/30",
  flower:
    "bg-[hsl(var(--leaf-glow))]/15 text-[hsl(var(--leaf-glow))] border-[hsl(var(--leaf-glow))]/30",
  harvest:
    "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
};

/* ── legacy mock stages not yet in canonical taxonomy ── */
const LEGACY_STYLE_MAP: Record<string, string> = {
  flush: "bg-secondary text-foreground border-border",
  cure: "bg-muted text-muted-foreground border-border",
};

const FALLBACK_STYLE = "bg-secondary text-muted-foreground border-border";

export default function StageBadge({
  stage,
  className,
}: {
  stage: string | null;
  className?: string;
}) {
  const canonical = normalizeGrowStage(stage);

  if (canonical) {
    const label = formatGrowStageBadge(canonical);
    const cls = CANONICAL_STYLE_MAP[canonical];
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
          cls,
          className,
        )}
      >
        {label}
      </span>
    );
  }

  /* legacy non-canonical stages */
  const raw = stage?.trim().toLowerCase();
  if (raw && LEGACY_STYLE_MAP[raw]) {
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
          LEGACY_STYLE_MAP[raw],
          className,
        )}
      >
        {label}
      </span>
    );
  }

  /* null or truly unknown */
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        FALLBACK_STYLE,
        className,
      )}
    >
      Unknown
    </span>
  );
}
