import { describe, expect, it } from "vitest";
import type { QuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";
import {
  matchesTypedQuickLogChild,
  storedQuickLogVolumeMatches,
  type ExpectedTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptRules";
import { matchesReusedWaterReceipt } from "@/lib/quickLogWaterReceiptRules";

const eventId = "77777777-7777-4777-8777-000000000001";
const expected: ExpectedTypedQuickLogEvent = {
  id: eventId,
  eventType: "watering",
  growId: "grow-a",
  tentId: "tent-a",
  plantId: "plant-a",
  volumeMl: 750,
};

const payload: QuickLogV2SavePayload = {
  p_target_type: "plant",
  p_target_id: "33333333-3333-4333-8333-333333333333",
  p_action: "water",
  p_volume_ml: 250,
  p_note: null,
  p_temperature_c: null,
  p_humidity_pct: null,
  p_vpd_kpa: null,
  p_occurred_at: null,
  p_idempotency_key: "water-retry-key",
};

const waterEvent = {
  id: eventId,
  event_type: "watering",
  source: "manual",
  is_deleted: false,
  grow_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  plant_id: payload.p_target_id,
  tent_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  occurred_at: "2026-10-12T03:00:00.000Z",
  note: null,
};

describe("stored Quick Log volume receipts", () => {
  it("treats a PostgREST numeric string as the same submitted volume", () => {
    expect(storedQuickLogVolumeMatches("750", 750)).toBe(true);
    expect(storedQuickLogVolumeMatches("750.00", 750)).toBe(true);
    expect(storedQuickLogVolumeMatches(750, 750)).toBe(true);
    expect(storedQuickLogVolumeMatches(null, null)).toBe(true);
    expect(matchesTypedQuickLogChild(expected, { event_id: eventId, volume_ml: "750" })).toBe(true);
    expect(matchesTypedQuickLogChild(expected, { event_id: eventId, volume_ml: "750.0" })).toBe(
      true,
    );
    expect(
      matchesReusedWaterReceipt(payload, eventId, waterEvent, {
        event_id: eventId,
        volume_ml: "250",
      }),
    ).toBe(true);
    expect(
      matchesReusedWaterReceipt(payload, eventId, waterEvent, {
        event_id: eventId,
        volume_ml: "250.0",
      }),
    ).toBe(true);
  });

  it("still rejects a different volume and non-numeric junk", () => {
    expect(storedQuickLogVolumeMatches("749", 750)).toBe(false);
    expect(storedQuickLogVolumeMatches("750ml", 750)).toBe(false);
    expect(storedQuickLogVolumeMatches("  ", 750)).toBe(false);
    expect(storedQuickLogVolumeMatches(true, 1)).toBe(false);
    expect(storedQuickLogVolumeMatches("750", null)).toBe(false);
    expect(storedQuickLogVolumeMatches(null, 750)).toBe(false);
    expect(matchesTypedQuickLogChild(expected, { event_id: eventId, volume_ml: "749" })).toBe(
      false,
    );
    expect(
      matchesReusedWaterReceipt(payload, eventId, waterEvent, {
        event_id: eventId,
        volume_ml: "251",
      }),
    ).toBe(false);
  });
});
