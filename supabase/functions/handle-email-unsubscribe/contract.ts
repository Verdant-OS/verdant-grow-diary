export const MAX_UNSUBSCRIBE_BODY_BYTES = 4 * 1024;

export type UnsubscribeAction = "validate" | "unsubscribe";

export type UnsubscribeRequest =
  | { ok: true; token: string; action: UnsubscribeAction }
  | { ok: false; reason: "invalid_body" | "invalid_token" | "invalid_action" };

export function isValidUnsubscribeToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export function exceedsUnsubscribeBodyBytes(value: string): boolean {
  return new TextEncoder().encode(value).byteLength > MAX_UNSUBSCRIBE_BODY_BYTES;
}

export function resolveUnsubscribeAdminKey(input: {
  namedSecretKeysJson: string | null;
  singleSecretKey: string | null;
  legacyServiceRoleKey: string | null;
}): string | null {
  if (input.namedSecretKeysJson) {
    try {
      const parsed: unknown = JSON.parse(input.namedSecretKeysJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const values = parsed as Record<string, unknown>;
        const defaultKey = values.default;
        if (typeof defaultKey === "string" && defaultKey.length > 0) {
          return defaultKey;
        }
        const firstNamedKey = Object.values(values).find(
          (value): value is string => typeof value === "string" && value.length > 0,
        );
        if (firstNamedKey) return firstNamedKey;
      }
    } catch {
      // Continue to the local and legacy fallbacks.
    }
  }

  if (input.singleSecretKey) return input.singleSecretKey;
  return input.legacyServiceRoleKey || null;
}

export function parseUnsubscribeJsonRequest(
  value: unknown,
  fallbackToken: string | null,
): UnsubscribeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid_body" };
  }

  const record = value as Record<string, unknown>;
  const token = record.token ?? fallbackToken;
  if (!isValidUnsubscribeToken(token)) {
    return { ok: false, reason: "invalid_token" };
  }

  const action = record.action ?? "unsubscribe";
  if (action !== "validate" && action !== "unsubscribe") {
    return { ok: false, reason: "invalid_action" };
  }

  return { ok: true, token, action };
}

export function parseUnsubscribeFormRequest(
  body: string,
  fallbackToken: string | null,
): UnsubscribeRequest {
  const params = new URLSearchParams(body);
  const oneClick = params.get("List-Unsubscribe") === "One-Click";
  const token = fallbackToken ?? params.get("token");

  if (!oneClick && !params.has("token")) {
    return { ok: false, reason: "invalid_body" };
  }
  if (!isValidUnsubscribeToken(token)) {
    return { ok: false, reason: "invalid_token" };
  }

  return { ok: true, token, action: "unsubscribe" };
}
