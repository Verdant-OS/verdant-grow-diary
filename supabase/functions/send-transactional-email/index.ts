import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient } from "npm:@supabase/supabase-js@2";
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";
import {
  authorizeTransactionalEmailCaller,
  exceedsTransactionalEmailBodyBytes,
  exceedsTransactionalEmailBodyLimit,
  normalizeTransactionalEmailAddress,
  normalizeTransactionalEmailSubject,
  parseTransactionalEmailRequest,
  resolveTransactionalEmailSecrets,
} from "./contract.ts";

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "verdantgrowdiary-com";
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.verdantgrowdiary.com";
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "verdantgrowdiary.com";

const serverOnlyHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: serverOnlyHeaders,
  });
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function redactEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain) return "[invalid-email]";
  return `${local.slice(0, 1)}***@${domain}`;
}

function databaseErrorCode(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : "unknown";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...serverOnlyHeaders, Allow: "POST" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretConfiguration = resolveTransactionalEmailSecrets({
    namedSecretKeysJson: Deno.env.get("SUPABASE_SECRET_KEYS") ?? null,
    singleSecretKey: Deno.env.get("SUPABASE_SECRET_KEY") ?? null,
    legacyServiceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null,
  });

  if (!supabaseUrl || !secretConfiguration.adminKey) {
    console.error("Missing required environment variables");
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  // This endpoint owns a service-role queue write and must never delegate
  // recipient/template authority to an ordinary user JWT. Hosted opaque
  // secrets arrive on `apikey`; the legacy service-role JWT remains accepted
  // on Authorization during migration.
  const authorization = authorizeTransactionalEmailCaller(
    req.headers.get("Authorization"),
    req.headers.get("apikey"),
    secretConfiguration.acceptedKeys,
  );
  if (!authorization.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (exceedsTransactionalEmailBodyLimit(req.headers.get("content-length"))) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (exceedsTransactionalEmailBodyBytes(rawBody)) {
    return jsonResponse({ error: "Request body too large" }, 413);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  const requestPayload = parseTransactionalEmailRequest(parsedBody, Object.keys(TEMPLATES));
  if (!requestPayload.ok) {
    return jsonResponse({ error: "Invalid transactional email request" }, 400);
  }

  const messageId = crypto.randomUUID();
  const { templateName, recipientEmail, templateData } = requestPayload.value;
  const idempotencyKey = requestPayload.value.idempotencyKey ?? messageId;
  const template = TEMPLATES[templateName];

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  const effectiveRecipient = normalizeTransactionalEmailAddress(template.to || recipientEmail);

  if (!effectiveRecipient) {
    return jsonResponse({ error: "Invalid transactional email request" }, 400);
  }

  // Create Supabase client with a hosted secret key (bypasses RLS).
  const supabase = createClient(supabaseUrl, secretConfiguration.adminKey);

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from("suppressed_emails")
    .select("id")
    .eq("email", effectiveRecipient.toLowerCase())
    .maybeSingle();

  if (suppressionError) {
    console.error("Suppression check failed — refusing to send", {
      error_code: databaseErrorCode(suppressionError),
      recipient_redacted: redactEmail(effectiveRecipient),
    });
    return jsonResponse({ error: "Failed to verify suppression status" }, 500);
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: "suppressed",
    });

    console.log("Email suppressed", {
      recipient_redacted: redactEmail(effectiveRecipient),
      templateName,
    });
    return jsonResponse({ success: false, reason: "email_suppressed" });
  }

  // 3. Get or create unsubscribe token (one token per email address)
  const normalizedEmail = effectiveRecipient.toLowerCase();
  let unsubscribeToken: string;

  // Check for existing token for this email
  const { data: existingToken, error: tokenLookupError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (tokenLookupError) {
    console.error("Token lookup failed", {
      error_code: databaseErrorCode(tokenLookupError),
      recipient_redacted: redactEmail(normalizedEmail),
    });
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: "failed",
      error_message: "Failed to look up unsubscribe token",
    });
    return jsonResponse({ error: "Failed to prepare email" }, 500);
  }

  if (existingToken && !existingToken.used_at) {
    // Reuse existing unused token
    unsubscribeToken = existingToken.token;
  } else if (!existingToken) {
    // Create new token — upsert handles concurrent inserts gracefully
    unsubscribeToken = generateToken();
    const { error: tokenError } = await supabase
      .from("email_unsubscribe_tokens")
      .upsert(
        { token: unsubscribeToken, email: normalizedEmail },
        { onConflict: "email", ignoreDuplicates: true },
      );

    if (tokenError) {
      console.error("Failed to create unsubscribe token", {
        error_code: databaseErrorCode(tokenError),
        recipient_redacted: redactEmail(normalizedEmail),
      });
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: "failed",
        error_message: "Failed to create unsubscribe token",
      });
      return jsonResponse({ error: "Failed to prepare email" }, 500);
    }

    // If another request raced us, our upsert was silently ignored.
    // Re-read to get the actual stored token.
    const { data: storedToken, error: reReadError } = await supabase
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (reReadError || !storedToken) {
      console.error("Failed to read back unsubscribe token after upsert", {
        error_code: databaseErrorCode(reReadError),
        recipient_redacted: redactEmail(normalizedEmail),
      });
      await supabase.from("email_send_log").insert({
        message_id: messageId,
        template_name: templateName,
        recipient_email: effectiveRecipient,
        status: "failed",
        error_message: "Failed to confirm unsubscribe token storage",
      });
      return jsonResponse({ error: "Failed to prepare email" }, 500);
    }
    unsubscribeToken = storedToken.token;
  } else {
    // Token exists but is already used — email should have been caught by suppression check above.
    // This is a safety fallback; log and skip sending.
    console.warn("Unsubscribe token already used but email not suppressed", {
      recipient_redacted: redactEmail(normalizedEmail),
    });
    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: "suppressed",
      error_message: "Unsubscribe token used but email missing from suppressed list",
    });
    return jsonResponse({ success: false, reason: "email_suppressed" });
  }

  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(React.createElement(template.component, templateData));
  const plainText = await renderAsync(React.createElement(template.component, templateData), {
    plainText: true,
  });

  // Resolve subject — supports static string or dynamic function
  const rawSubject =
    typeof template.subject === "function" ? template.subject(templateData) : template.subject;
  const resolvedSubject = normalizeTransactionalEmailSubject(rawSubject);
  if (!resolvedSubject) {
    return jsonResponse({ error: "Invalid transactional email request" }, 400);
  }

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: "pending",
  });

  const { error: enqueueError } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `Matt at Verdant Grow Diary <matt@${SENDER_DOMAIN}>`,
      reply_to: "matt@verdantgrowdiary.com",
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: "transactional",
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    console.error("Failed to enqueue email", {
      error_code: databaseErrorCode(enqueueError),
      templateName,
      recipient_redacted: redactEmail(effectiveRecipient),
    });

    await supabase.from("email_send_log").insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: "failed",
      error_message: "Failed to enqueue email",
    });

    return jsonResponse({ error: "Failed to enqueue email" }, 500);
  }

  console.log("Transactional email enqueued", {
    templateName,
    recipient_redacted: redactEmail(effectiveRecipient),
  });

  return jsonResponse({ success: true, queued: true });
});
