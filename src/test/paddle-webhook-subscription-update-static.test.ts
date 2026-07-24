import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const WEBHOOK_SRC = readProjectFile("supabase/functions/paddle-webhook/index.ts");

describe("paddle webhook subscription update handoff", () => {
  it("hands off to the reviewed updater RPC only after event storage, processing, and link capture", () => {
    expect(WEBHOOK_SRC).toContain("function applyPaddleSubscriptionUpdate");
    // #234 routes founder candidates to the capped, audited allocation RPC and
    // recurring events to the audited updater — pin the dispatch exactly.
    expect(WEBHOOK_SRC).toMatch(
      /const rpcName = processing\.isFounderCandidate\s*\?\s*"allocate_founder_lifetime_with_audit"\s*:\s*"apply_paddle_subscription_update_with_audit";/,
    );
    expect(WEBHOOK_SRC).toMatch(/await supabase\.rpc\(rpcName,\s*\{\s*p_processing_id: processing\.id,?\s*\}/);

    const eventInsertIdx = WEBHOOK_SRC.indexOf('.from("paddle_events").insert');
    const processingIdx = WEBHOOK_SRC.indexOf("recordProcessing(supabase, recordedEvent)");
    const linkCaptureIdx = WEBHOOK_SRC.indexOf("captureBillingCustomerLink(supabase, recordedEvent)");
    const updateIdx = WEBHOOK_SRC.lastIndexOf("applyPaddleSubscriptionUpdate(supabase, processing, linkCapture)");

    expect(eventInsertIdx).toBeGreaterThan(-1);
    expect(processingIdx).toBeGreaterThan(eventInsertIdx);
    expect(linkCaptureIdx).toBeGreaterThan(processingIdx);
    expect(updateIdx).toBeGreaterThan(linkCaptureIdx);
  });

  it("also preserves duplicate event ordering before updater handoff", () => {
    const duplicateFetchIdx = WEBHOOK_SRC.indexOf("fetchExistingPaddleEvent(supabase, eventId)");
    const processingIdx = WEBHOOK_SRC.indexOf("recordProcessing(supabase, existingEvent)");
    const linkCaptureIdx = WEBHOOK_SRC.indexOf("captureBillingCustomerLink(supabase, existingEvent)");
    const updateIdx = WEBHOOK_SRC.indexOf("applyPaddleSubscriptionUpdate(supabase, processing, linkCapture)");

    expect(duplicateFetchIdx).toBeGreaterThan(-1);
    expect(processingIdx).toBeGreaterThan(duplicateFetchIdx);
    expect(linkCaptureIdx).toBeGreaterThan(processingIdx);
    expect(updateIdx).toBeGreaterThan(linkCaptureIdx);
  });

  it("skips updater calls unless processing is processed and link capture is ready", () => {
    expect(WEBHOOK_SRC).toContain('processing.status !== "processed"');
    expect(WEBHOOK_SRC).toContain("processing_id_missing");
    expect(WEBHOOK_SRC).toContain("linkCaptureReadyForSubscriptionUpdate");
    expect(WEBHOOK_SRC).toContain("link_capture_not_ready");
    expect(WEBHOOK_SRC).toContain('linkCapture.status === "captured"');
    expect(WEBHOOK_SRC).toContain('linkCapture.status === "updated"');
    expect(WEBHOOK_SRC).toContain('linkCapture.status === "duplicate"');
  });

  it("keeps sandbox-only and signature-before-parse order before any update handoff", () => {
    const sandboxIdx = WEBHOOK_SRC.indexOf('PADDLE_ENVIRONMENT !== "sandbox"');
    const rawIdx = WEBHOOK_SRC.indexOf("req.text()");
    const verifyIdx = WEBHOOK_SRC.indexOf("await verifyPaddleWebhookSignature(");
    const parseIdx = WEBHOOK_SRC.indexOf("JSON.parse(rawBody)");
    const updateIdx = WEBHOOK_SRC.indexOf("applyPaddleSubscriptionUpdate(supabase, processing, linkCapture)");

    expect(sandboxIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeGreaterThan(sandboxIdx);
    expect(verifyIdx).toBeGreaterThan(rawIdx);
    expect(parseIdx).toBeGreaterThan(verifyIdx);
    expect(updateIdx).toBeGreaterThan(parseIdx);
  });

  it("does not directly write billing subscriptions from webhook code", () => {
    expect(WEBHOOK_SRC).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(WEBHOOK_SRC).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/\.upsert\(/i);
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
