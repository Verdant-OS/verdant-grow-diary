import { describe, expect, it } from "vitest";
import { memberBadgeProfileEnabled } from "@/lib/badgeAwardFlags";

describe("member badge profile display flag pin", () => {
  it("keeps the member profile flag off until Petal approves copy", () => {
    expect(memberBadgeProfileEnabled).toBe(false);
  });
});
