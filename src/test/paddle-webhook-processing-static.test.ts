import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const WEBHOOK_SRC = readProjectFile("supabase/functions/paddle-webhook/index.ts");
const MAPPER_SRC = readProjectFile("src/lib/paddleEventEntitlementMapperRules.ts");

describe("paddle webhook processing recorder", () => {
  it("keeps raw-body signature verification before JSON parsing and runtime event processing", () => {
    const rawIdx = WEBHOOK_SRC.indexOf("req.text()");
    const verifyIdx = WEBHOOK_SRC.indexOf("constantTimeEqual(expected, parsed.h1)");
    const parseIdx = WEBHOOK_SRC.indexOf("JSON.parse(rawBody)");
    const clientIdx = WEBHOOK_SRC.indexOf("createClient(SUPABASE_URL, SERVICE_ROLE");
    const eventInsertIdx = WEBHOOK_SRC.indexOf('.from("paddle_events").insert');
    const processingCallIdx = WEBHOOK_SRC.indexOf("recordProcessing(supabase, recordedEvent)");

    expect(rawIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(rawIdx);
    expect(parseIdx).toBeGreaterThan(verifyIdx);
    expect(clientIdx).toBeGreaterThan(parseIdx);
    expect(eventInsertIdx).toBeGreaterThan(clientIdx);
    expect(processingCallIdx).toBeGreaterThan(eventInsertIdx);
  });

  it("records processing rows only after paddle_events insert or duplicate fetch", () => {
    expect(WEBHOOK_SRC).toContain("const recordedEvent = insertedEvent as RecordedPaddleEventRow");
    expect(WEBHOOK_SRC).toContain("recordProcessing(supabase, recordedEvent)");
    expect(WEBHOOK_SRC).toContain("fetchExistingPaddleEvent(supabase, eventId)");
    expect(WEBHOOK_SRC).toContain("recordProcessing(supabase, existingEvent)");
    expect(WEBHOOK_SRC).toContain("paddle_event_processing");
    expect(WEBHOOK_SRC).toContain("processing_insert_failed");
  });

  it("treats duplicate paddle_events and duplicate processing rows as safe no-ops", () => {
    const uniqueViolationMatches = WEBHOOK_SRC.match(/23505/g) ?? [];
    expect(uniqueViolationMatches.length).toBeGreaterThanOrEqual(2);
    expect(WEBHOOK_SRC).toContain("duplicate: true");
    expect(WEBHOOK_SRC).toContain("duplicate_fetch_failed");
  });

  it("maps process, ignored, blocked, and failed processing states", () => {
    expect(WEBHOOK_SRC).toContain('baseProcessingPayload(row, "processed"');
    expect(WEBHOOK_SRC).toContain('baseProcessingPayload(row, "ignored"');
    expect(WEBHOOK_SRC).toContain('baseProcessingPayload(row, "blocked"');
    expect(WEBHOOK_SRC).toContain('baseProcessingPayload(row, "failed"');
    expect(WEBHOOK_SRC).toContain("non_granting_transaction_event");
    expect(WEBHOOK_SRC).toContain("adjustment_event_requires_policy");
    expect(WEBHOOK_SRC).toContain("unknown_price_id");
    expect(WEBHOOK_SRC).toContain("ambiguous_price_ids");
    expect(WEBHOOK_SRC).toContain("missing_customer_id");
    expect(WEBHOOK_SRC).toContain("missing_subscription_id");
  });

  it("requires explicit subscription IDs for transaction.completed recurring events", () => {
    expect(WEBHOOK_SRC).toContain("function subscriptionIdFromData");
    expect(WEBHOOK_SRC).toContain('eventType.startsWith("subscription.")');
    expect(WEBHOOK_SRC).not.toContain('firstStringPath(data, [["subscription_id"], ["subscription", "id"], ["id"]])');

    expect(MAPPER_SRC).toContain("function subscriptionIdFromData");
    expect(MAPPER_SRC).toContain('eventType.startsWith("subscription.")');
    expect(MAPPER_SRC).not.toContain('firstStringPath(data, [["subscription_id"], ["subscription", "id"], ["id"]])');
  });

  it("does not directly write entitlement source-of-truth rows", () => {
    expect(WEBHOOK_SRC).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
    expect(WEBHOOK_SRC).not.toMatch(/INSERT\s+INTO\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/UPDATE\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/DELETE\s+FROM\s+public\.billing_subscriptions/i);
    expect(WEBHOOK_SRC).not.toMatch(/UPSERT/i);
    expect(WEBHOOK_SRC).not.toMatch(/grantPro|setPro|isPro\s*=\s*true/i);
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
