/**
 * Static safety guards for the Operator subscription updater audit page.
 * Proves the page does not surface raw provider IDs, payloads, or details
 * JSON, does not read/write entitlement source-of-truth tables, and does
 * not touch grow-room/operating-loop surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PAGE = read("src/pages/OperatorBillingSubscriptionUpdateAudit.tsx");
const APP = read("src/App.tsx");
const PADDLE_PAGE = read("src/pages/OperatorPaddleProcessingAudit.tsx");

describe("Operator subscription updater audit page — static safety", () => {
  it("calls the sanitized operator RPC only", () => {
    expect(PAGE).toContain("billing_subscription_update_operator_audit");
    expect(PAGE).not.toMatch(/\.from\(["']billing_subscription_update_audit["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']paddle_events["']\)/);
    expect(PAGE).not.toMatch(/\.from\(["']paddle_event_processing["']\)/);
    expect(PAGE).not.toMatch(/functions\.invoke/);
  });

  it("does not perform any client writes", () => {
    for (const op of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(PAGE).not.toContain(op);
    }
  });

  it("does not surface raw provider IDs, payloads, or details JSON", () => {
    for (const forbidden of [
      "provider_customer_id",
      "provider_subscription_id",
      "provider_price_id",
      "raw_payload",
      "payload",
      "details",
      "event_id",
      "processing_id",
    ]) {
      expect(PAGE).not.toContain(forbidden);
    }
  });

  it("does not touch grow-room operating-loop or device-control surfaces", () => {
    for (const forbidden of [
      "sensor_readings",
      "action_queue",
      "ai_doctor_sessions",
      "grow_events",
      "diary_entries",
      "alerts",
      "tents",
      "plants",
      "grows",
      "mqtt",
      "device_control",
      "device-control",
    ]) {
      expect(PAGE).not.toContain(forbidden);
    }
  });

  it("registers an operator-only route, not a customer/billing route", () => {
    expect(APP).toContain("OperatorBillingSubscriptionUpdateAudit");
    expect(APP).toContain("/operator/billing-subscription-updates");
    expect(APP).not.toContain("/billing/subscription-updates");
    expect(APP).not.toContain("/customer/subscription-updates");
  });

  it("Paddle processing audit page links to the subscription updater audit", () => {
    expect(PADDLE_PAGE).toContain("/operator/billing-subscription-updates");
    expect(PADDLE_PAGE).toContain("View subscription updater audit");
  });

  it("labels the page as Operator Mode and uses sanitized empty/error copy", () => {
    expect(PAGE).toContain("Operator Mode");
    expect(PAGE).toContain("No subscription updater audit rows found for this window.");
    expect(PAGE).toContain("Subscription updater audit unavailable.");
  });
});
