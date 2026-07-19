import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_ACTION_CHIPS,
  RESPONSE_CHECK_STATUSES,
  applyQuickLogActionChip,
  applyResponseCheck,
  actionTextWithoutResponseContext,
  appendQuickLogObservation,
  buildResponseCheckLine,
  hasResponseCheck,
  readResponseCheckStatus,
  responseActionChronologyRank,
  // Legacy exports stay supported while the UI moves to grower-framed copy.
  TEN_SECOND_QUICK_CHECK_STATUSES,
  QUICK_CHECK_DETAIL_CHIPS,
  applyQuickCheckDetailChip,
  applyTenSecondQuickCheck,
  buildQuickCheckLine,
  hasTenSecondQuickCheck,
} from "@/lib/tenSecondQuickCheckRules";

describe("Quick Log action + response rules", () => {
  it("exposes action-first Quick Log chips", () => {
    expect(QUICK_LOG_ACTION_CHIPS).toEqual([
      "Watered",
      "Fed",
      "Photo only",
      "Issue spotted",
      "Environment changed",
      "Training / pruning",
      "Note",
    ]);
  });

  it("exposes Better/Same/Worse as response checks", () => {
    expect(RESPONSE_CHECK_STATUSES).toEqual(["Better", "Same", "Worse"]);
  });

  it("builds a stable response check line", () => {
    expect(buildResponseCheckLine("Better")).toBe("Response check: Better.");
    expect(buildResponseCheckLine("Same")).toBe("Response check: Same.");
    expect(buildResponseCheckLine("Worse")).toBe("Response check: Worse.");
  });

  it("applies a grow action chip to an empty note", () => {
    expect(applyQuickLogActionChip("", "Watered")).toBe("Watered.");
  });

  it("adds action chips without duplicates", () => {
    const one = applyQuickLogActionChip("Watered.", "Fed");
    const two = applyQuickLogActionChip(one, "Fed");
    expect(one).toBe("Watered.\nFed.");
    expect(two).toBe(one);
  });

  it("formats action chips as grow-room notes", () => {
    expect(applyQuickLogActionChip("", "Photo only")).toBe("Photo only.");
    expect(applyQuickLogActionChip("", "Issue spotted")).toBe("Issue spotted.");
    expect(applyQuickLogActionChip("", "Environment changed")).toBe("Environment changed.");
    expect(applyQuickLogActionChip("", "Training / pruning")).toBe("Training / pruning.");
  });

  it("applies response checks without removing action detail", () => {
    expect(applyResponseCheck("Watered.\nRaised light.", "Better")).toBe(
      "Response check: Better.\nWatered.\nRaised light.",
    );
  });

  it("applies a response check to an empty note", () => {
    expect(applyResponseCheck("", "Same")).toBe("Response check: Same.");
  });

  it("replaces an existing response check instead of stacking contradictions", () => {
    const note = "Response check: Worse.\nWatered.";
    expect(applyResponseCheck(note, "Same")).toBe("Response check: Same.\nWatered.");
  });

  it("treats legacy Quick check lines as response checks", () => {
    const note = "Quick check: Worse.\nWatered.";
    expect(applyResponseCheck(note, "Better")).toBe("Response check: Better.\nWatered.");
    expect(hasResponseCheck("Quick check: Same.")).toBe(true);
  });

  it("preserves grower prose that follows an inline response prefix", () => {
    expect(
      applyResponseCheck("Response check: Worse. Leaves perked up after lights-on.", "Same"),
    ).toBe("Response check: Same. Leaves perked up after lights-on.");
  });

  it("removes mid-line and repeated response statuses without losing action prose", () => {
    expect(applyResponseCheck("Watered. Response check: Better.", "Same")).toBe(
      "Response check: Same.\nWatered.",
    );
    expect(applyResponseCheck("Response check: Worse. Response check: Better.", "Same")).toBe(
      "Response check: Same.",
    );
  });

  it("recognizes canonical and legacy response prefixes case-insensitively", () => {
    expect(hasResponseCheck("response CHECK: better! Root zone looks stable.")).toBe(true);
    expect(hasResponseCheck("QUICK check: WORSE. Watching dryback.")).toBe(true);
  });

  it("does not accept a longer word that only starts with a response status", () => {
    expect(hasResponseCheck("Response check: Betterment plan.")).toBe(false);
    expect(applyResponseCheck("Response check: Betterment plan.", "Same")).toBe(
      "Response check: Same.\nResponse check: Betterment plan.",
    );
  });

  it("reads the selected response status from canonical and legacy notes", () => {
    expect(readResponseCheckStatus("Watered. Response check: Better.")).toBe("Better");
    expect(readResponseCheckStatus("Quick check: worse. Watching closely.")).toBe("Worse");
    expect(readResponseCheckStatus("Response check: Betterment plan.")).toBeNull();
  });

  it("keeps explicit action lines while excluding response prose from action detection", () => {
    expect(actionTextWithoutResponseContext("Response check: Better. Watering less helped.")).toBe(
      "",
    );
    expect(actionTextWithoutResponseContext("Response check: Same.\nWatered.")).toBe("Watered.");
    expect(actionTextWithoutResponseContext("Fed. Response check: Better.")).toBe("Fed.");
  });

  it("treats the documented nested Response wrapper as response-only context", () => {
    const note = "Response: Response check: Better. Watering less helped.";
    expect(readResponseCheckStatus(note)).toBe("Better");
    expect(actionTextWithoutResponseContext(note)).toBe("");
    expect(applyResponseCheck(note, "Same")).toBe("Response check: Same. Watering less helped.");
  });

  it("defines one equal-time action/response chronology policy", () => {
    expect(responseActionChronologyRank({ hasAction: true, hasResponse: false })).toBe(0);
    expect(responseActionChronologyRank({ hasAction: true, hasResponse: true })).toBe(1);
    expect(responseActionChronologyRank({ hasAction: false, hasResponse: true })).toBe(2);
    expect(responseActionChronologyRank({ hasAction: false, hasResponse: false })).toBe(3);
  });

  it("starts observations on a new line after a response status", () => {
    expect(appendQuickLogObservation("", "Watered today.")).toBe("Watered today.");
    expect(appendQuickLogObservation("Canopy even.", "Watered today.")).toBe(
      "Canopy even. Watered today.",
    );
    expect(appendQuickLogObservation("Response check: Better.", "Watered today.")).toBe(
      "Response check: Better.\nWatered today.",
    );
  });

  it("detects response checks", () => {
    expect(hasResponseCheck("Response check: Same.")).toBe(true);
    expect(hasResponseCheck("Watered.")).toBe(false);
  });

  it("is deterministic and does not mutate inputs", () => {
    const input = "Watered.";
    const a = applyResponseCheck(input, "Worse");
    const b = applyResponseCheck(input, "Worse");
    expect(a).toBe(b);
    expect(input).toBe("Watered.");
  });
});

describe("legacy ten-second quick check exports", () => {
  it("keeps old exports available as response-check aliases", () => {
    expect(TEN_SECOND_QUICK_CHECK_STATUSES).toEqual(["Better", "Same", "Worse"]);
    expect(QUICK_CHECK_DETAIL_CHIPS).toEqual(QUICK_LOG_ACTION_CHIPS);
    expect(buildQuickCheckLine("Better")).toBe("Response check: Better.");
    expect(applyTenSecondQuickCheck("Watered.", "Same")).toBe("Response check: Same.\nWatered.");
    expect(applyQuickCheckDetailChip("", "Watered")).toBe("Watered.");
    expect(hasTenSecondQuickCheck("Response check: Worse.")).toBe(true);
  });
});
