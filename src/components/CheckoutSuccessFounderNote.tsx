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
import { Link } from "@/lib/react-router-compat";
import { useFounderSlotsRemaining } from "@/hooks/useFounderSlotsRemaining";

export default function CheckoutSuccessFounderNote() {
  const slots = useFounderSlotsRemaining();

  if (slots.status !== "ready" || slots.soldOut) return null;

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
      >
        Compare on Pricing
      </Link>
    </p>
  );
}
