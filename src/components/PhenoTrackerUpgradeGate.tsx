import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyEntitlements } from "@/hooks/useMyEntitlements";
import {
  canUseFeature,
  canReadExistingFeatureData,
} from "@/lib/featureEntitlements";

/**
 * PhenoTrackerUpgradeGate — presenter-only gate for Pheno Tracker surfaces.
 *
 * Behavior:
 *   - Pro / Founder Lifetime (active): renders children.
 *   - Canceled/paused prior Pro (read-only mode requested): renders children
 *     when `allowReadOnly` is true. The wrapped surface is responsible for
 *     rendering read-only state.
 *   - Everyone else (Free, unauthenticated, unknown): renders the calm
 *     upgrade card with an Upgrade CTA and an optional "View demo" link.
 *
 * SAFETY: UI gating only. Write paths must ALSO check
 * `canWriteFeatureData(entitlement, "pheno_tracker")` before firing any
 * Supabase write. This component does not accept any client flag override.
 */
export interface PhenoTrackerUpgradeGateProps {
  children: ReactNode;
  /** When true, degraded-but-previously-Pro users see children in read-only mode. */
  allowReadOnly?: boolean;
  /** Optional deep-linked demo route. Defaults to the public Pheno Comparison preview. */
  demoHref?: string | null;
  /** Test id override. */
  "data-testid"?: string;
}

export default function PhenoTrackerUpgradeGate({
  children,
  allowReadOnly = false,
  demoHref = "/pheno-comparison",
  ...rest
}: PhenoTrackerUpgradeGateProps) {
  const testId = rest["data-testid"] ?? "pheno-tracker-upgrade-gate";
  const { entitlement, loading } = useMyEntitlements();

  if (loading) {
    return (
      <div
        data-testid={`${testId}-loading`}
        className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground"
      >
        Checking access…
      </div>
    );
  }

  if (canUseFeature(entitlement, "pheno_tracker")) {
    return <>{children}</>;
  }

  if (
    allowReadOnly &&
    canReadExistingFeatureData(entitlement, "pheno_tracker")
  ) {
    return (
      <div data-testid={`${testId}-readonly`}>
        <div
          data-testid={`${testId}-readonly-banner`}
          className="mb-4 rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          Your Pro plan is inactive. You can still view your existing Pheno
          Tracker records. Resubscribe to create, edit, compare, or export.
          <Link
            to="/upgrade"
            className="ml-2 font-medium text-primary hover:underline"
          >
            Upgrade to Pro
          </Link>
        </div>
        {children}
      </div>
    );
  }

  return (
    <section
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      className="mx-auto mt-8 max-w-2xl rounded-xl border border-border/60 bg-card/40 p-6 text-left"
    >
      <p className="text-xs uppercase tracking-widest text-primary font-medium">
        Pro feature
      </p>
      <h2
        id={`${testId}-title`}
        className="mt-2 flex items-center gap-2 font-display text-xl font-semibold tracking-tight"
      >
        <Sprout className="h-5 w-5 text-primary" aria-hidden="true" />
        Pheno Tracker is a Pro feature.
      </h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Track candidate plants, evidence packets, keeper decisions, replication
        readiness, and post-cure notes. Upgrade to Pro to run real pheno hunts.
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {[
          "Create and score real pheno hunts",
          "Compare candidates side-by-side",
          "Save keeper decisions with your own notes",
          "Preserve replication and post-cure evidence",
          "Export your pheno report",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1 inline-block h-1.5 w-1.5 flex-none rounded-full bg-primary"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link to="/upgrade" data-testid={`${testId}-upgrade-link`}>
          <Button size="lg">Upgrade to Pro</Button>
        </Link>
        {demoHref ? (
          <Link
            to={demoHref}
            data-testid={`${testId}-demo-link`}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            View demo
          </Link>
        ) : null}
      </div>
    </section>
  );
}
