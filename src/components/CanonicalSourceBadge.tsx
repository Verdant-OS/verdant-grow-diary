/**
 * CanonicalSourceBadge — presenter-only chip distinguishing the six
 * canonical Verdant sensor sources (live | manual | csv | demo | stale |
 * invalid). Anything else renders as "Unknown source" with a caution
 * tone — including "ecowitt", which is a *provider*, not a source.
 *
 * When provider is supplied it is shown as a separate sibling chip so
 * source vs. provider are never conflated.
 */
import {
  buildCanonicalSourceBadge,
  canonicalBadgeToneClass,
  type BuildCanonicalSourceBadgeInput,
} from "@/lib/canonicalSourceBadgeViewModel";
import { cn } from "@/lib/utils";

export interface CanonicalSourceBadgeProps extends BuildCanonicalSourceBadgeInput {
  className?: string;
  /** Override testid. Default "canonical-source-badge". */
  testId?: string;
  /** Hide the provider sibling chip even if provider is provided. */
  hideProvider?: boolean;
}

export default function CanonicalSourceBadge({
  className,
  testId = "canonical-source-badge",
  hideProvider = false,
  ...input
}: CanonicalSourceBadgeProps) {
  const vm = buildCanonicalSourceBadge(input);
  return (
    <span
      data-testid={testId}
      data-source={vm.normalizedSource}
      data-tone={vm.tone}
      data-unknown={vm.isUnknown ? "true" : "false"}
      data-degraded={vm.isDegraded ? "true" : "false"}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        data-testid={`${testId}-source`}
        title={`Source: ${vm.label}`}
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          canonicalBadgeToneClass(vm.tone),
        )}
      >
        {vm.label}
      </span>
      {!hideProvider && vm.providerLabel && (
        <span
          data-testid={`${testId}-provider`}
          title={`Provider: ${vm.providerLabel}`}
          className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          {vm.providerLabel}
        </span>
      )}
    </span>
  );
}
