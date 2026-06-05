/**
 * AiCreditRemainingBadge — calm post-success badge. Presenter only.
 * Renders nothing when the VM is hidden. No CTA, no fetch.
 */
import {
  buildAiCreditRemainingBadgeViewModel,
  type AiCreditRemainingInput,
} from "@/lib/aiCreditRemainingBadgeViewModel";

export interface AiCreditRemainingBadgeProps {
  credit?: AiCreditRemainingInput | null;
  "data-testid"?: string;
}

export default function AiCreditRemainingBadge({
  credit,
  ...rest
}: AiCreditRemainingBadgeProps) {
  const vm = buildAiCreditRemainingBadgeViewModel(credit ?? null);
  if (!vm.visible) return null;
  const testId = rest["data-testid"] ?? "ai-credit-remaining-badge";

  return (
    <p
      data-testid={testId}
      data-tone={vm.tone}
      title={vm.title}
      aria-label={vm.title ? `${vm.label}. ${vm.title}` : vm.label}
      className={
        "mt-2 inline-flex items-center gap-1 rounded-md border border-border/60 bg-card/40 px-2 py-0.5 text-[11px] " +
        (vm.tone === "watch"
          ? "text-amber-200"
          : "text-muted-foreground")
      }
    >
      <span>{vm.label}</span>
      {vm.title ? (
        <span
          className="text-muted-foreground/70"
          data-testid={`${testId}-reset`}
        >
          · {vm.title}
        </span>
      ) : null}
    </p>
  );
}
