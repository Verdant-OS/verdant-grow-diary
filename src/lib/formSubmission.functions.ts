import { createServerFn } from "@tanstack/react-start";
import { formSubmissionSchema, saveAndNotifySubmission } from "./formSubmissionRules";

export const submitPublicForm = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => formSubmissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string | null = null;
    const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (bearer) {
      const { data: auth, error } = await supabaseAdmin.auth.getUser(bearer);
      if (error || !auth.user) return { error: "Please sign in again or submit signed out." };
      userId = auth.user.id;
    }
    try {
      return await saveAndNotifySubmission(async () => {
        const result = data.kind === "contact"
          ? await supabaseAdmin.from("contact_messages").insert({ ...data.payload, grow_context: data.payload.grow_context || null, user_id: userId }).select("id").single()
          : await supabaseAdmin.from("leads").insert(data.payload).select("id").single();
        if (result.error || !result.data) throw new Error("Save failed");
        return { id: result.data.id };
      }, async (id) => {
        const { sendRegisteredAppEmail } = await import("./email/sendRegisteredAppEmail.server");
        const response = await sendRegisteredAppEmail(new Request(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateName: "owner-submission", idempotencyKey: `owner-submission-${data.kind}-${id}`, templateData: { kind: data.kind, ...data.payload } }),
        }));
        return response.ok && (await response.json()).success === true;
      });
    } catch { return { error: "We couldn't save your submission. Please try again." }; }
  });