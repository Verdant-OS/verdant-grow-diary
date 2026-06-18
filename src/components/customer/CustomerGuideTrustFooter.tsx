/**
 * CustomerGuideTrustFooter — dedicated FAQ + trust section for Customer
 * Mode. Presenter-only. No claims about medical use, potency,
 * compliance, lab verification, or device control.
 */

export const CUSTOMER_GUIDE_TRUST_PRIVACY_COPY =
  "Private grow logs, sensor payloads, raw payloads, and operator notes are not shown.";

export const CUSTOMER_GUIDE_TRUST_TELEMETRY_COPY =
  "This page is not live sensor telemetry.";

export const CUSTOMER_GUIDE_TRUST_BACKEND_COPY =
  "Share-token publishing backend not yet available.";

export interface TrustFooterFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const CUSTOMER_GUIDE_TRUST_FAQ: ReadonlyArray<TrustFooterFaqItem> = [
  {
    id: "what_is_this_guide",
    question: "What is this guide?",
    answer:
      "A customer-facing summary the grower can share. It only shows content the grower has explicitly chosen to publish.",
  },
  {
    id: "is_this_live_sensor_data",
    question: "Is this live sensor data?",
    answer: CUSTOMER_GUIDE_TRUST_TELEMETRY_COPY,
  },
  {
    id: "are_private_grow_logs_shown",
    question: "Are private grow logs shown?",
    answer:
      "No. " + CUSTOMER_GUIDE_TRUST_PRIVACY_COPY,
  },
  {
    id: "are_operator_notes_shown",
    question: "Are operator notes shown?",
    answer:
      "No. Operator notes stay with the grower and are never published to this page.",
  },
  {
    id: "what_does_verdant_do",
    question: "What does Verdant do?",
    answer:
      "Verdant helps growers keep cautious plant memory. The grower decides what is shared and what stays private.",
  },
];

export default function CustomerGuideTrustFooter() {
  return (
    <section
      data-testid="customer-guide-trust-footer"
      aria-labelledby="customer-guide-trust-heading"
      className="rounded-xl border border-border/60 bg-card/60 p-5"
    >
      <h2
        id="customer-guide-trust-heading"
        className="text-base font-semibold tracking-tight"
      >
        Privacy and FAQ
      </h2>

      <div className="mt-3 space-y-2">
        <p
          data-testid="customer-guide-trust-privacy"
          className="text-sm text-muted-foreground"
        >
          {CUSTOMER_GUIDE_TRUST_PRIVACY_COPY}
        </p>
        <p
          data-testid="customer-guide-trust-telemetry"
          className="text-sm text-muted-foreground"
        >
          {CUSTOMER_GUIDE_TRUST_TELEMETRY_COPY}
        </p>
        <p
          data-testid="customer-guide-trust-backend"
          className="text-xs text-amber-300/80"
        >
          {CUSTOMER_GUIDE_TRUST_BACKEND_COPY}
        </p>
      </div>

      <dl className="mt-5 space-y-4">
        {CUSTOMER_GUIDE_TRUST_FAQ.map((item) => (
          <div
            key={item.id}
            data-testid={`customer-guide-trust-faq-${item.id}`}
          >
            <dt className="text-sm font-medium">{item.question}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
