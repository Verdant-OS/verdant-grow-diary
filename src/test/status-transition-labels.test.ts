/**
 * Friction item 10 (field-notebook walk, 2026-11-19): history rows showed raw
 * tokens like "pending_approval → cancelled".
 */
import { describe, expect, it } from "vitest";
import {
  formatStatusTransition,
  formatStatusWord,
  STATUS_WORDS,
} from "@/lib/statusTransitionLabelRules";

describe("formatStatusWord", () => {
  it("names every action and alert status in words", () => {
    expect(formatStatusWord("pending_approval")).toBe("Waiting for approval");
    expect(formatStatusWord("cancelled")).toBe("Cancelled");
    expect(formatStatusWord("open")).toBe("Open");
    expect(formatStatusWord("acknowledged")).toBe("Acknowledged");
    expect(formatStatusWord("resolved")).toBe("Resolved");
    expect(formatStatusWord("dismissed")).toBe("Dismissed");
    for (const word of Object.values(STATUS_WORDS)) expect(word).not.toMatch(/_/);
  });

  it("turns unknown tokens into sentence case, never 'Pending review'", () => {
    expect(formatStatusWord("some_new_state")).toBe("Some new state");
    expect(formatStatusWord("AUTO-CLOSED")).toBe("Auto closed");
  });

  it("shows a dash when the status is missing", () => {
    expect(formatStatusWord(null)).toBe("—");
    expect(formatStatusWord(undefined)).toBe("—");
    expect(formatStatusWord("   ")).toBe("—");
  });

  it("matches known statuses case-insensitively", () => {
    expect(formatStatusWord(" Resolved ")).toBe("Resolved");
  });
});

describe("formatStatusTransition", () => {
  it("walk repro: pending_approval → cancelled reads as words", () => {
    expect(formatStatusTransition("pending_approval", "cancelled")).toBe(
      "Waiting for approval → Cancelled",
    );
  });

  it("keeps the dash for a first event with no previous status", () => {
    expect(formatStatusTransition(null, "open")).toBe("— → Open");
  });
});
