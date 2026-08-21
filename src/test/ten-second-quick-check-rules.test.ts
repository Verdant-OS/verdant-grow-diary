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
  removeChipAuthoredResponseLine,
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

  it("recognizes legacy Quick check lines without treating them as chip-owned", () => {
    const note = "Quick check: Worse.\nWatered.";
    expect(applyResponseCheck(note, "Better")).toBe(`Response check: Better.\n${note}`);
    expect(hasResponseCheck("Quick check: Same.")).toBe(true);
  });

  it("preserves grower prose that follows an inline response prefix", () => {
    expect(
      applyResponseCheck("Response check: Worse. Leaves perked up after lights-on.", "Same"),
    ).toBe("Response check: Same.\nResponse check: Worse. Leaves perked up after lights-on.");
  });

  it("adds one canonical chip line without rewriting marker-looking grower prose", () => {
    const prose = [
      "Previous response check: better after watering.",
      "Quick check: Worse. might have been heat stress.",
    ].join("\n");

    expect(applyResponseCheck(prose, "Same")).toBe(`Response check: Same.\n${prose}`);
  });

  it("preserves mid-line and repeated response-looking grower prose", () => {
    const midLine = "Watered. Response check: Better.";
    const repeated = "Response check: Worse. Response check: Better.";
    expect(applyResponseCheck(midLine, "Same")).toBe(`Response check: Same.\n${midLine}`);
    expect(applyResponseCheck(repeated, "Same")).toBe(`Response check: Same.\n${repeated}`);
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
    expect(applyResponseCheck(note, "Same")).toBe(`Response check: Same.\n${note}`);
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

describe("removeChipAuthoredResponseLine", () => {
  it("removes only the canonical bytes, keeping prose the grower added to that line", () => {
    // The chip writes "Response check: Better."; the grower extends the same
    // line. Deleting the line would take their words; leaving the line whole
    // would carry the marker onto whatever plant comes next.
    expect(removeChipAuthoredResponseLine("Response check: Better. after watering", "Better")).toBe(
      "after watering",
    );
    expect(
      removeChipAuthoredResponseLine(
        "Response check: Worse. leaves perked up\nRunoff clear.",
        "Worse",
      ),
    ).toBe("leaves perked up\nRunoff clear.");
  });

  it("refuses a first line that only resembles the chip's — prefix, not substring", () => {
    // Ownership is an exact-prefix test against the canonical literal, so a
    // grower's own sentence is never claimed, whatever it looks like.
    expect(
      removeChipAuthoredResponseLine("Previous response check: better after watering", "Better"),
    ).toBe("Previous response check: better after watering");
    expect(removeChipAuthoredResponseLine("Quick check: Better.\nWatered.", "Better")).toBe(
      "Quick check: Better.\nWatered.",
    );
  });

  it("drops the line entirely when the marker was all it held", () => {
    expect(removeChipAuthoredResponseLine("Response check: Same.\nRunoff clear.", "Same")).toBe(
      "Runoff clear.",
    );
    expect(removeChipAuthoredResponseLine("Response check: Same.", "Same")).toBe("");
  });

  it("returns everything after the first line byte-for-byte", () => {
    const rest = "Runoff clear.\n\n  Indented note with  double  spaces.";
    expect(removeChipAuthoredResponseLine(`Response check: Worse.\n${rest}`, "Worse")).toBe(rest);
  });

  it("never touches a marker-shaped sentence on a later line", () => {
    const note = "Response check: Better.\nPrevious response check: better after watering.";
    expect(removeChipAuthoredResponseLine(note, "Better")).toBe(
      "Previous response check: better after watering.",
    );
  });

  it("leaves the note alone when the first line is not a response line", () => {
    const note = "Watered 1L.\nResponse check: Better.";
    expect(removeChipAuthoredResponseLine(note, "Better")).toBe(note);
  });

  it("removes the chip's slot even when its status no longer matches provenance", () => {
    // INVERTED DELIBERATELY. This previously asserted the note came back
    // unchanged, encoding "the current status must equal the authored one".
    // That assumption is the leak: the grower can re-word the generated line,
    // and refusing to remove it carries a response onto a plant that never
    // showed it. Provenance proves the SLOT is the chip's; the word in it is
    // the grower's to change.
    expect(removeChipAuthoredResponseLine("Response check: Worse.\nRunoff clear.", "Better")).toBe(
      "Runoff clear.",
    );
  });

  it("is null-safe and deterministic", () => {
    expect(removeChipAuthoredResponseLine("", "Better")).toBe("");
    const note = "Response check: Better.\nRunoff clear.";
    expect(removeChipAuthoredResponseLine(note, "Better")).toBe(
      removeChipAuthoredResponseLine(note, "Better"),
    );
  });

  it("removes a chip-slot marker the grower re-worded, so no status rides a retarget", () => {
    // Click Better, then edit the generated word to Worse. The provenance ref
    // still says Better. Matching on the AUTHORED status would find nothing to
    // remove and carry a Worse marker onto the next plant — the same
    // misattribution the whole cleanup exists to prevent.
    expect(removeChipAuthoredResponseLine("Response check: Worse.", "Better")).toBe("");
    expect(removeChipAuthoredResponseLine("Response check: Worse.\nRunoff clear.", "Better")).toBe(
      "Runoff clear.",
    );
    expect(removeChipAuthoredResponseLine("Response check: Same. after watering", "Better")).toBe(
      "after watering",
    );
  });

  it("still refuses a head line that is not a canonical marker at all", () => {
    // Provenance alone must not license removing grower prose: the head slot
    // has to actually hold a canonical marker.
    expect(removeChipAuthoredResponseLine("Watered 1L.\nResponse check: Better.", "Better")).toBe(
      "Watered 1L.\nResponse check: Better.",
    );
    expect(
      removeChipAuthoredResponseLine("Previous response check: better after watering", "Worse"),
    ).toBe("Previous response check: better after watering");
  });

  it("round-trips with applyResponseCheck: apply then remove restores the note", () => {
    // The property that matters — undoing a chip returns what was there before.
    for (const before of ["", "Runoff clear.", "Watered 1L.\nRunoff clear."]) {
      for (const status of RESPONSE_CHECK_STATUSES) {
        const applied = applyResponseCheck(before, status);
        expect(removeChipAuthoredResponseLine(applied, status)).toBe(before);
      }
    }
  });
});
