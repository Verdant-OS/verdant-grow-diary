import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PAGE = readProjectFile("src/pages/OperatorPaddleProcessingAudit.tsx");
const VIEW_MODEL = readProjectFile("src/lib/billingCustomerLinkAuditViewModel.ts");

describe("operator Paddle link audit visibility", () => {
  it("calls only the sanitized billing link operator audit RPC", () => {
    expect(PAGE).toContain("billing_customer_link_operator_audit");
    expect(PAGE).toContain("parseBillingCustomerLinkAuditResponse");
    expect(PAGE).toContain("Billing link capture");
    expect(PAGE).not.toMatch(/\.from\(["']billing_customer_links["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("does not mutate link or entitlement rows from the operator page", () => {
    for (const src of [PAGE, VIEW_MODEL]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
      expect(src).not.toMatch(/grantPro|setPro|isPro\s*=\s*true/i);
    }
  });

  it("renders only presence flags for provider identifiers", () => {
    expect(PAGE).toContain("hasCustomerId");
    expect(PAGE).toContain("hasSubscriptionId");
    expect(PAGE).toContain("hasCheckoutId");
    expect(PAGE).toContain("hasEventReference");
    expect(PAGE).not.toContain("provider_customer_id");
    expect(PAGE).not.toContain("provider_subscription_id");
    expect(PAGE).not.toContain("provider_checkout_id");
    expect(PAGE).not.toContain("last_paddle_event_id");
    expect(VIEW_MODEL).not.toContain("provider_customer_id");
    expect(VIEW_MODEL).not.toContain("provider_subscription_id");
    expect(VIEW_MODEL).not.toContain("provider_checkout_id");
    expect(VIEW_MODEL).not.toContain("last_paddle_event_id");
  });

  it("keeps the existing processing audit visible", () => {
    expect(PAGE).toContain("paddle_event_processing_operator_audit");
    expect(PAGE).toContain("Event processing");
    expect(PAGE).toContain("Latest processing rows");
  });

  it("does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "raw_payload",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(PAGE).not.toContain(forbidden);
      expect(VIEW_MODEL).not.toContain(forbidden);
    }
  });
});
