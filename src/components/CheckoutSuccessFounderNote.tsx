/**
 * CheckoutSuccessFounderNote — calm availability note for a just-confirmed
 * Pro subscriber, pointing at Founder Lifetime.
 *
 * Deliberately NOT a scarcity counter. Seconds after payment is the worst
 * moment to tell someone they could have paid once — a countdown here invites
 * buyer's remorse, refunds, and disputes. So this is option-awareness only:
 * no slot number, no urgency language, no digits at all (pinned by test).
 *
 * Renders only when every one of these holds:
 *  - the caller mounted it (CheckoutSuccess does so only for a CONFIRMED
 *    pro_monthly / pro_annual buyer — Craft is a higher tier and Founder
 *    already owns lifetime, so both must never see this), and
 *  - the live slot state is READY and not sold out. `loading`/`unknown`
 *    render nothing: an availability claim we cannot verify is not made.
 *
 * The link lands on Pricing with Founder preselected (`?plan=` is the
 * canonical preselect contract). Navigation only — nothing is purchased,
 * changed, or cancelled from here.
 */
import { useEffect, useRef } from "react";
import { Link } from "@/lib/react-router-compat";
import { useFounderSlotsRemaining } from "@/hooks/useFounderSlotsRemaining";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

export default function CheckoutSuccessFounderNote() {
  const slots = useFounderSlotsRemaining();
  const visible = slots.status === "ready" && !slots.soldOut;

  // Impression, once per mount, only when the note is actually shown.
  //
  // A child effect here cannot precede the parent's subscription_activated
  // (unlike the low-credit impression, which had to move to its parent):
  // visibility requires the slot fetch to resolve, so this effect's dep only
  // becomes true on a render AFTER the mount burst where the parent's
  // milestone effects fire. Documented so the ordering reads as considered,
  // not missed.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!visible || viewedRef.current) return;
    viewedRef.current = true;
    trackFunnelEvent("founder_note_viewed", { surface: "checkout_success" });
  }, [visible]);

  if (!visible) return null;

  return (
    <p
      className="mt-6 text-sm text-muted-foreground"
      data-testid="checkout-success-founder-note"
    >
      Prefer one payment over a subscription? Founder Lifetime is still open —
      pay once, keep your plan for good.{" "}
      <Link
        to="/pricing?plan=founder_lifetime"
        data-testid="checkout-success-founder-note-link"
        className="font-medium text-primary underline underline-offset-4"
        onClick={() => trackFunnelEvent("founder_note_clicked", { surface: "checkout_success" })}
      >
        Compare on Pricing
      </Link>
    </p>
  );
}
