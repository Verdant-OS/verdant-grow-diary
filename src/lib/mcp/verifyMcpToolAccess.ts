/**
 * Verify-tool-access helper for the Agent Integrations settings page.
 *
 * SAFETY:
 * - Pure view-model. Deterministic result shape.
 * - NEVER exposes tokens, refresh tokens, service_role keys, bearer
 *   strings, OAuth client secrets, raw response rows, raw headers, or
 *   private env values.
 * - The helper receives a small `HarnessAdapter` so this module has no
 *   hosted-Supabase dependency and unit tests can inject a safe fake.
 *   When the app is not test-mode and no harness adapter is available,
 *   we surface "harness unavailable" — we do NOT try live MCP calls
 *   from the browser.
 */

export type VerifyStatus =
  | "authorized"
  | "unauthorized"
  | "harness_unavailable"
  | "failed";

export type VerifyMcpToolAccessResult = {
  status: VerifyStatus;
  label: string;
  description: string;
  toolChecked?: "list_grows";
  /** Safe count of grows returned (never IDs). Optional. */
  growCount?: number;
  /** ISO string, only supplied when caller passes a deterministic clock. */
  checkedAt?: string;
};

export type HarnessProbe = () => Promise<{
  ok: boolean;
  /** true iff the caller was unauthenticated per the tool contract. */
  unauthenticated?: boolean;
  /** safe count only. Never row content. */
  growCount?: number;
}>;

export type HarnessAdapter = {
  available: boolean;
  probe?: HarnessProbe;
};

export type VerifyOptions = {
  adapter?: HarnessAdapter;
  now?: () => Date;
};

const LABELS: Record<VerifyStatus, { label: string; description: string }> = {
  authorized: {
    label: "Authorized",
    description: "list_grows is reachable for the signed-in grower.",
  },
  unauthorized: {
    label: "Unauthorized",
    description: "Connect or approve OAuth access first.",
  },
  harness_unavailable: {
    label: "Verification harness unavailable",
    description: "Local test harness is not configured.",
  },
  failed: {
    label: "Verification failed",
    description: "Try again or check configuration.",
  },
};

function build(
  status: VerifyStatus,
  extra: Partial<VerifyMcpToolAccessResult> = {},
): VerifyMcpToolAccessResult {
  return { status, ...LABELS[status], toolChecked: "list_grows", ...extra };
}

export async function verifyMcpToolAccess(
  options: VerifyOptions = {},
): Promise<VerifyMcpToolAccessResult> {
  const adapter = options.adapter;
  const checkedAt = options.now?.().toISOString();

  if (!adapter || !adapter.available || !adapter.probe) {
    return build("harness_unavailable", { checkedAt });
  }

  try {
    const result = await adapter.probe();
    if (result.unauthenticated) return build("unauthorized", { checkedAt });
    if (result.ok) {
      return build("authorized", {
        checkedAt,
        growCount:
          typeof result.growCount === "number" && result.growCount >= 0
            ? result.growCount
            : undefined,
      });
    }
    return build("failed", { checkedAt });
  } catch {
    // Deliberately swallow error details — the raw error object may
    // include headers, tokens, or private env values.
    return build("failed", { checkedAt });
  }
}

/**
 * Default browser-side harness adapter. The browser has no safe way to
 * perform a real local MCP probe without exposing tokens, so we always
 * return `available: false`. Tests inject their own adapter.
 */
export const defaultBrowserHarness: HarnessAdapter = { available: false };
