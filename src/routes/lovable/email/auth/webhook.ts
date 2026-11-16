// Lovable's managed sign-in email webhook (POST only, server-side).
//
// Lovable signs each Supabase Auth email event and posts it here. The handler
// verifies the signature, renders Verdant's branded template and sends it from
// noreply@verdantgrowdiary.com through notify.verdantgrowdiary.com. All
// credentials are read in the lazily imported server-only runtime module.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleManagedAuthEmailWebhook } =
          await import("@/lib/authEmailWebhookRuntime.server");
        return handleManagedAuthEmailWebhook(request);
      },
    },
  },
});
