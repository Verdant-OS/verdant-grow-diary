import { describe, expect, it, vi } from "vitest";
import { formSubmissionSchema, saveAndNotifySubmission, OWNER_SUBMISSION_EMAIL } from "@/lib/formSubmissionRules";
import { template } from "@/lib/email-templates/owner-submission";

describe("submission notifications", () => {
  it("sends each saved submission only to the owner-selected inbox", () => {
    expect(OWNER_SUBMISSION_EMAIL).toBe("matt@verdantgrowdiary.com");
    expect(template.to).toBe("matt@verdantgrowdiary.com");
  });
  it("queues only after saving, with the saved row identity", async () => {
    const notify = vi.fn(async (id: string) => id === "saved-row");
    expect(await saveAndNotifySubmission(async () => ({ id: "saved-row" }), notify)).toEqual({ saved: true, notificationQueued: true });
    expect(notify).toHaveBeenCalledExactlyOnceWith("saved-row");
  });
  it("does not notify when saving fails", async () => {
    const notify = vi.fn();
    await expect(saveAndNotifySubmission(async () => { throw new Error("Failed"); }, notify)).rejects.toThrow("Failed");
    expect(notify).not.toHaveBeenCalled();
  });
  it("keeps the submission saved if email queuing fails", async () => {
    expect(await saveAndNotifySubmission(async () => ({ id: "saved-row" }), async () => { throw new Error("Unavailable"); })).toEqual({ saved: true, notificationQueued: false });
  });
  it("rejects injected review fields, attribution and recipient overrides", () => {
    const payload = { name: "Grower", email: "grower@example.com", category: "other", message: "Hello" };
    expect(formSubmissionSchema.safeParse({ kind: "contact", payload }).success).toBe(true);
    for (const field of ["user_id", "admin_notes", "reviewed_by", "recipientEmail"]) {
      expect(formSubmissionSchema.safeParse({ kind: "contact", payload: { ...payload, [field]: "forged" } }).success).toBe(false);
    }
  });
  it("rejects malformed addresses and unsupported lead sources", () => {
    const payload = { email: "grower@example.com", lead_type: "grower", source: "landing" };
    expect(formSubmissionSchema.safeParse({ kind: "lead", payload }).success).toBe(true);
    expect(formSubmissionSchema.safeParse({ kind: "lead", payload: { ...payload, email: "invalid" } }).success).toBe(false);
    expect(formSubmissionSchema.safeParse({ kind: "lead", payload: { ...payload, source: "forged" } }).success).toBe(false);
  });
});