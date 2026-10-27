import type { ReactNode } from "react";

/**
 * Stable stand-in for a route that is not ready yet.
 *
 * The screen keeps its height and a readable status. The visible rows are
 * placeholders. The exact "Loading…" string stays for assistive tech and for
 * the auth-gate tests that already assert it; it is not the only thing on
 * the screen.
 */
export default function RouteTransitionSkeleton({
  label,
  testId = "route-transition-skeleton",
  children,
}: {
  label: string;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid={testId}
      className="min-h-[60vh] w-full bg-background px-4 py-8 md:px-8"
    >
      <span className="sr-only">Loading…</span>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-48 rounded-md bg-muted" />
        <div className="h-24 w-full rounded-xl bg-muted/80" />
        <div className="h-24 w-full rounded-xl bg-muted/60" />
      </div>
      {children}
    </div>
  );
}
