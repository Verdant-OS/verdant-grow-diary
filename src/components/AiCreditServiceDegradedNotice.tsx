/**
 * AiCreditServiceDegradedNotice — shared presenter for the
 * `upstream_credit_exhausted` envelope reason. Used by AI Doctor and
 * AI Coach. Pure presenter: no fetch, no entitlements, no CTA.
 *
 * Hard fence: never renders a paywall, upgrade CTA, pricing link, or
 * any element that implies the grower was charged.
 */
import {
  buildAiCreditServiceDegradedViewModel,
  type AiCreditServiceDegradedSurface,
} from "@/lib/aiCreditServiceDegradedViewModel";

export interface AiCreditServiceDegradedNoticeProps {
  surface: AiCreditServiceDegradedSurface;
  "data-testid"?: string;
}

export default function AiCreditServiceDegradedNotice({
  surface,
  ...rest
}: AiCreditServiceDegradedNoticeProps) {
  const testId =
    rest["data-testid"] ??
    (surface === "coach"
      ? "coach-upstream-credit-exhausted-notice"
      : "doctor-upstream-credit-exhausted-notice");
  const vm = buildAiCreditServiceDegradedViewModel(surface);

  return (
    <section
      data-testid={testId}
      data-surface={surface}
      data-kind="upstream_credit_exhausted"
      role="status"
      aria-live="polite"
      className="rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm text-muted-foreground"
    >
      <p className="font-medium text-foreground">{vm.title}</p>
      <p className="mt-1 text-xs">{vm.body}</p>
    </section>
  );
}
