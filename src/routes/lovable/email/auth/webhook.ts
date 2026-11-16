// Lovable's managed sign-in email webhook (POST only, server-side).
//
// Lovable signs each Supabase Auth email event and posts it here. The handler
// verifies the signature, renders Verdant's branded template and sends it from
// noreply@verdantgrowdiary.com through notify.verdantgrowdiary.com. The service
// key is read only inside this server handler and never reaches the browser.
import { EmailAPIError, parseEmailWebhookPayload, sendLovableEmail } from "@lovable.dev/email-js";
import { WebhookError, verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { render } from "@react-email/render";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { handleAuthEmailWebhook } from "@/lib/authEmailWebhook.server";

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = process.env["SUPABASE_URL"] ?? import.meta.env["VITE_SUPABASE_URL"];
        const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

        return handleAuthEmailWebhook(request, {
          apiKey: process.env["LOVABLE_API_KEY"],
          sendUrl: process.env["LOVABLE_SEND_URL"],
          verify: ({ req, secret, parser }) => verifyWebhookRequest({ req, secret, parser }),
          parse: parseEmailWebhookPayload,
          verificationErrorCode: (error) => (error instanceof WebhookError ? error.code : null),
          render: (element, options) => render(element, options),
          send: (sendRequest, options) => sendLovableEmail(sendRequest, options),
          sendErrorCode: (error) => (error instanceof EmailAPIError ? (error.code ?? null) : null),
          writeLog: async (row) => {
            if (!supabaseUrl || !serviceKey) {
              console.error("Auth email audit skipped: database credentials not configured");
              return;
            }
            const supabase = createClient(supabaseUrl, serviceKey);
            const { error } = await supabase.from("email_send_log").insert(row);
            if (error) {
              console.error("Auth email audit failed", { code: error.code });
            }
          },
          newMessageId: () => crypto.randomUUID(),
        });
      },
    },
  },
});
