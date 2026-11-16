// Production wiring for the managed sign-in email webhook route.
//
// Server-only: this module reads the signing key and uses the service-role
// admin client to write the email_send_log audit row. The route file imports
// it lazily inside its POST handler, so none of this reaches the browser bundle.
import { EmailAPIError, parseEmailWebhookPayload, sendLovableEmail } from "@lovable.dev/email-js";
import { WebhookError, verifyWebhookRequest } from "@lovable.dev/webhooks-js";
import { render } from "@react-email/render";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { handleAuthEmailWebhook } from "@/lib/authEmailWebhook.server";

export function handleManagedAuthEmailWebhook(request: Request): Promise<Response> {
  return handleAuthEmailWebhook(request, {
    apiKey: process.env["LOVABLE_API_KEY"],
    sendUrl: process.env["LOVABLE_SEND_URL"],
    verify: ({ req, secret, parser }) => verifyWebhookRequest({ req, secret, parser }),
    parse: parseEmailWebhookPayload,
    verificationErrorCode: (error) => (error instanceof WebhookError ? error.code : null),
    render: (element, options) =>
      options?.plainText ? render(element, { plainText: true }) : render(element),
    send: (sendRequest, options) => sendLovableEmail(sendRequest, options),
    sendErrorCode: (error) => (error instanceof EmailAPIError ? (error.code ?? null) : null),
    writeLog: async (row) => {
      try {
        const { error } = await supabaseAdmin.from("email_send_log").insert(row);
        if (error) console.error("Auth email audit failed", { code: error.code });
      } catch {
        // A missing database credential must not turn a sent email into a failure.
        console.error("Auth email audit skipped: database client unavailable");
      }
    },
    newMessageId: () => crypto.randomUUID(),
  });
}
