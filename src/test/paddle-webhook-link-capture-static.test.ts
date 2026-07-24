import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const WEBHOOK_SRC = readProjectFile("supabase/functions/paddle-webhook/index.ts");

describe("paddle webhook billing customer link capture", () => {
  it("uses the pure capture helper after verified event storage", () => {
    expect(WEBHOOK_SRC).toContain("buildBillingCustomerLinkCapturePlan");
    expect(WEBHOOK_SRC).toContain("function buildLinkCapturePlan");
    expect(WEBHOOK_SRC).toContain("captureBillingCustomerLink(supabase, recordedEvent)");
    expect(WEBHOOK_SRC).toContain("captureBillingCustomerLink(supabase, existingEvent)");

    const eventInsertIdx = WEBHOOK_SRC.indexOf('.from("paddle_events").insert');
    const processingIdx = WEBHOOK_SRC.indexOf("recordProcessing(supabase, recordedEvent)");
    const linkCaptureIdx = WEBHOOK_SRC.indexOf("captureBillingCustomerLink(supabase, recordedEvent)");

    expect(eventInsertIdx).toBeGreaterThan(-1);
    expect(processingIdx).toBeGreaterThan(eventInsertIdx);
    expect(linkCaptureIdx).toBeGreaterThan(processingIdx);
  });

  it("captures links only from signed payload metadata and provider fields", () => {
    expect(WEBHOOK_SRC).toContain("customDataCandidates");
    expect(WEBHOOK_SRC).toContain("metadataUserIds");
    expect(WEBHOOK_SRC).toContain("verdant_user_id");
    expect(WEBHOOK_SRC).toContain("auth_user_id");
    expect(WEBHOOK_SRC).toContain("providerCustomerId: firstStringPath(data, [[\"customer_id\"], [\"customer\", \"id\"]])");
    expect(WEBHOOK_SRC).toContain("providerSubscriptionId: subscriptionIdFromData(data, row.event_type)");
    expect(WEBHOOK_SRC).toContain("providerCheckoutId: providerCheckoutIdFromData(data)");

    expect(WEBHOOK_SRC).not.toMatch(/email/i);
    expect(WEBHOOK_SRC).not.toMatch(/checkout-success|success-page|URLSearchParams|req\.url/);
    expect(WEBHOOK_SRC).not.toMatch(/headers\.get\(["']x-user-id["']\)/i);
  });

  it("blocks missing, ambiguous, or conflicting attribution instead of reassigning links", () => {
    expect(WEBHOOK_SRC).toContain("ambiguous_user_id");
    expect(WEBHOOK_SRC).toContain("conflicting_customer_link");
    expect(WEBHOOK_SRC).toContain("existingRow.user_id !== payload.user_id");
    expect(WEBHOOK_SRC).not.toMatch(/\.upsert\(/);
  });

  it("writes only the billing customer link table and never entitlement rows", () => {
    expect(WEBHOOK_SRC).toContain('.from("billing_customer_links")');
    expect(WEBHOOK_SRC).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(WEBHOOK_SRC).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/grantPro|setPro|isPro\s*=\s*true/i);
  });

  it("keeps raw-body signature verification before JSON parsing, processing, and link capture", () => {
    const rawIdx = WEBHOOK_SRC.indexOf("req.text()");
    const verifyIdx = WEBHOOK_SRC.indexOf("await verifyPaddleWebhookSignature(");
    const parseIdx = WEBHOOK_SRC.indexOf("JSON.parse(rawBody)");
    const eventInsertIdx = WEBHOOK_SRC.indexOf('.from("paddle_events").insert');
    const processingIdx = WEBHOOK_SRC.indexOf("recordProcessing(supabase, recordedEvent)");
    const linkCaptureIdx = WEBHOOK_SRC.indexOf("captureBillingCustomerLink(supabase, recordedEvent)");

    expect(rawIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(rawIdx);
    expect(parseIdx).toBeGreaterThan(verifyIdx);
    expect(eventInsertIdx).toBeGreaterThan(parseIdx);
    expect(processingIdx).toBeGreaterThan(eventInsertIdx);
    expect(linkCaptureIdx).toBeGreaterThan(processingIdx);
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
      expect(WEBHOOK_SRC).not.toContain(forbidden);
    }
  });
});
