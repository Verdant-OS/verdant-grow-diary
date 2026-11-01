import { z } from "zod";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { OWNER_SUBMISSION_EMAIL } from "@/lib/formSubmissionRules";

export async function sendRegisteredAppEmail(request: Request): Promise<Response> {
  const parsed = z.object({
    templateName: z.literal("owner-submission"),
    idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
    templateData: z.record(z.string(), z.unknown()),
  }).strict().safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid email request" }, { status: 400 });
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  async function log(status: "sent" | "suppressed" | "failed", errorMessage?: string) {
    const { error } = await db.from("email_send_log").insert({
      template_name: "owner-submission", recipient_email: OWNER_SUBMISSION_EMAIL,
      status, error_message: errorMessage ?? null,
    });
    if (error) console.error("Email audit write failed", { code: error.code, message: error.message });
  }
  try {
    const result = await sendTemplateEmail("owner-submission", OWNER_SUBMISSION_EMAIL, {
      templateData: parsed.data.templateData, idempotencyKey: parsed.data.idempotencyKey,
    });
    await log(result.sent ? "sent" : "suppressed");
    return Response.json(result.sent ? { success: true } : { success: false, reason: "email_suppressed" });
  } catch (error) {
    await log("failed", error instanceof Error ? error.message.slice(0, 1000) : "Email send failed");
    return Response.json({ error: "Email send failed" }, { status: 502 });
  }
}
