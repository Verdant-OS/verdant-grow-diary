/**
 * checkoutOverlaySession — pure module tracking a single in-flight Paddle
 * overlay checkout so that a **close-before-completion** event reliably
 * routes the buyer to /checkout/cancel.
 *
 * Why a module-level tracker:
 *   Paddle.js registers a SINGLE `eventCallback` at `Paddle.Initialize`.
 *   The callback is not per-open, and it is not remounted when React
 *   components re-render. To stay StrictMode-safe (double-invoke of
 *   effects, rapid mount/unmount) we keep exactly one "active session"
 *   here, replace it atomically when a new checkout opens, and expose a
 *   single `handlePaddleCheckoutEvent()` that Paddle's callback can call.
 *
 * SAFETY:
 *   - Never grants entitlement — this only fires a client-side "cancel"
 *     redirect handler. Entitlement remains server-authoritative.
 *   - Handlers are one-shot: once `checkout.completed` or `checkout.closed`
 *     has fired for the session, further events are ignored so a delayed
 *     duplicate event cannot re-navigate the buyer.
 *   - Session id is opaque; callers cannot forge completion for another
 *     session (mismatched ids are ignored).
 */

export type CheckoutSessionId = string;

interface ActiveSession {
  id: CheckoutSessionId;
  onClosedBeforeComplete: () => void;
  completed: boolean;
  settled: boolean; // true once we've dispatched a terminal outcome
}

let counter = 0;
function nextSessionId(): CheckoutSessionId {
  counter += 1;
  return `paddle-checkout-${Date.now().toString(36)}-${counter}`;
}

let active: ActiveSession | null = null;

/**
 * Register a new active checkout session. Any previously active session
 * that hasn't settled is dropped WITHOUT firing its cancel handler — the
 * new open supersedes it (e.g. user clicked a different plan mid-modal).
 */
export function beginCheckoutSession(
  onClosedBeforeComplete: () => void,
): CheckoutSessionId {
  const id = nextSessionId();
  active = {
    id,
    onClosedBeforeComplete,
    completed: false,
    settled: false,
  };
  return id;
}

/** Mark a session completed by id. No-op if id mismatches or session settled. */
export function markCheckoutCompleted(id: CheckoutSessionId): void {
  if (!active || active.id !== id || active.settled) return;
  active.completed = true;
  active.settled = true;
}

/** Test-only: clear the tracker between assertions. */
export function _resetCheckoutOverlaySessionForTests(): void {
  active = null;
  counter = 0;
}

/** Test-only: peek at the current session (or null). */
export function _peekActiveSessionForTests(): Readonly<ActiveSession> | null {
  return active ? { ...active } : null;
}

export interface PaddleCheckoutEventLike {
  name?: string | null;
}

/**
 * Router for Paddle.js `eventCallback` payloads. We only care about the
 * two events that terminate an overlay session:
 *   - `checkout.completed` — mark completed so a subsequent `.closed`
 *      does NOT redirect to /checkout/cancel.
 *   - `checkout.closed`    — if not completed, fire the cancel handler.
 * Anything else is a no-op.
 */
export function handlePaddleCheckoutEvent(
  event: PaddleCheckoutEventLike | null | undefined,
): void {
  if (!active || active.settled) return;
  const name = event?.name;
  if (typeof name !== "string") return;
  if (name === "checkout.completed") {
    active.completed = true;
    active.settled = true;
    return;
  }
  if (name === "checkout.closed") {
    const wasCompleted = active.completed;
    active.settled = true;
    if (!wasCompleted) {
      try {
        active.onClosedBeforeComplete();
      } catch {
        // Handler failures must never bubble into Paddle.js.
      }
    }
  }
}
