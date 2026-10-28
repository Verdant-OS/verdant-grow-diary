import { describe, expect, it } from "vitest";
import {
  matchesTypedQuickLogChild,
  storedQuickLogVolumeMatches,
  type ExpectedTypedQuickLogEvent,
} from "@/lib/quickLogTypedReusedReceiptRules";

const eventId = "77777777-7777-4777-8777-000000000001";

function watering(volumeMl: number): ExpectedTypedQuickLogEvent {
  return {
    id: eventId,
    eventType: "watering",
    growId: "grow-a",
    tentId: "tent-a",
    plantId: "plant-a",
    volumeMl,
  };
}

describe("stored Quick Log volume junk strings", () => {
  it.each([
    ["1e3", 1000],
    ["0x2EE", 750],
    ["Infinity", 1000],
    ["Infinity", 750],
  ] as const)("rejects stored %s against submitted %s", (stored, submitted) => {
    expect(storedQuickLogVolumeMatches(stored, submitted)).toBe(false);
    expect(
      matchesTypedQuickLogChild(watering(submitted), {
        event_id: eventId,
        volume_ml: stored,
      }),
    ).toBe(false);
  });
});
