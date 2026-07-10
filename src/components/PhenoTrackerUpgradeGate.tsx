import { type ReactNode, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
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
 *     upgrade card with an Upgrade CTA and an optional "View Pheno Demo" link.
 *
 * The Upgrade CTA carries a `returnTo` search param pointing at the current
 * gated pathname. The billing/success flow does not yet consume it — see
 * follow-up note in `docs/security-regression-tests.md` or the Upgrade page
 * TODO. This is safe: unknown params are ignored today.
 *
 * SAFETY: UI gating only. Write paths must ALSO check
 * `canWriteFeatureData(entitlement, "pheno_tracker")` before firing any
 * Supabase write, and are enforced server-side by RESTRICTIVE RLS backed by
 * `public.has_pheno_tracker_entitlement(auth.uid())`. This component does
 * not accept any client flag override.
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

const FEATURE_BULLETS: ReadonlyArray<string> = [
  "Pheno hunts with candidate evidence",
  "Side-by-side pheno comparison",
  "Keeper decisions with your own notes",
  "Replication readiness signals",
  "Post-harvest and post-cure documentation",
  "Export your pheno report",
];

function buildUpgradeHref(pathname: string): string {
  // Only forward a same-origin, absolute app path. Never forward query, hash,
  // or external URLs. This is defence in depth against redirect abuse.
  // Points at /pricing — the page with LIVE checkout. /upgrade is a dead end
  // (every paddlePriceId there is null, so all paid CTAs are disabled).
  const safe =
    typeof pathname === "string" && pathname.startsWith("/") && !pathname.startsWith("//")
      ? pathname
      : null;
  if (!safe) return "/pricing";
  const params = new URLSearchParams({ returnTo: safe });
  return `/pricing?${params.toString()}`;
}

export default function PhenoTrackerUpgradeGate({
  children,
  allowReadOnly = false,
  demoHref = "/pheno-comparison",
  ...rest
}: PhenoTrackerUpgradeGateProps) {
  const testId = rest["data-testid"] ?? "pheno-tracker-upgrade-gate";
  const { entitlement, loading } = useMyEntitlements();
  const location = useLocation();
  const upgradeHref = useMemo(
    () => buildUpgradeHref(location.pathname),
    [location.pathname],
  );

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
            to={upgradeHref}
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
        Track candidate evidence, compare phenos, preserve keeper decisions,
        and document post-cure results.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Use it to see what changed, what held up after cure, and what deserves
        another run.
      </p>
      <ul className="mt-4 space-y-2 text-sm" data-testid={`${testId}-bullets`}>
        {FEATURE_BULLETS.map((line) => (
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
        <Link to={upgradeHref} data-testid={`${testId}-upgrade-link`}>
          <Button size="lg">Upgrade to Pro</Button>
        </Link>
        {demoHref ? (
          <Link
            to={demoHref}
            data-testid={`${testId}-demo-link`}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            View Pheno Demo
          </Link>
        ) : null}
      </div>
    </section>
  );
}
