/**
 * PremiumLiveSensorGate
 *
 * Reusable, server-authoritative gate wrapper for FUTURE premium
 * live-sensor surfaces. Renders `children` ONLY when the server-side
 * `live-sensor-entitlement` edge function has returned `ok: true`.
 *
 * V0 safety contract:
 *  - Never reads or trusts client-side entitlement hooks or the live
 *    sensor capability flag. The server gate is the authority.
 *  - Never renders premium children before the server says `allowed`.
 *  - Loading, denied, invalid_request, and network_error states show
 *    safe, screen-reader-friendly copy with text labels (not icon-only).
 *  - No fake-live, automation, or device-control copy.
 *  - No DB writes, no sensor ingest, no AI calls.
 *
 * Two usage modes:
 *  1. Auto-fetch (default): pass `surface` + optional `scope`. The
 *     component runs the hook internally.
 *  2. Injected state (preferred for tests / Storybook): pass `state` and
 *     `result` directly; the component skips the hook entirely.
 *
 * Currently no premium live-sensor surface ships in production; this
 * component exists so any future surface MUST route through it.
 */
import { type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LIVE_SENSOR_PAYWALL_HEADLINE,
  LIVE_SENSOR_PAYWALL_UPGRADE_COPY,
  useLiveSensorServerGate,
  type LiveSensorGateResult,
  type LiveSensorGateState,
  type LiveSensorScope,
  type LiveSensorSurface,
} from "@/hooks/useLiveSensorServerGate";

export interface PremiumLiveSensorGateProps {
  surface: LiveSensorSurface;
  scope?: LiveSensorScope;
  children: ReactNode;
  /** Optional override rendered for any non-allowed state. */
  fallback?: ReactNode;
  /** Accessible label for the loading skeleton region. */
  skeletonLabel?: string;
  /**
   * Test/Storybook escape hatch. When provided, the hook is NOT called
   * and this state is used directly. Keeps unit tests deterministic.
   */
  state?: LiveSensorGateState;
  result?: LiveSensorGateResult | null;
}

export const PREMIUM_LIVE_SENSOR_INVALID_COPY =
  "Live sensor request was invalid. Please reload and try again.";
export const PREMIUM_LIVE_SENSOR_NETWORK_COPY =
  "Could not verify live sensor access right now. Please check your connection and retry.";

function PaywallBlock() {
  return (
    <div
      role="region"
      aria-label="Live sensor upgrade required"
      className="rounded-md border border-border bg-muted/40 p-4 text-sm"
    >
      <h3 className="text-base font-semibold text-foreground">
        {LIVE_SENSOR_PAYWALL_HEADLINE}
      </h3>
      <p className="mt-1 text-muted-foreground">
        {LIVE_SENSOR_PAYWALL_UPGRADE_COPY}
      </p>
    </div>
  );
}

function InvalidBlock() {
  return (
    <div
      role="alert"
      className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground"
    >
      {PREMIUM_LIVE_SENSOR_INVALID_COPY}
    </div>
  );
}

function NetworkErrorBlock() {
  return (
    <div
      role="alert"
      className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground"
    >
      {PREMIUM_LIVE_SENSOR_NETWORK_COPY}
    </div>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="space-y-2"
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function PremiumLiveSensorGate({
  surface,
  scope,
  children,
  fallback,
  skeletonLabel = "Checking live sensor access…",
  state: injectedState,
  result: injectedResult,
}: PremiumLiveSensorGateProps) {
  // When state is injected (tests/stories), don't run the hook.
  // Otherwise call the hook unconditionally to honor Rules of Hooks.
  const hookValue = useLiveSensorServerGate(
    surface,
    injectedState ? {} : (scope ?? {}),
  );
  const state: LiveSensorGateState = injectedState ?? hookValue.state;
  const result: LiveSensorGateResult | null =
    injectedResult ?? hookValue.result;

  if (state === "loading") return <LoadingBlock label={skeletonLabel} />;
  if (state === "allowed" && result?.ok === true) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  if (state === "invalid_request") return <InvalidBlock />;
  if (state === "network_error") return <NetworkErrorBlock />;
  return <PaywallBlock />;
}

export default PremiumLiveSensorGate;
