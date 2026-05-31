/**
 * ReportsHubOnboardingSection — "Start building your grow memory" empty-state
 * onboarding for /reports. Pure presentation; visibility + cards come from
 * `buildReportsHubOnboarding`.
 *
 * SAFETY:
 *  - Presentational only. No I/O, no writes, no automation.
 *  - Copy is observational. Never claims reports are healthy or complete.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  REPORTS_HUB_ONBOARDING_SUBTITLE,
  REPORTS_HUB_ONBOARDING_TITLE,
  type ReportsHubOnboardingCard,
} from "@/lib/reportsHubOnboarding";

interface Props {
  cards: readonly ReportsHubOnboardingCard[];
}

export default function ReportsHubOnboardingSection({ cards }: Props) {
  if (!cards || cards.length === 0) return null;
  return (
    <section
      className="glass rounded-2xl p-4 mb-4"
      aria-label={REPORTS_HUB_ONBOARDING_TITLE}
      data-testid="reports-onboarding"
    >
      <header className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">
            {REPORTS_HUB_ONBOARDING_TITLE}
          </h2>
          <p className="text-xs text-muted-foreground">
            {REPORTS_HUB_ONBOARDING_SUBTITLE}
          </p>
        </div>
      </header>
      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {cards.map((card) => (
          <li
            key={card.id}
            className="rounded-xl border border-border/60 p-3 flex flex-col gap-1.5"
            data-testid={`reports-onboarding-card-${card.id}`}
          >
            <p className="text-sm font-medium">{card.title}</p>
            <p className="text-xs text-muted-foreground">{card.description}</p>
            <Link
              to={card.href}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-auto pt-1"
              data-testid={`reports-onboarding-link-${card.id}`}
            >
              {card.hrefLabel}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
