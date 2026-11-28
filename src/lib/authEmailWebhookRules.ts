/**
 * Pure rules for the managed sign-in email webhook route
 * (`src/routes/lovable/email/auth/webhook.ts`).
 *
 * The route verifies Lovable's signed webhook, renders one of six branded
 * templates and sends it from Verdant's own domain. Everything here is
 * deterministic: no React, no Supabase, no fetch, no clock. The I/O lives in
 * `authEmailWebhook.server.ts`.
 *
 * Sender identity, subjects and failure handling deliberately match the
 * reviewed direct-send edge function (`supabase/functions/auth-email-hook`),
 * so a grower sees the same email whichever path Supabase Auth calls.
 */

export const AUTH_EMAIL_SITE_NAME = "Verdant Grow Diary";
export const AUTH_EMAIL_SENDER_DOMAIN = "notify.verdantgrowdiary.com";
export const AUTH_EMAIL_ROOT_DOMAIN = "verdantgrowdiary.com";
export const AUTH_EMAIL_FROM = `${AUTH_EMAIL_SITE_NAME} <noreply@${AUTH_EMAIL_ROOT_DOMAIN}>`;
export const AUTH_EMAIL_SITE_URL = `https://${AUTH_EMAIL_ROOT_DOMAIN}`;
export const AUTH_EMAIL_SUPPORTED_PAYLOAD_VERSION = "1";

export const AUTH_EMAIL_ACTION_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "reauthentication",
] as const;

export type AuthEmailActionType = (typeof AUTH_EMAIL_ACTION_TYPES)[number];

export const AUTH_EMAIL_SUBJECTS: Readonly<Record<AuthEmailActionType, string>> = {
  signup: "Confirm your email",
  invite: "You've been invited",
  magiclink: "Your login link",
  recovery: "Reset your password",
  email_change: "Confirm your new email",
  reauthentication: "Your verification code",
};

export function isAuthEmailActionType(value: unknown): value is AuthEmailActionType {
  return (
    typeof value === "string" && (AUTH_EMAIL_ACTION_TYPES as readonly string[]).includes(value)
  );
}

export type AuthEmailWebhookResponse = {
  status: number;
  body: { error: string } | { success: true };
};

/** Map a webhook verification failure code to the response the route returns. */
export function classifyWebhookVerificationError(code: string | null | undefined) {
  switch (code) {
    case "invalid_signature":
    case "missing_timestamp":
    case "invalid_timestamp":
    case "stale_timestamp":
    case "missing_secret":
      return { status: 401, body: { error: "Invalid signature" } } as const;
    default:
      return { status: 400, body: { error: "Invalid webhook payload" } } as const;
  }
}

export type AuthEmailHookData = {
  email?: unknown;
  action_type?: unknown;
  url?: unknown;
  token?: unknown;
  old_email?: unknown;
  new_email?: unknown;
};

export type AuthEmailPayload = {
  version?: unknown;
  run_id?: unknown;
  data?: AuthEmailHookData | null;
};

export type AcceptedAuthEmail = {
  ok: true;
  runId: string;
  actionType: AuthEmailActionType;
  recipient: string;
};

export type RejectedAuthEmail = { ok: false; response: AuthEmailWebhookResponse };

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

/**
 * Decide whether a verified payload can be sent. Rejections never echo the
 * payload's own values back, so nothing a caller sent ends up in a response.
 */
export function acceptAuthEmailPayload(
  payload: AuthEmailPayload | null | undefined,
): AcceptedAuthEmail | RejectedAuthEmail {
  const invalid: RejectedAuthEmail = {
    ok: false,
    response: { status: 400, body: { error: "Invalid webhook payload" } },
  };
  if (!payload || typeof payload !== "object") return invalid;

  const runId = asNonEmptyString(payload.run_id);
  if (!runId) return invalid;

  if (payload.version !== AUTH_EMAIL_SUPPORTED_PAYLOAD_VERSION) {
    return {
      ok: false,
      response: { status: 400, body: { error: "Unsupported payload version" } },
    };
  }

  const data = payload.data;
  if (!data || typeof data !== "object") return invalid;

  if (!isAuthEmailActionType(data.action_type)) {
    return { ok: false, response: { status: 400, body: { error: "Unknown email type" } } };
  }

  const recipient = asNonEmptyString(data.email);
  if (!recipient) return invalid;

  return { ok: true, runId, actionType: data.action_type, recipient };
}

export type AuthEmailTemplateProps = {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string | undefined;
  token: string | undefined;
  email: string;
  oldEmail: string | undefined;
  newEmail: string | undefined;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export function buildAuthEmailTemplateProps(
  accepted: AcceptedAuthEmail,
  data: AuthEmailHookData,
): AuthEmailTemplateProps {
  return {
    siteName: AUTH_EMAIL_SITE_NAME,
    siteUrl: AUTH_EMAIL_SITE_URL,
    recipient: accepted.recipient,
    confirmationUrl: optionalString(data.url),
    token: optionalString(data.token),
    email: accepted.recipient,
    oldEmail: optionalString(data.old_email),
    newEmail: optionalString(data.new_email),
  };
}

export type AuthEmailSendRequest = {
  run_id: string;
  message_id: string;
  to: string;
  from: string;
  sender_domain: string;
  subject: string;
  html: string;
  text: string;
  purpose: "transactional";
  label: AuthEmailActionType;
  idempotency_key: string;
};

export function buildAuthEmailSendRequest(input: {
  accepted: AcceptedAuthEmail;
  messageId: string;
  html: string;
  text: string;
}): AuthEmailSendRequest {
  const { accepted, messageId, html, text } = input;
  return {
    run_id: accepted.runId,
    message_id: messageId,
    to: accepted.recipient,
    from: AUTH_EMAIL_FROM,
    sender_domain: AUTH_EMAIL_SENDER_DOMAIN,
    subject: AUTH_EMAIL_SUBJECTS[accepted.actionType],
    html,
    text,
    purpose: "transactional",
    label: accepted.actionType,
    // Lovable retries a webhook run with the same run_id; one run sends once.
    idempotency_key: accepted.runId,
  };
}

export type AuthEmailLogStatus = "sent" | "suppressed" | "failed";

/** A send rejected because the recipient is suppressed is logged as such, not as a failure. */
export function classifySendFailure(errorCode: string | null | undefined): AuthEmailLogStatus {
  return errorCode === "recipient_suppressed" ? "suppressed" : "failed";
}

export const AUTH_EMAIL_ERROR_MESSAGE_MAX = 1000;

export function truncateErrorMessage(message: string | null | undefined): string {
  if (!message) return "Email send failed";
  return message.slice(0, AUTH_EMAIL_ERROR_MESSAGE_MAX);
}
