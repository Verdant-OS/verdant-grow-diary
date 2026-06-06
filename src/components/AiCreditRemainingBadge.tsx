/**
 * AiCreditRemainingBadge — presenter for the post-success AI Doctor
 * credit-remaining badge (S3.1).
 *
 * Pure presenter. No CTA, no link, no Supabase, no fetch, no Date reads.
 * Renders nothing when the view model is hidden.
 */
import {
  buildAiCreditRemainingBadgeViewModel,
  type AiCreditRemainingInput,
} from "@/lib/aiCreditRemainingBadgeViewModel";

export interface AiCreditRemainingBadgeProps {
  credit: AiCreditRemainingInput | null | undefined;
  "data-testid"?: string;
}

export default function AiCreditRemainingBadge({
  credit,
  "data-testid": testId = "ai-credit-remaining-badge",
}: AiCreditRemainingBadgeProps) {
  const vm = buildAiCreditRemainingBadgeViewModel(credit);
  if (!vm.visible) return null;

  return (
    <div
      data-testid={testId}
      data-scope={vm.scope}
      className="mt-2 inline-flex flex-col items-start gap-0.5 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground"
    >
      <span
        className="font-medium text-foreground"
        data-testid={`${testId}-label`}
      >
        {vm.label}
      </span>
      {vm.helper ? (
        <span data-testid={`${testId}-helper`}>{vm.helper}</span>
      ) : null}
    </div>
  );
}
