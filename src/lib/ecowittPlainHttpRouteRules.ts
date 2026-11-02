/**
 * Cloudflare plain-HTTP route plan for EcoWitt gateways.
 *
 * Code only. Nothing here changes DNS, a Cloudflare dashboard, or a live
 * worker. Non-matching paths are left alone (they are not rewritten to `/`).
 * The upstream base is injected. This file has no hostnames and no secrets.
 */

export const ECOWITT_PLAIN_HTTP_MAX_BODY_BYTES = 64 * 1024;

export type EcowittPlainHttpReason = "ignore" | "method_not_post" | "payload_too_large" | "forward";

export interface EcowittPlainHttpPlan {
  readonly handled: boolean;
  readonly forward: boolean;
  readonly token: string | null;
  readonly reason: EcowittPlainHttpReason;
}

export function planEcowittPlainHttpRoute(input: {
  readonly method: string;
  readonly pathname: string;
  readonly contentLength: number | null;
}): EcowittPlainHttpPlan {
  const match = /^\/ew\/([0-9a-fA-F]{32,128})\/?$/.exec(input.pathname);
  if (!match) {
    return { handled: false, forward: false, token: null, reason: "ignore" };
  }
  const token = match[1].toLowerCase();
  if (input.method.toUpperCase() !== "POST") {
    return { handled: true, forward: false, token, reason: "method_not_post" };
  }
  if (input.contentLength !== null && input.contentLength > ECOWITT_PLAIN_HTTP_MAX_BODY_BYTES) {
    return { handled: true, forward: false, token, reason: "payload_too_large" };
  }
  return { handled: true, forward: true, token, reason: "forward" };
}

/**
 * Build the function URL the worker would call. Rejects bases that carry
 * userinfo, a query, or a fragment so a secret cannot hide in the base.
 */
export function ecowittPlainHttpUpstreamUrl(edgeBaseUrl: string, token: string): string | null {
  const base = edgeBaseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[a-z0-9._~/-]+)?$/i.test(base)) return null;
  if (base.includes("?") || base.includes("#") || base.includes("@")) return null;
  if (!/^[0-9a-f]{32,128}$/.test(token)) return null;
  return `${base}/ecowitt-custom-upload/ew/${token}`;
}
