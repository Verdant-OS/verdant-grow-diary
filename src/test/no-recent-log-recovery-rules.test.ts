import { describe, it, expect } from "vitest";
import { buildNoRecentLogRecovery } from "@/lib/noRecentLogRecoveryRules";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");

describe("noRecentLogRecoveryRules", () => {
  it("shows the calm quick-check prompt when there are no rows", () => {
    const vm = buildNoRecentLogRecovery({ rows: [], now: NOW });
    expect(vm).toMatchObject({
      showPrompt: true,
      reason: "no_activity",
      headline: "No recent check-in.",
      body: "Add a 10-second status: Better, Same, or Worse.",
      ctaLabel: "Add quick check",
      ariaLabel: "Add a ten-second Quick Log check",
    });
  });

  it("shows the prompt when the latest row is older than the threshold", () => {
    const vm = buildNoRecentLogRecovery({
      rows: [{ occurredAt: "2026-06-06T11:00:00.000Z" }],
      now: NOW,
      staleAfterHours: 72,
    });
    expect(vm.showPrompt).toBe(true);
    expect(vm.reason).toBe("stale_activity");
  });

  it("does not show the prompt when recent activity exists", () => {
    const vm = buildNoRecentLogRecovery({
      rows: [{ occurredAt: "2026-06-10T10:00:00.000Z" }],
      now: NOW,
      staleAfterHours: 72,
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("recent_activity");
  });

  it("uses the newest valid timestamp across rows", () => {
    const vm = buildNoRecentLogRecovery({
      rows: [
        { occurredAt: "2026-06-01T10:00:00.000Z" },
        { occurredAt: "2026-06-10T10:00:00.000Z" },
      ],
      now: NOW,
      staleAfterHours: 72,
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("recent_activity");
  });

  it("treats only invalid timestamps as no activity", () => {
    const vm = buildNoRecentLogRecovery({
      rows: [{ occurredAt: "not-a-date" }, { occurredAt: null }],
      now: NOW,
    });
    expect(vm.showPrompt).toBe(true);
    expect(vm.reason).toBe("no_activity");
  });

  it("does not show prompt when now is invalid", () => {
    const vm = buildNoRecentLogRecovery({
      rows: [],
      now: Number.NaN,
    });
    expect(vm.showPrompt).toBe(false);
    expect(vm.reason).toBe("invalid_now");
  });

  it("does not introduce urgent or guilt-based copy", () => {
    const vm = buildNoRecentLogRecovery({ rows: [], now: NOW });
    const copy = `${vm.headline} ${vm.body} ${vm.ctaLabel}`;
    expect(copy).not.toMatch(/warning|overdue|required|urgent|failed|must/i);
  });
});
