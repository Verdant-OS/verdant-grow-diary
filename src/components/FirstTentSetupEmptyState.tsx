/**
 * FirstTentSetupEmptyState — presenter-only empty state shown on sensor
 * surfaces when the current user has no active tent. Pure UI; no writes,
 * no automation, no fabricated tent data.
 */

import { Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  buildFirstTentSetupCopy,
  type FirstTentSetupSurface,
} from "@/lib/firstTentSetupRules";

interface Props {
  surface: FirstTentSetupSurface;
  /** Where the CTA should send the grower. Defaults to /tents. */
  href?: string;
  testId?: string;
  className?: string;
}

export default function FirstTentSetupEmptyState({
  surface,
  href = "/tents",
  testId,
  className,
}: Props) {
  const copy = buildFirstTentSetupCopy(surface);
  const resolvedTestId = testId ?? `first-tent-setup-${surface}`;
  return (
    <div
      data-testid={resolvedTestId}
      data-surface={surface}
      className={
        "rounded-2xl border border-border/60 bg-secondary/30 p-4 space-y-2 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sprout className="h-4 w-4 text-primary" aria-hidden />
        <span>{copy.title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-snug">{copy.body}</p>
      <Button asChild size="sm" data-testid={`${resolvedTestId}-cta`}>
        <Link to={href}>{copy.cta}</Link>
      </Button>
    </div>
  );
}
