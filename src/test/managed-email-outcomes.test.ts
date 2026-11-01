import { describe, expect, it } from "vitest";
import { emailEventOutcomes } from "@/lib/email/emailEventRules";
describe("kept email outcome contract", () => {
  it("stores bounce as bounce, not bounced", () => {
    expect(emailEventOutcomes["email.bounced"]).toEqual({
      reason: "bounce",
      status: "bounced",
      message: "Permanent bounce — email address is invalid or rejected",
    });
  });
  it("preserves complaint status and message", () => {
    expect(emailEventOutcomes["email.complaint"]).toEqual({
      reason: "complaint",
      status: "complained",
      message: "Spam complaint — recipient marked email as spam",
    });
  });
  it("preserves unsubscribe audit status", () => {
    expect(emailEventOutcomes["email.unsubscribed"]).toEqual({
      reason: "unsubscribe",
      status: "suppressed",
      message: "Recipient unsubscribed",
    });
  });
});
