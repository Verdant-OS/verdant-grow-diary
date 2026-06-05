import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { PaywallCtaViewModel } from "@/lib/paywallCtaViewModel";

/**
 * PaywallCta — presenter-only component.
 *
 * Renders a calm "what upgrading unlocks" panel from a prepared view model.
 *
 * This component does NOT:
 *   - gate any route
 *   - read or write current-tier state
 *   - call any payment provider
 *   - perform a checkout
 *
 * It is safe to mount on any billing- or upgrade-shaped surface without
 * changing access behavior.
 */
export interface PaywallCtaProps {
  vm: PaywallCtaViewModel;
  /** Optional test id for targeted assertions. */
  "data-testid"?: string;
  /** Optional extra className for layout (no design overrides expected). */
  className?: string;
}

export default function PaywallCta({
  vm,
  className,
  ...rest
}: PaywallCtaProps) {
  const testId = rest["data-testid"] ?? "paywall-cta";

  return (
    <section
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      className={
        "rounded-xl border border-border/60 bg-card/40 p-6 text-left " +
        (className ?? "")
      }
    >
      <p
        className="text-xs uppercase tracking-widest text-primary font-medium"
        data-testid={`${testId}-required-plan`}
      >
        {vm.requiredPlanLabel}
      </p>
      <h2
        id={`${testId}-title`}
        className="mt-2 font-display text-xl font-semibold tracking-tight"
      >
        {vm.title}
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">{vm.description}</p>

      {vm.currentPlanLabel ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid={`${testId}-current-plan`}
        >
          Current plan: {vm.currentPlanLabel}
        </p>
      ) : null}

      <ul
        className="mt-4 space-y-2 text-sm"
        data-testid={`${testId}-bullets`}
      >
        {vm.unlockBullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary"
            />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {vm.secondaryCopy ? (
        <p
          className="mt-4 text-sm text-muted-foreground"
          data-testid={`${testId}-secondary`}
        >
          {vm.secondaryCopy}
        </p>
      ) : null}

      <div className="mt-5">
        <Link to={vm.primaryCtaHref} data-testid={`${testId}-link`}>
          <Button size="lg">{vm.primaryCtaLabel}</Button>
        </Link>
      </div>
    </section>
  );
}
