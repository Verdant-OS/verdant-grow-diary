import { z } from "zod";
import { isPaidInterestLeadSource } from "@/lib/paidAcquisitionAttributionRules";

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  category: z.enum(["technical_support", "bug_report", "feature_idea", "billing_account", "hardware_integration", "other"]),
  message: z.string().trim().min(1).max(8000),
  grow_context: z.string().trim().max(500).nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
}).strict();
export const leadSubmissionSchema = z.object({
  name: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email().max(255),
  company: z.string().trim().max(120).nullable().optional(),
  lead_type: z.enum(["beta_user", "hardware_partner", "grower", "investor", "other"]),
  message: z.string().trim().max(2000).nullable().optional(),
  source: z.string().refine((value) => value === "landing" || isPaidInterestLeadSource(value)),
}).strict();
export const formSubmissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("contact"), payload: contactSubmissionSchema }).strict(),
  z.object({ kind: z.literal("lead"), payload: leadSubmissionSchema }).strict(),
]);
export type FormSubmission = z.infer<typeof formSubmissionSchema>;
export const OWNER_SUBMISSION_EMAIL = "matt@verdantgrowdiary.com";

export async function saveAndNotifySubmission(
  save: () => Promise<{ id: string }>,
  notify: (id: string) => Promise<boolean>,
): Promise<{ saved: true; notificationQueued: boolean }> {
  const row = await save();
  try { return { saved: true, notificationQueued: await notify(row.id) }; }
  catch { return { saved: true, notificationQueued: false }; }
}