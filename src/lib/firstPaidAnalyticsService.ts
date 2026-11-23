import { readAnalyticsConsent, type AnalyticsConsentDecision } from "@/lib/analyticsConsent";
import { decidePostHogStartup, posthogDistinctId } from "@/lib/posthogAnalyticsRules";

export const FIRST_PAID_CONSENT_KEY = "verdant.analytics.first-paid-since.v1";
const SENT_RECEIPT = "verdant.analytics.first-paid-receipt.v1";
let storageFailed = false;

// Older grants covered page usage. Only a choice made with the upgrade disclosure starts a window.
export function recordPaidAnalyticsChoice(
  decision: AnalyticsConsentDecision,
  now = Date.now(),
): void {
  if (typeof window === "undefined") return;
  try {
    if (decision === "granted") {
      window.localStorage.setItem(FIRST_PAID_CONSENT_KEY, String(now));
    } else {
      window.localStorage.removeItem(FIRST_PAID_CONSENT_KEY);
      window.localStorage.removeItem(SENT_RECEIPT);
    }
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
}

export function readPaidAnalyticsSince(): number | null {
  if (storageFailed || readAnalyticsConsent() !== "granted") return null;
  try {
    const at = Number(window.localStorage.getItem(FIRST_PAID_CONSENT_KEY));
    return Number.isSafeInteger(at) && at > 0 ? at : null;
  } catch {
    return null;
  }
}

type ActivationReceipt = { account_id: string; event_id: string; activated_at: string };

function isOwnReceipt(value: unknown, accountId: string): value is ActivationReceipt {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ActivationReceipt>;
  return (
    row.account_id === accountId &&
    !!posthogDistinctId(row.event_id) &&
    typeof row.activated_at === "string"
  );
}

async function lookupReceipt(signal: AbortSignal): Promise<unknown> {
  const { supabase } = await import("@/integrations/supabase/client");
  // The additive no-argument RPC is scoped by auth.uid(). Generated types follow the DB release.
  const rpc = supabase as unknown as {
    rpc(name: "get_my_first_paid_activation"): {
      abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
  const { data, error } = await rpc.rpc("get_my_first_paid_activation").abortSignal(signal);
  if (error || !data || signal.aborted) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session && isOwnReceipt(data, session.user.id) ? data : null;
}

function safeRawUserAgent(value: string | undefined): string | undefined {
  if (!value || value.length > 512 || value !== value.trim()) return undefined;
  if (value.includes("@") || value.includes("\n") || value.includes("\r")) return undefined;
  return value;
}

function collectionConfig() {
  return decidePostHogStartup({
    decision: readAnalyticsConsent(),
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    key: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST,
  });
}

/** True once the receiving endpoint has accepted this receipt or this device already sent it. */
export async function reportFirstPaidActivation(
  accountId: string,
  signal: AbortSignal,
  deps: { lookup?: typeof lookupReceipt; send?: typeof fetch } = {},
): Promise<boolean> {
  try {
    const since = readPaidAnalyticsSince();
    if (
      since === null ||
      signal.aborted ||
      !posthogDistinctId(accountId) ||
      !collectionConfig().enabled
    ) {
      return false;
    }
    const receipt = await (deps.lookup ?? lookupReceipt)(signal);
    if (!isOwnReceipt(receipt, accountId)) return false;
    const at = Date.parse(receipt.activated_at);
    const config = collectionConfig();
    if (
      !Number.isFinite(at) ||
      at < since ||
      at > Date.now() ||
      signal.aborted ||
      readPaidAnalyticsSince() !== since ||
      !config.enabled
    )
      return false;
    if (window.localStorage.getItem(SENT_RECEIPT) === receipt.event_id) return true;

    // Same string checks as the PostHog before_send user-agent copy: 512 characters,
    // no email-shaped text, no line breaks. Missing that field is classified as Automation.
    const userAgent = safeRawUserAgent(
      typeof navigator === "undefined" ? undefined : navigator.userAgent,
    );
    const response = await (deps.send ?? fetch)(`${config.apiHost}/i/v0/e/`, {
      method: "POST",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: config.key,
        distinct_id: accountId,
        event: "subscription_activated",
        uuid: receipt.event_id,
        timestamp: new Date(at).toISOString(),
        properties: {
          $geoip_disable: true,
          ...(userAgent ? { $raw_user_agent: userAgent } : {}),
        },
      }),
      signal,
    });
    if (!response.ok) return false;
    if (!signal.aborted && readPaidAnalyticsSince() === since) {
      window.localStorage.setItem(SENT_RECEIPT, receipt.event_id);
    }
    return true;
  } catch {
    // Network, missing migration or unavailable storage must never interrupt the diary or billing.
    return false;
  }
}
