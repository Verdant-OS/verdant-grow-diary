import { constantTimeEqual } from "../_shared/lib/lib/constantTimeEqual.ts";

export const MAX_TRANSACTIONAL_EMAIL_BODY_BYTES = 64 * 1024;
export const MAX_TRANSACTIONAL_EMAIL_SUBJECT_LENGTH = 200;

export type TransactionalEmailAuthorization =
  | { ok: true }
  | {
      ok: false;
      reason: "missing_authorization" | "invalid_authorization" | "server_secret_mismatch";
    };

export type TransactionalEmailSecretConfiguration = {
  acceptedKeys: readonly string[];
  adminKey: string | null;
};

export type TransactionalEmailRequestPayload = {
  templateName: string;
  recipientEmail?: string;
  idempotencyKey?: string;
  templateData: Record<string, unknown>;
};

export type TransactionalEmailRequestResult =
  | { ok: true; value: TransactionalEmailRequestPayload }
  | {
      ok: false;
      reason:
        | "invalid_body"
        | "invalid_template"
        | "invalid_recipient"
        | "invalid_idempotency_key"
        | "invalid_template_data";
    };

function normalizeSecret(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Positively identify a client-side key so it can never become a send
 * credential. This enforces the "never reads publishable keys" contract at the
 * resolver instead of trusting whoever populated the secret map — dropping a
 * publishable/anon key into SUPABASE_SECRET_KEYS would otherwise reopen the
 * exact open-relay hole this function exists to close.
 *
 * Deliberately conservative: only keys we can POSITIVELY prove are client-side
 * are rejected. Anything unrecognised is kept, so an unfamiliar-but-valid
 * credential format can never silently break transactional email (including
 * the payments-webhook purchase receipt).
 */
function isClientSideKey(value: string): boolean {
  // Hosted opaque publishable keys are prefix-identifiable.
  if (value.startsWith("sb_publishable_")) return true;

  // Legacy JWTs carry their role in the payload. Reject anon explicitly;
  // service_role (and anything undecodable) is left alone.
  const segments = value.split(".");
  if (segments.length !== 3) return false;
  try {
    const payload = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const decoded: unknown = JSON.parse(atob(padded));
    const role = (decoded as { role?: unknown } | null)?.role;
    return role === "anon";
  } catch {
    return false;
  }
}

function readNamedSecrets(rawValue: string | null): {
  defaultKey: string | null;
  keys: string[];
} {
  if (!rawValue) return { defaultKey: null, keys: [] };

  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { defaultKey: null, keys: [] };
    }

    const record = parsed as Record<string, unknown>;
    return {
      defaultKey: normalizeSecret(record.default),
      keys: Object.values(record)
        .map(normalizeSecret)
        .filter((value): value is string => value !== null),
    };
  } catch {
    return { defaultKey: null, keys: [] };
  }
}

/**
 * Supports hosted named secret keys, the local single-secret fallback, and
 * the legacy service-role JWT during migration. Never reads publishable keys.
 */
export function resolveTransactionalEmailSecrets(input: {
  namedSecretKeysJson: string | null;
  singleSecretKey: string | null;
  legacyServiceRoleKey: string | null;
}): TransactionalEmailSecretConfiguration {
  const named = readNamedSecrets(input.namedSecretKeysJson);
  const single = normalizeSecret(input.singleSecretKey);
  const legacy = normalizeSecret(input.legacyServiceRoleKey);
  const acceptedKeys = Array.from(
    new Set([...named.keys, single, legacy].filter((value): value is string => value !== null)),
  ).filter((value) => !isClientSideKey(value));

  return {
    acceptedKeys,
    adminKey: named.defaultKey ?? single ?? named.keys[0] ?? legacy,
  };
}

export function authorizeTransactionalEmailCaller(
  authorizationHeader: string | null,
  apiKeyHeader: string | null,
  acceptedKeys: readonly string[],
): TransactionalEmailAuthorization {
  if (!authorizationHeader && !apiKeyHeader) {
    return { ok: false, reason: "missing_authorization" };
  }

  let bearer: string | null = null;
  if (authorizationHeader) {
    const match = authorizationHeader.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      return { ok: false, reason: "invalid_authorization" };
    }
    bearer = match[1];
  }

  if (apiKeyHeader && /\s/.test(apiKeyHeader)) {
    return { ok: false, reason: "invalid_authorization" };
  }

  const candidate = apiKeyHeader || bearer;
  let matched = 0;
  for (const acceptedKey of acceptedKeys) {
    matched |= candidate ? Number(constantTimeEqual(candidate, acceptedKey)) : 0;
  }

  if (matched !== 1) {
    return { ok: false, reason: "server_secret_mismatch" };
  }

  return { ok: true };
}

export function exceedsTransactionalEmailBodyLimit(contentLengthHeader: string | null): boolean {
  if (!contentLengthHeader) return false;

  const contentLength = Number(contentLengthHeader);
  return (
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength > MAX_TRANSACTIONAL_EMAIL_BODY_BYTES
  );
}

export function exceedsTransactionalEmailBodyBytes(value: string): boolean {
  return new TextEncoder().encode(value).byteLength > MAX_TRANSACTIONAL_EMAIL_BODY_BYTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(
  body: Record<string, unknown>,
  camelCaseKey: string,
  snakeCaseKey: string,
): string | undefined {
  const value = body[camelCaseKey] ?? body[snakeCaseKey];
  return typeof value === "string" ? value : undefined;
}

export function normalizeTransactionalEmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 &&
    /^[^\s@]{1,64}@[^\s@]{1,189}$/.test(normalized) &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

export function normalizeTransactionalEmailSubject(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= MAX_TRANSACTIONAL_EMAIL_SUBJECT_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(normalized)
    ? normalized
    : null;
}

export function parseTransactionalEmailRequest(
  value: unknown,
  templateNames: readonly string[],
): TransactionalEmailRequestResult {
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_body" };
  }

  const templateName = optionalString(value, "templateName", "template_name");
  if (!templateName || !templateNames.includes(templateName)) {
    return { ok: false, reason: "invalid_template" };
  }

  const rawRecipient = value.recipientEmail ?? value.recipient_email;
  let recipientEmail: string | undefined;
  if (rawRecipient !== undefined) {
    const normalizedRecipient = normalizeTransactionalEmailAddress(rawRecipient);
    if (!normalizedRecipient) {
      return { ok: false, reason: "invalid_recipient" };
    }
    recipientEmail = normalizedRecipient;
  }

  const rawIdempotencyKey = value.idempotencyKey ?? value.idempotency_key;
  let idempotencyKey: string | undefined;
  if (rawIdempotencyKey !== undefined) {
    if (
      typeof rawIdempotencyKey !== "string" ||
      !/^[A-Za-z0-9._:-]{1,200}$/.test(rawIdempotencyKey)
    ) {
      return { ok: false, reason: "invalid_idempotency_key" };
    }
    idempotencyKey = rawIdempotencyKey;
  }

  const rawTemplateData = value.templateData ?? value.template_data ?? {};
  if (!isRecord(rawTemplateData)) {
    return { ok: false, reason: "invalid_template_data" };
  }

  return {
    ok: true,
    value: {
      templateName,
      recipientEmail,
      idempotencyKey,
      templateData: rawTemplateData,
    },
  };
}
