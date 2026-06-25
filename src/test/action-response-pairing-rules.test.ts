import { describe, it, expect } from "vitest";
import { buildActionResponsePairing } from "@/lib/actionResponsePairingRules";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-06-10T12:00:00.000Z");

function iso(daysOffset: number): string {
  return new Date(T0 + daysOffset * DAY).toISOString();
}

describe("actionResponsePairingRules", () => {
  it("pairs a grow action with the first later response check", () => {
    const vm = buildActionResponsePairing({
      rows: [
        { eventType: "quick_log", notePreview: "Watered.", occurredAt: iso(0) },
        { eventType: "quick_log", notePreview: "Response check: Better.", occurredAt: iso(1) },
      ],
    });
    expect(vm).toMatchObject({
      show: true,
      reason: "paired",
      title: "Action → response captured",
      actionLabel: "Watered.",
      responseLabel: "Response check: Better.",
      responseStatus: "Better",
    });
    expect(vm.helper).toContain("plant memory");
  });

  it("shows awaiting-response when a recent action has no later response check", () => {
    const vm = buildActionResponsePairing({
      rows: [{ eventType: "quick_log", notePreview: "Fed.", occurredAt: iso(0) }],
    });
    expect(vm).toMatchObject({
      show: true,
      reason: "awaiting_response",
      title: "Waiting on plant response",
      actionLabel: "Fed.",
      responseLabel: "No response check yet",
      responseStatus: null,
    });
  });

  it("uses the latest action, not an older paired action", () => {
    const vm = buildActionResponsePairing({
      rows: [
        { eventType: "quick_log", notePreview: "Watered.", occurredAt: iso(0) },
        { eventType: "quick_log", notePreview: "Response check: Better.", occurredAt: iso(1) },
        { eventType: "quick_log", notePreview: "Fed.", occurredAt: iso(2) },
      ],
    });
    expect(vm.reason).toBe("awaiting_response");
    expect(vm.actionLabel).toBe("Fed.");
  });

  it("supports legacy Quick check response lines", () => {
    const vm = buildActionResponsePairing({
      rows: [
        { eventType: "quick_log", notePreview: "Raised light.", occurredAt: iso(0) },
        { eventType: "quick_log", notePreview: "Quick check: Same.", occurredAt: iso(1) },
      ],
    });
    expect(vm.reason).toBe("paired");
    expect(vm.responseStatus).toBe("Same");
  });

  it("hides when there are no actions", () => {
    const vm = buildActionResponsePairing({
      rows: [{ eventType: "note", notePreview: "Canopy photo", occurredAt: iso(0) }],
    });
    expect(vm.show).toBe(false);
    expect(vm.reason).toBe("no_action");
  });

  it("hides response-only rows without inventing an action", () => {
    const vm = buildActionResponsePairing({
      rows: [{ eventType: "quick_log", notePreview: "Response check: Worse.", occurredAt: iso(0) }],
    });
    expect(vm.show).toBe(false);
    expect(vm.reason).toBe("response_without_action");
  });

  it("keeps copy calm and non-automated", () => {
    const vm = buildActionResponsePairing({
      rows: [{ eventType: "quick_log", notePreview: "Watered.", occurredAt: iso(0) }],
    });
    const copy = `${vm.title} ${vm.actionLabel} ${vm.responseLabel} ${vm.helper}`;
    expect(copy).not.toMatch(/must|required|alert|action queue|automate|turn on|turn off|guaranteed/i);
  });
});
