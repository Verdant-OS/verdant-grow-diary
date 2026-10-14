/**
 * The correction dialog edits note, time and plant only, so it must not offer
 * "Wrong value" (production QA 2026-10-14; owner decision: drop the reason
 * until value editing exists). Legacy revision rows recorded with wrong_value
 * still resolve to a label.
 */
import { describe, it, expect } from "vitest";
import {
  QUICKLOG_CORRECTION_REASON_CHIPS,
  QUICKLOG_REVISION_REASON_CODES,
  QUICKLOG_REVISION_REASON_LABELS,
} from "@/lib/quick-log/quickLogRevisionRules";

describe("Quick Log correction reason chips", () => {
  it("does not offer 'Wrong value' when correcting an entry", () => {
    expect(QUICKLOG_CORRECTION_REASON_CHIPS).not.toContain("wrong_value");
    expect(QUICKLOG_CORRECTION_REASON_CHIPS.map((c) => QUICKLOG_REVISION_REASON_LABELS[c])).toEqual(
      ["Wrong plant", "Typo", "Wrong time", "Other"],
    );
  });

  it("still labels legacy wrong_value revisions", () => {
    expect(QUICKLOG_REVISION_REASON_CODES).toContain("wrong_value");
    expect(QUICKLOG_REVISION_REASON_LABELS.wrong_value).toBe("Wrong value");
  });
});
