import { supabase } from "@/integrations/supabase/client";

// Best-effort welcome email dispatch. Fires from the signup handler after
// Supabase accepts the account. Failures are swallowed so signup UX never
// depends on email plumbing. Idempotency is scoped to the recipient email so
// a retried signup with the same address won't re-queue.
export async function sendWelcomeEmailBestEffort(rawEmail: string): Promise<void> {
  const recipientEmail = rawEmail?.trim();
  if (!recipientEmail || !recipientEmail.includes("@")) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const firstName =
      (userData?.user?.user_metadata as Record<string, unknown> | undefined)?.first_name;
    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "welcome",
        recipientEmail,
        idempotencyKey: `welcome:${recipientEmail.toLowerCase()}`,
        templateData: {
          firstName: typeof firstName === "string" ? firstName : undefined,
          dashboardUrl: `${window.location.origin}/dashboard`,
        },
      },
    });
  } catch (err) {
    console.warn("welcome email dispatch failed", err);
  }
}
