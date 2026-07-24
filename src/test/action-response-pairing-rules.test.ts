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

  it("does not parse a longer word as a response status", () => {
    const vm = buildActionResponsePairing({
      rows: [
        { eventType: "quick_log", notePreview: "Watered.", occurredAt: iso(0) },
        {
          eventType: "note",
          notePreview: "Response check: Betterment plan.",
          occurredAt: iso(1),
        },
      ],
    });
    expect(vm.reason).toBe("awaiting_response");
    expect(vm.responseStatus).toBeNull();
  });

  it("treats a mixed response and action row as the latest action awaiting follow-up", () => {
    const vm = buildActionResponsePairing({
      rows: [
        { id: "old", eventType: "quick_log", notePreview: "Watered.", occurredAt: iso(0) },
        {
          id: "mixed",
          eventType: "quick_log",
          notePreview: "Response check: Better.\nFed.",
          occurredAt: iso(1),
        },
      ],
    });
    expect(vm.reason).toBe("awaiting_response");
    expect(vm.actionLabel).toBe("Fed.");
    expect(vm.responseStatus).toBeNull();
  });

  it("orders an equal-time action before its response deterministically", () => {
    const action = {
      id: "action",
      eventType: "quick_log",
      notePreview: "Watered.",
      occurredAt: iso(0),
    };
    const response = {
      id: "response",
      eventType: "quick_log",
      notePreview: "Response check: Better.",
      occurredAt: iso(0),
    };

    for (const rows of [
      [action, response],
      [response, action],
    ]) {
      const vm = buildActionResponsePairing({ rows });
      expect(vm.reason).toBe("paired");
      expect(vm.actionLabel).toBe("Watered.");
      expect(vm.responseStatus).toBe("Better");
    }
  });

  it("orders an equal-time mixed row before a response-only row regardless of ids", () => {
    for (const [mixedId, responseId] of [
      ["a", "z"],
      ["z", "a"],
    ]) {
      const vm = buildActionResponsePairing({
        rows: [
          {
            id: mixedId,
            eventType: "quick_log",
            notePreview: "Response check: Same.\nFed.",
            occurredAt: iso(0),
          },
          {
            id: responseId,
            eventType: "quick_log",
            notePreview: "Response check: Better.",
            occurredAt: iso(0),
          },
        ],
      });
      expect(vm.reason).toBe("paired");
      expect(vm.actionLabel).toBe("Fed.");
      expect(vm.responseStatus).toBe("Better");
    }
  });

  it("does not classify response prose as a new action", () => {
    const vm = buildActionResponsePairing({
      rows: [
        {
          id: "response",
          eventType: "quick_log",
          notePreview: "Response check: Better. Watering less helped.",
          occurredAt: iso(0),
        },
      ],
    });
    expect(vm.show).toBe(false);
    expect(vm.reason).toBe("response_without_action");
  });

  it("does not classify nested Response wrapper prose as a new action", () => {
    const vm = buildActionResponsePairing({
      rows: [
        {
          eventType: "quick_log",
          notePreview: "Response: Response check: Better. Watering less helped.",
          occurredAt: iso(0),
        },
      ],
    });
    expect(vm.show).toBe(false);
    expect(vm.reason).toBe("response_without_action");
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
    expect(copy).not.toMatch(
      /must|required|alert|action queue|automate|turn on|turn off|guaranteed/i,
    );
  });
});
