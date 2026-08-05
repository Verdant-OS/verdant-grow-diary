import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  exceedsUnsubscribeBodyBytes,
  isValidUnsubscribeToken,
  parseUnsubscribeFormRequest,
  parseUnsubscribeJsonRequest,
  resolveUnsubscribeAdminKey,
  type UnsubscribeAction,
} from "./contract.ts";

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function databaseErrorCode(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const code = (value as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : "unknown";
}

function redactEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : "[invalid-email]";
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        Allow: "GET, POST",
      },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAdminKey = resolveUnsubscribeAdminKey({
    namedSecretKeysJson: Deno.env.get("SUPABASE_SECRET_KEYS") ?? null,
    singleSecretKey: Deno.env.get("SUPABASE_SECRET_KEY") ?? null,
    legacyServiceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? null,
  });

  if (!supabaseUrl || !supabaseAdminKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  let token = queryToken;
  let action: UnsubscribeAction = "validate";

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") ?? "";
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }
    if (exceedsUnsubscribeBodyBytes(rawBody)) {
      return jsonResponse({ error: "Request body too large" }, 413);
    }

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const parsed = parseUnsubscribeFormRequest(rawBody, queryToken);
      if (!parsed.ok) {
        return jsonResponse({ error: "Invalid unsubscribe request" }, 400);
      }
      token = parsed.token;
      action = parsed.action;
    } else {
      let body: unknown;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid unsubscribe request" }, 400);
      }
      const parsed = parseUnsubscribeJsonRequest(body, queryToken);
      if (!parsed.ok) {
        return jsonResponse({ error: "Invalid unsubscribe request" }, 400);
      }
      token = parsed.token;
      action = parsed.action;
    }
  }

  if (!isValidUnsubscribeToken(token)) {
    return jsonResponse({ error: "Invalid or expired token" }, 404);
  }

  const supabase = createClient(supabaseUrl, supabaseAdminKey);

  // Look up the token
  const { data: tokenRecord, error: lookupError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (lookupError || !tokenRecord) {
    return jsonResponse({ error: "Invalid or expired token" }, 404);
  }

  if (tokenRecord.used_at) {
    return jsonResponse({ valid: false, reason: "already_unsubscribed" });
  }

  if (action === "validate") {
    return jsonResponse({ valid: true });
  }

  const tokenEmail =
    typeof tokenRecord.email === "string" ? tokenRecord.email.trim().toLowerCase() : "";
  if (!tokenEmail || tokenEmail.length > 254 || !tokenEmail.includes("@")) {
    console.error("Unsubscribe token has an invalid recipient record");
    return jsonResponse({ error: "Failed to process unsubscribe" }, 500);
  }

  // POST: Make suppression effective before consuming the token. If either
  // write fails, a retry can safely repeat the upsert and finish marking the
  // token. Consuming first could strand a grower as "already unsubscribed"
  // while the authoritative suppression row was never written.
  const { error: suppressError } = await supabase
    .from("suppressed_emails")
    .upsert({ email: tokenEmail, reason: "unsubscribe" }, { onConflict: "email" });

  if (suppressError) {
    console.error("Failed to suppress email", {
      error_code: databaseErrorCode(suppressError),
      email_redacted: redactEmail(tokenEmail),
    });
    return jsonResponse({ error: "Failed to process unsubscribe" }, 500);
  }

  const { data: updated, error: updateError } = await supabase
    .from("email_unsubscribe_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token)
    .is("used_at", null)
    .select()
    .maybeSingle();

  if (updateError) {
    console.error("Failed to mark unsubscribe token as used", {
      error_code: databaseErrorCode(updateError),
    });
    return jsonResponse({ error: "Failed to process unsubscribe" }, 500);
  }

  if (!updated) {
    return jsonResponse({ success: false, reason: "already_unsubscribed" });
  }

  console.log("Email unsubscribed", {
    email_redacted: redactEmail(tokenEmail),
  });

  return jsonResponse({ success: true });
});
