export type OneTentForbiddenNetworkKind =
  "paid_ai" | "device_control" | "service_role" | "action_queue_approval" | "paddle_checkout";

const PAID_AI_DOMAINS = ["openai.com", "anthropic.com", "mistral.ai", "groq.com"] as const;
const PAID_AI_EDGE_FUNCTION_PATHS = new Set([
  "/functions/v1/ai-doctor-review",
  "/functions/v1/ai-coach",
  "/functions/v1/ai-cultivar-qa",
]);
const DEVICE_CONTROL_PATH =
  /(?:^|\/)(?:device[-_]?commands?|device[-_]?control|control[-_]?device|actuator(?:[-_]?commands?)?|mqtt|relays?)(?:\/|$)/i;
const ACTION_QUEUE_APPROVAL_PATH =
  /(?:^|\/)(?:action[-_]?queue[-_]?approve|action_queue_transition)(?:\/|$)/i;
const PADDLE_PATH = /(?:^|\/)(?:paddle[-_]?checkout|paddle[-_]?webhook)(?:\/|$)/i;

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function isOneTentAiDoctorReviewEndpoint(rawUrl: string, targetProjectRef: string): boolean {
  const normalizedProjectRef = targetProjectRef.trim();
  if (!/^[a-z0-9]{20}$/.test(normalizedProjectRef)) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return (
      url.origin === `https://${normalizedProjectRef}.supabase.co` &&
      url.pathname === "/functions/v1/ai-doctor-review"
    );
  } catch {
    return false;
  }
}

function jwtRole(value: string): string | null {
  const token = value.replace(/^Bearer\s+/i, "").trim();
  if (token === "service_role" || /^sb_secret_/i.test(token)) return "service_role";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

export function hasOneTentServiceRoleCredential(headers: Record<string, string>): boolean {
  return Object.entries(headers).some(
    ([name, value]) =>
      ["authorization", "apikey"].includes(name.toLowerCase()) && jwtRole(value) === "service_role",
  );
}

/**
 * Classify network destinations the authenticated proof must never contact.
 * Pure and deliberately URL-based so comments, UI copy, and Vite module names
 * cannot trip the runtime fence.
 */
export function classifyOneTentForbiddenNetworkRequest(
  rawUrl: string,
): OneTentForbiddenNetworkKind | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "generativelanguage.googleapis.com" ||
    hostname === "ai.gateway.lovable.dev" ||
    PAID_AI_EDGE_FUNCTION_PATHS.has(url.pathname) ||
    PAID_AI_DOMAINS.some((domain) => isDomainOrSubdomain(hostname, domain))
  ) {
    return "paid_ai";
  }

  if (["mqtt:", "mqtts:"].includes(url.protocol) || DEVICE_CONTROL_PATH.test(url.pathname)) {
    return "device_control";
  }

  if (ACTION_QUEUE_APPROVAL_PATH.test(url.pathname)) return "action_queue_approval";

  if (
    isDomainOrSubdomain(hostname, "paddle.com") ||
    isDomainOrSubdomain(hostname, "paddlecdn.com") ||
    PADDLE_PATH.test(url.pathname)
  ) {
    return "paddle_checkout";
  }

  return null;
}
