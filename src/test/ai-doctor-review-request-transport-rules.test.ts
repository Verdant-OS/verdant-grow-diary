import { describe, expect, it } from "vitest";
import {
  buildAiDoctorReviewRequestEnvelope,
  parseAiDoctorReviewRequestEnvelope,
  stripAiDoctorReviewRequestTransportFields,
} from "@/lib/aiDoctorReviewRequestTransportRules";

const GROW_ID = "11111111-1111-4111-8111-111111111111";
const PACKET = {
  schemaVersion: 1,
  plant: { strain: "Northern Lights" },
};

function createDeepPacket(depth: number): Record<string, unknown> {
  let nested: Record<string, unknown> = { leaf: true };
  for (let index = 0; index < depth; index += 1) {
    nested = { nested };
  }
  return { ...PACKET, nested };
}

function createWidePacket(width: number): Record<string, unknown> {
  return {
    ...PACKET,
    readings: Array.from({ length: width }, (_value, index) => index),
  };
}

describe("AI Doctor review request transport", () => {
  it("puts a valid grow scope beside, not inside, the model-context packet", () => {
    const envelope = buildAiDoctorReviewRequestEnvelope(PACKET, GROW_ID);

    expect(envelope).toEqual({ packet: PACKET, grow_id: GROW_ID });
    expect(envelope.packet).toBe(PACKET);
    expect(PACKET).not.toHaveProperty("grow_id");
  });

  it("omits malformed/demo scope IDs and leaves credit validation server-side", () => {
    expect(buildAiDoctorReviewRequestEnvelope(PACKET, "demo-grow")).toEqual({ packet: PACKET });
    expect(buildAiDoctorReviewRequestEnvelope(PACKET, null)).toEqual({ packet: PACKET });
  });

  it("parses the envelope and strips scope/idempotency fields before prompt assembly", () => {
    const nestedGrowId = "22222222-2222-4222-8222-222222222222";
    const parsed = parseAiDoctorReviewRequestEnvelope({
      packet: {
        ...PACKET,
        context: {
          grow_id: nestedGrowId,
          readings: [{ growId: nestedGrowId, idempotencyKey: "nested-key" }],
        },
      },
      grow_id: GROW_ID,
      idempotency_key: "request-key-123",
    });

    expect(parsed).toEqual({
      packet: {
        ...PACKET,
        context: { readings: [{}] },
      },
      growId: GROW_ID,
      idempotencyKey: "request-key-123",
      format: "envelope",
    });
  });

  it("accepts the prior flat request shape while stripping its transport fields", () => {
    const parsed = parseAiDoctorReviewRequestEnvelope({
      ...PACKET,
      growId: GROW_ID,
      idempotencyKey: "legacy-key-123",
    });

    expect(parsed).toEqual({
      packet: PACKET,
      growId: GROW_ID,
      idempotencyKey: "legacy-key-123",
      format: "legacy",
    });
  });

  it("fails closed on malformed envelopes and never mutates the source packet", () => {
    expect(parseAiDoctorReviewRequestEnvelope(null)).toBeNull();
    expect(parseAiDoctorReviewRequestEnvelope([])).toBeNull();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: [] })).toBeNull();

    const original = {
      ...PACKET,
      grow_id: GROW_ID,
      context: { readings: [{ growId: GROW_ID }] },
    };
    const stripped = stripAiDoctorReviewRequestTransportFields(original);
    expect(stripped).toEqual({ ...PACKET, context: { readings: [{}] } });
    expect(original).toEqual({
      ...PACKET,
      grow_id: GROW_ID,
      context: { readings: [{ growId: GROW_ID }] },
    });
  });

  it("rejects an excessively nested packet without recursing until the runtime overflows", () => {
    const deeplyNestedPacket = createDeepPacket(20_000);

    expect(() => parseAiDoctorReviewRequestEnvelope({ packet: deeplyNestedPacket })).not.toThrow();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: deeplyNestedPacket })).toBeNull();
    expect(stripAiDoctorReviewRequestTransportFields(deeplyNestedPacket)).toBeDefined();
  });

  it("rejects an excessively wide packet without cloning the full pre-credit payload", () => {
    const widePacket = createWidePacket(20_000);

    expect(() => parseAiDoctorReviewRequestEnvelope({ packet: widePacket })).not.toThrow();
    expect(parseAiDoctorReviewRequestEnvelope({ packet: widePacket })).toBeNull();
    const stripped = stripAiDoctorReviewRequestTransportFields(widePacket) as {
      readings?: unknown[];
    };
    expect(stripped.readings?.length).toBeLessThan(20_000);
  });
});
