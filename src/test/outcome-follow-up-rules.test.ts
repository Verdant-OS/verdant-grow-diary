import { describe, it, expect } from "vitest";
import { buildOutcomeFollowUp } from "@/lib/outcomeFollowUpRules";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function iso(hoursAgo: number): string {
  return new Date(NOW - hoursAgo * HOUR).toISOString();
}

describe("outcomeFollowUpRules", () => {
  it("shows follow-up prompt for an action old enough to observe", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "watering", notePreview: "Watered 1L", occurredAt: iso(24) }],
    });
    expect(vm).toMatchObject({
      showPrompt: true,
      reason: "needs_follow_up",
      headline: "Follow up on the last change.",
      body: "How did the plant respond: Better, Same, or Worse?",
      ctaLabel: "Add follow-up check",
      actionSummary: "Watered 1L",
    });
  });

  it("does not show when there is no meaningful action", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "note", notePreview: "Quick check: Same.", occurredAt: iso(24) }],
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("no_action");
  });

  it("does not show when the action is too soon", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "feeding", notePreview: "Fed", occurredAt: iso(2) }],
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("too_soon");
  });

  it("does not show when the action follow-up window expired", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "feeding", notePreview: "Fed", occurredAt: iso(96) }],
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("expired");
  });

  it("does not show when a later Better/Same/Worse check exists", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [
        { eventType: "quick_log", notePreview: "Quick check: Better.", occurredAt: iso(12) },
        { eventType: "watering", notePreview: "Watered 1L", occurredAt: iso(24) },
      ],
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("already_checked");
  });

  it("detects actions from note keywords", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "note", notePreview: "Raised light two inches", occurredAt: iso(18) }],
    });
    expect(vm.showPrompt).toBe(true);
    expect(vm.actionSummary).toBe("Raised light two inches");
  });

  it("keeps copy calm and non-automated", () => {
    const vm = buildOutcomeFollowUp({
      now: NOW,
      rows: [{ eventType: "feeding", notePreview: "Fed", occurredAt: iso(18) }],
    });
    const text = `${vm.headline} ${vm.body} ${vm.ctaLabel}`;
    expect(text).not.toMatch(/urgent|required|must|alert|action queue|automate|turn on|turn off/i);
  });

  it("handles invalid now safely", () => {
    const vm = buildOutcomeFollowUp({
      now: Number.NaN,
      rows: [{ eventType: "feeding", notePreview: "Fed", occurredAt: iso(18) }],
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("invalid_now");
  });
});
