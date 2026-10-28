import { describe, expect, it } from "vitest";
import { diaryRemovalCompletionStillCurrent } from "@/lib/diaryEntryRemovalRules";

describe("diaryRemovalCompletionStillCurrent", () => {
  it("returns false when the origin read key is null", () => {
    expect(
      diaryRemovalCompletionStillCurrent(
        { requestId: 1, readKey: null },
        { requestId: 1, readKey: "owner:grow" },
      ),
    ).toBe(false);
  });

  it("returns false when the current read key is null", () => {
    expect(
      diaryRemovalCompletionStillCurrent(
        { requestId: 1, readKey: "owner:grow" },
        { requestId: 1, readKey: null },
      ),
    ).toBe(false);
  });
});
