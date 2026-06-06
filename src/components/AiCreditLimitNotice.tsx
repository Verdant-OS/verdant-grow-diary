/**
 * AiCreditLimitNotice — presenter-only component for AI credit denials.
 * Shared by AI Doctor (S3.0) and AI Coach (S3.2); branches on view-model
 * kind (which itself branches on the server-supplied credit.plan_id).
 * No fetching, no entitlements logic.
 */
import PaywallCta from "@/components/PaywallCta";
import {
  buildAiCreditLimitNoticeViewModel,
  type AiCreditDenial,
  type AiCreditLimitNoticeSurface,
} from "@/lib/aiCreditLimitNoticeViewModel";

export interface AiCreditLimitNoticeProps {
  credit: AiCreditDenial;
  currentPlanLabel?: string;
  /** Defaults to "doctor". Pass "coach" for AI Coach surface copy. */
  surface?: AiCreditLimitNoticeSurface;
  "data-testid"?: string;
}

export default function AiCreditLimitNotice({
  credit,
  currentPlanLabel,
  surface,
  ...rest
}: AiCreditLimitNoticeProps) {
  const testId = rest["data-testid"] ?? "ai-credit-limit-notice";
  const vm = buildAiCreditLimitNoticeViewModel({ credit, currentPlanLabel, surface });


  if (vm.kind === "upsell" && vm.paywallVm) {
    return (
      <section
        data-testid={testId}
        data-kind="upsell"
        aria-labelledby={`${testId}-title`}
        className="space-y-3"
      >
        <header>
          <h3
            id={`${testId}-title`}
            className="text-base font-semibold tracking-tight"
          >
            {vm.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{vm.body}</p>
        </header>
        <PaywallCta
          vm={vm.paywallVm}
          data-testid={`${testId}-paywall`}
        />
      </section>
    );
  }

  return (
    <section
      data-testid={testId}
      data-kind={vm.kind}
      aria-labelledby={`${testId}-title`}
      className="rounded-xl border border-border/60 bg-card/40 p-4"
    >
      <h3
        id={`${testId}-title`}
        className="text-base font-semibold tracking-tight"
      >
        {vm.title}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">{vm.body}</p>
    </section>
  );
}
