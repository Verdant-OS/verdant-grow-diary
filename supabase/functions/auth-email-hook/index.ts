import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import {
  parseEmailWebhookPayload,
  sendLovableEmail,
  EmailAPIError,
} from "npm:@lovable.dev/email-js@0.6.0";
import { WebhookError, verifyWebhookRequest } from "npm:@lovable.dev/webhooks-js";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignupEmail } from "../_shared/email-templates/signup.tsx";
import { InviteEmail } from "../_shared/email-templates/invite.tsx";
import { MagicLinkEmail } from "../_shared/email-templates/magic-link.tsx";
import { RecoveryEmail } from "../_shared/email-templates/recovery.tsx";
import { EmailChangeEmail } from "../_shared/email-templates/email-change.tsx";
import { ReauthenticationEmail } from "../_shared/email-templates/reauthentication.tsx";
import {
  timingSafeEqual,
  timingSafeMatchesAny,
} from "../_shared/lib/lib/timingSafeCompareRules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: "Confirm your email",
  invite: "You've been invited",
  magiclink: "Your login link",
  recovery: "Reset your password",
  email_change: "Confirm your new email",
  reauthentication: "Your verification code",
};

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
};

// Configuration
const SITE_NAME = "verdantgrowdiary-com";
const SENDER_DOMAIN = "notify.verdantgrowdiary.com";
const ROOT_DOMAIN = "verdantgrowdiary.com";
const FROM_DOMAIN = "verdantgrowdiary.com"; // Domain shown in From address (may be root or sender subdomain)

// Sample data for preview mode ONLY (not used in actual email sending).
// URLs are baked in at scaffold time from the project's real data.
// The sample email uses a fixed placeholder (RFC 6761 .test TLD) so the Go backend
// can always find-and-replace it with the actual recipient when sending test emails,
// even if the project's domain has changed since the template was scaffolded.
const SAMPLE_PROJECT_URL = "https://verdantgrowdiary.com";
const SAMPLE_EMAIL = "user@example.test";
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: "123456",
  },
};

// Preview endpoint handler - returns rendered HTML without sending email
async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: previewCorsHeaders });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const authHeader = req.headers.get("Authorization");

  if (!apiKey || !timingSafeEqual(authHeader ?? "", `Bearer ${apiKey}`)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...previewCorsHeaders, "Content-Type": "application/json" },
    });
  }

  let type: string;
  try {
    const body = await req.json();
    type = body.type;
  } catch (error) {
    return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
      status: 400,
      headers: { ...previewCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const EmailTemplate = EMAIL_TEMPLATES[type];

  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const sampleData = SAMPLE_DATA[type] || {};
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData));

  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

// Standard Webhooks tolerance used by GoTrue's Send Email hook (5 minutes).
const NATIVE_HOOK_TOLERANCE_SECONDS = 5 * 60;

const NATIVE_ACTION_TEMPLATES: Record<string, string> = {
  signup: "signup",
  invite: "invite",
  magiclink: "magiclink",
  recovery: "recovery",
  email_change: "email_change",
  email_change_current: "email_change",
  email_change_new: "email_change",
  reauthentication: "reauthentication",
};

// Both callers stay. A request with any Standard Webhooks header is GoTrue's
// native Send Email hook (SEND_EMAIL_HOOK_SECRET, body { user, email_data }).
// Anything else is the legacy Lovable webhook (LOVABLE_API_KEY, run_id,
// data.action_type). Keeping Lovable avoids breaking preview and the existing
// managed-sender contract while the dashboard hook speaks the native one.
function isNativeSendEmailRequest(req: Request): boolean {
  return (
    req.headers.has("webhook-id") ||
    req.headers.has("webhook-timestamp") ||
    req.headers.has("webhook-signature")
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nativeHookError(status: number, message: string): Response {
  return jsonResponse({ error: { http_code: status, message } }, status);
}

function decodeWhsec(secret: string): Uint8Array | null {
  const match = /^v1,whsec_([A-Za-z0-9+/=]+)$/.exec(secret.trim());
  if (!match) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleaned = match[1].replace(/=+$/, "");
  if (cleaned.length === 0 || cleaned.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of cleaned) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

function encodeBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 63];
    out += alphabet[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}

function signatureCandidates(header: string): string[] {
  const out: string[] = [];
  for (const part of header.split(" ")) {
    const comma = part.indexOf(",");
    if (comma <= 0) continue;
    if (part.slice(0, comma) === "v1") {
      const value = part.slice(comma + 1);
      if (value.length > 0) out.push(value);
    }
  }
  return out;
}

type NativeVerifyResult = "ok" | "missing" | "bad_signature" | "stale";

async function verifyNativeSendEmailHook(
  req: Request,
  rawBody: string,
  nowMs: number,
): Promise<NativeVerifyResult> {
  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signature = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return "missing";
  if (!/^\d+$/.test(timestamp)) return "bad_signature";

  const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
  const keyBytes = decodeWhsec(secret);
  if (!keyBytes) return "bad_signature";

  const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed));
  const expected = encodeBase64(mac);
  if (!timingSafeMatchesAny(expected, signatureCandidates(signature))) return "bad_signature";

  const skew = Math.abs(nowMs / 1000 - Number(timestamp));
  if (skew > NATIVE_HOOK_TOLERANCE_SECONDS) return "stale";
  return "ok";
}

function nativeConfirmationUrl(emailData: {
  site_url?: unknown;
  token_hash?: unknown;
  email_action_type?: unknown;
  redirect_to?: unknown;
}): string | null {
  if (typeof emailData.site_url !== "string" || typeof emailData.token_hash !== "string") {
    return null;
  }
  if (typeof emailData.email_action_type !== "string") return null;
  let site: URL;
  try {
    site = new URL(emailData.site_url);
  } catch {
    return null;
  }
  if (site.protocol !== "https:" && site.protocol !== "http:") return null;
  const redirectTo = typeof emailData.redirect_to === "string" ? emailData.redirect_to : "";
  const params = new URLSearchParams({
    token: emailData.token_hash,
    type: emailData.email_action_type,
    redirect_to: redirectTo,
  });
  return `${site.origin}${site.pathname.replace(/\/$/, "")}/auth/v1/verify?${params.toString()}`;
}

type AuthDelivery = {
  emailType: string;
  recipient: string;
  confirmationUrl: string;
  token: string;
  oldEmail: string;
  newEmail: string;
  run_id: string;
  response: "lovable" | "native";
};

async function deliverAuthEmail(delivery: AuthDelivery, apiKey: string): Promise<Response> {
  const EmailTemplate = EMAIL_TEMPLATES[delivery.emailType];
  if (!EmailTemplate) {
    console.error("Unknown email type", { emailType: delivery.emailType, run_id: delivery.run_id });
    const message = `Unknown email type: ${delivery.emailType}`;
    return delivery.response === "native"
      ? nativeHookError(400, message)
      : jsonResponse({ error: message }, 400);
  }

  console.log("Received auth event", { emailType: delivery.emailType, run_id: delivery.run_id });

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: `https://${ROOT_DOMAIN}`,
    recipient: delivery.recipient,
    confirmationUrl: delivery.confirmationUrl,
    token: delivery.token,
    email: delivery.recipient,
    oldEmail: delivery.oldEmail,
    newEmail: delivery.newEmail,
  };

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps));
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const messageId = crypto.randomUUID();
  const run_id = delivery.run_id;

  const writeLog = async (status: "sent" | "suppressed" | "failed", errorMessage?: string) => {
    const { error } = await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: delivery.emailType,
      recipient_email: delivery.recipient,
      status,
      error_message: errorMessage ?? null,
    });
    if (error)
      console.error("Auth email audit failed", { code: error.code, message: error.message });
  };
  try {
    await sendLovableEmail(
      {
        run_id,
        message_id: messageId,
        to: delivery.recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: EMAIL_SUBJECTS[delivery.emailType] || "Notification",
        html,
        text,
        purpose: "transactional",
        label: delivery.emailType,
        idempotency_key: run_id,
      },
      { apiKey, sendUrl: Deno.env.get("LOVABLE_SEND_URL") },
    );
    await writeLog("sent");
  } catch (error) {
    await writeLog(
      error instanceof EmailAPIError && error.code === "recipient_suppressed"
        ? "suppressed"
        : "failed",
      error instanceof Error ? error.message.slice(0, 1000) : "Email send failed",
    );
    return delivery.response === "native"
      ? nativeHookError(500, "Email send failed")
      : jsonResponse({ error: "Email send failed" }, 500);
  }

  console.log("Auth email sent", { emailType: delivery.emailType, run_id });

  return delivery.response === "native"
    ? jsonResponse({}, 200)
    : jsonResponse({ success: true }, 200);
}

async function handleNativeSendEmailHook(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const verified = await verifyNativeSendEmailHook(req, rawBody, Date.now());
  if (verified === "stale") {
    console.error("Invalid webhook signature", { reason: "stale_timestamp" });
    return nativeHookError(401, "Stale timestamp");
  }
  if (verified !== "ok") {
    console.error("Invalid webhook signature", { reason: verified });
    return nativeHookError(401, "Invalid signature");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.error("Invalid webhook payload", { reason: "invalid_json" });
    return nativeHookError(400, "Invalid webhook payload");
  }

  const body = parsed as {
    user?: { email?: unknown; new_email?: unknown };
    email_data?: {
      email_action_type?: unknown;
      token?: unknown;
      token_hash?: unknown;
      redirect_to?: unknown;
      site_url?: unknown;
    };
  };
  const emailData = body?.email_data;
  const recipient = body?.user?.email;
  if (
    !emailData ||
    typeof emailData.email_action_type !== "string" ||
    typeof recipient !== "string" ||
    recipient.length === 0
  ) {
    console.error("Invalid webhook payload", { reason: "missing_fields" });
    return nativeHookError(400, "Invalid webhook payload");
  }

  const emailType = NATIVE_ACTION_TEMPLATES[emailData.email_action_type];
  if (!emailType) {
    console.error("Unknown email type", { emailType: emailData.email_action_type });
    return nativeHookError(400, `Unknown email type: ${emailData.email_action_type}`);
  }

  const confirmationUrl = emailType === "reauthentication" ? "" : nativeConfirmationUrl(emailData);
  if (emailType !== "reauthentication" && !confirmationUrl) {
    console.error("Invalid webhook payload", { reason: "confirmation_url" });
    return nativeHookError(400, "Invalid webhook payload");
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("LOVABLE_API_KEY not configured");
    return nativeHookError(500, "Server configuration error");
  }

  const webhookId = req.headers.get("webhook-id") ?? "";
  return deliverAuthEmail(
    {
      emailType,
      recipient,
      confirmationUrl: confirmationUrl ?? "",
      token: typeof emailData.token === "string" ? emailData.token : "",
      oldEmail: recipient,
      newEmail: typeof body.user?.new_email === "string" ? body.user.new_email : recipient,
      run_id: webhookId,
      response: "native",
    },
    apiKey,
  );
}

// Webhook handler - verifies signature and sends email
async function handleWebhook(req: Request): Promise<Response> {
  if (isNativeSendEmailRequest(req)) {
    return handleNativeSendEmailHook(req);
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");

  if (!apiKey) {
    console.error("LOVABLE_API_KEY not configured");
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify signature + timestamp, then parse payload.
  let payload: any;
  let run_id = "";
  try {
    const verified = await verifyWebhookRequest({
      req,
      secret: apiKey,
      parser: parseEmailWebhookPayload,
    });
    payload = verified.payload;
    run_id = payload.run_id;
  } catch (error) {
    if (error instanceof WebhookError) {
      switch (error.code) {
        case "invalid_signature":
        case "missing_timestamp":
        case "invalid_timestamp":
        case "stale_timestamp":
          console.error("Invalid webhook signature", { error: error.message });
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        case "invalid_payload":
        case "invalid_json":
          console.error("Invalid webhook payload", { error: error.message });
          return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }
    }

    console.error("Webhook verification failed", { error });
    return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!run_id) {
    console.error("Webhook payload missing run_id");
    return new Response(JSON.stringify({ error: "Invalid webhook payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (payload.version !== "1") {
    console.error("Unsupported payload version", { version: payload.version, run_id });
    return new Response(
      JSON.stringify({ error: `Unsupported payload version: ${payload.version}` }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
  // payload.type is the hook event type ("auth")
  const emailType = payload.data.action_type;

  return deliverAuthEmail(
    {
      emailType,
      recipient: payload.data.email,
      confirmationUrl: payload.data.url,
      token: payload.data.token ?? "",
      oldEmail: payload.data.old_email ?? "",
      newEmail: payload.data.new_email ?? "",
      run_id,
      response: "lovable",
    },
    apiKey,
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Handle CORS preflight for main endpoint
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Route to preview handler for /preview path
  if (url.pathname.endsWith("/preview")) {
    return handlePreview(req);
  }

  // Main webhook handler
  try {
    return await handleWebhook(req);
  } catch (error) {
    console.error("Webhook handler error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
