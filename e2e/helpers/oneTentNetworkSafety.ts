export type OneTentForbiddenNetworkKind = "paid_ai" | "device_control";

const PAID_AI_DOMAINS = ["openai.com", "anthropic.com", "mistral.ai", "groq.com"] as const;
const PAID_AI_EDGE_FUNCTION_PATHS = new Set([
  "/functions/v1/ai-doctor-review",
  "/functions/v1/ai-coach",
  "/functions/v1/ai-cultivar-qa",
]);
const DEVICE_CONTROL_PATH =
  /(?:^|\/)(?:device[-_]?commands?|device[-_]?control|control[-_]?device|actuator(?:[-_]?commands?)?|mqtt|relays?)(?:\/|$)/i;

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

  return null;
}
