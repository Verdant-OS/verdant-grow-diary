import { LegalPageShell } from "./legal/LegalPageShell";

export default function RefundPolicy() {
  return (
    <LegalPageShell
      title="Refund Policy"
      lastUpdated="July 9, 2026"
      path="/refund"
      description="Verdant Grow Diary refund policy — 30-day money-back guarantee on paid plans, with refunds through Paddle (paddle.net) as Merchant of Record."
    >
      <h2>30-day money-back guarantee</h2>
      <p>
        Verdant Grow Diary (operated by <strong>Matthew Tyler Cheek</strong>)
        offers a <strong>30-day money-back guarantee</strong> on paid
        subscriptions and one-time purchases. If you are not satisfied with
        your purchase, you may request a full refund within 30 days of your
        order date.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Refunds are processed by our payment provider and Merchant of Record,
        Paddle. To request a refund:
      </p>
      <ul>
        <li>
          Visit{" "}
          <a
            href="https://paddle.net"
            target="_blank"
            rel="noopener noreferrer"
          >
            paddle.net
          </a>{" "}
          and look up your order using the email address you used at
          checkout, or
        </li>
        <li>
          Email us at{" "}
          <a href="mailto:support@verdantgrowdiary.com">
            support@verdantgrowdiary.com
          </a>{" "}
          and we will assist you with the refund request.
        </li>
      </ul>

      <h2>What is refundable</h2>
      <ul>
        <li>Monthly and annual Pro subscription fees within the 30-day window.</li>
        <li>One-time purchases (including Founder Lifetime) within the 30-day window.</li>
      </ul>

      <h2>Subscription cancellation</h2>
      <p>
        You can cancel a recurring subscription at any time via the payment
        provider's customer portal. Cancellation stops future renewals; you
        retain access to paid features until the end of the current billing
        period.
      </p>

      <h2>Questions</h2>
      <p>
        For any refund or billing question, email{" "}
        <a href="mailto:support@verdantgrowdiary.com">
          support@verdantgrowdiary.com
        </a>
        . Refund mechanics are additionally governed by{" "}
        <a
          href="https://www.paddle.com/legal/refund-policy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Paddle's Refund Policy
        </a>
        .
      </p>
    </LegalPageShell>
  );
}