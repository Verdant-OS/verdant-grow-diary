/**
 * FoundersHeroCounter — "N of 100 claimed" scarcity counter.
 *
 * Reads the seats-consumed source of truth via the existing
 * `founder-slots-remaining` edge function, which now proxies
 * `founder_lifetime_slots_remaining()` — updated in Turn A.1 to derive
 * from `founders_seats_consumed()` (all rows, any status). A refunded
 * seat therefore stays "claimed" here, matching the sold-out check and
 * the slots-remaining check.
 */
import { useFounderSlotsRemaining } from "@/hooks/useFounderSlotsRemaining";
import { FOUNDER_LIFETIME_LIMIT } from "@/constants/pricing";

export default function FoundersHeroCounter() {
  const state = useFounderSlotsRemaining();

  if (state.status === "loading") {
    return (
      <span
        data-testid="founders-hero-counter"
        data-state="loading"
        className="text-sm text-muted-foreground"
      >
        Loading availability…
      </span>
    );
  }

  if (state.status !== "ready" || state.claimed === null) {
    return (
      <span
        data-testid="founders-hero-counter"
        data-state="unknown"
        className="text-sm text-muted-foreground"
      >
        Limited to the first {FOUNDER_LIFETIME_LIMIT} founders.
      </span>
    );
  }

  return (
    <span
      data-testid="founders-hero-counter"
      data-state="ready"
      data-claimed={state.claimed}
      data-total={state.total}
      className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
    >
      <strong className="text-primary">
        {state.claimed} of {state.total}
      </strong>
      <span className="text-muted-foreground">claimed</span>
    </span>
  );
}
