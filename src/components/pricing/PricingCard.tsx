/**
 * Presentational pricing card component.
 *
 * Pure UI — all data is injected via props. No business logic, no hooks, no writes.
 */
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PricingCardProps {
  name: string;
  subtitle: string;
  price: string;
  cadence: string;
  description: string;
  features: readonly string[];
  cta: React.ReactNode;
  highlighted?: boolean;
  badge?: string;
  footnote?: string;
  testId?: string;
}

export default function PricingCard({
  name,
  subtitle,
  price,
  cadence,
  description,
  features,
  cta,
  highlighted,
  badge,
  footnote,
  testId = "pricing-card",
}: PricingCardProps) {
  return (
    <div
      data-testid={testId}
      className={[
        "relative rounded-2xl border p-6 flex flex-col bg-card/40 backdrop-blur",
        highlighted
          ? "border-primary/40 shadow-md"
          : "border-border/60",
      ].join(" ")}
    >
      {badge && (
        <span
          data-testid={`${testId}-badge`}
          className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 text-xs rounded-full bg-primary/15 text-primary font-medium"
        >
          {badge}
        </span>
      )}

      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-xl font-semibold">{name}</h3>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {subtitle}
        </span>
      </div>

      <p className="mt-2 text-sm text-muted-foreground min-h-[2.5rem]">
        {description}
      </p>

      <div className="mt-4 flex items-baseline gap-1" data-testid={`${testId}-price`}>
        <span className="text-3xl md:text-4xl font-display font-bold">{price}</span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>

      <ul className="mt-5 space-y-2 text-sm flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {footnote && (
        <p className="mt-4 text-xs text-muted-foreground">{footnote}</p>
      )}

      <div className="mt-6">{cta}</div>
    </div>
  );
}
