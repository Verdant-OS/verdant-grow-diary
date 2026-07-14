/** Pure, PII-free parsing rules for the operator account-acquisition snapshot. */

export interface SignupAcquisitionCounts {
  accountsTotal: number;
  accounts7d: number;
  attributedTotal: number;
  attributed7d: number;
  unattributedTotal: number;
  landingPage: number;
  pricingPage: number;
  founderPage: number;
  founderShare: number;
  pricingInterestShare: number;
  growerInvite: number;
  contextCheck: number;
}

export interface SignupAcquisitionSnapshot {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  counts: SignupAcquisitionCounts;
}

const EMPTY_COUNTS: SignupAcquisitionCounts = Object.freeze({
  accountsTotal: 0,
  accounts7d: 0,
  attributedTotal: 0,
  attributed7d: 0,
  unattributedTotal: 0,
  landingPage: 0,
  pricingPage: 0,
  founderPage: 0,
  founderShare: 0,
  pricingInterestShare: 0,
  growerInvite: 0,
  contextCheck: 0,
});

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  not_authenticated: "Sign in is required to view account acquisition.",
  operator_required: "Operator role is required to view account acquisition.",
  unknown_response: "Account acquisition data was not recognized.",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Discards every response field except the fixed aggregate count allowlist. */
export function parseSignupAcquisitionSnapshot(input: unknown): SignupAcquisitionSnapshot {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: REASON_LABELS.unknown_response,
      generatedAt: null,
      counts: { ...EMPTY_COUNTS },
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const raw = isRecord(input.counts) ? input.counts : {};

  return {
    ok,
    reason,
    reasonLabel: reason
      ? (REASON_LABELS[reason] ?? "Account acquisition data is unavailable.")
      : null,
    generatedAt: asString(input.generated_at),
    counts: {
      accountsTotal: asCount(raw.accounts_total),
      accounts7d: asCount(raw.accounts_7d),
      attributedTotal: asCount(raw.attributed_total),
      attributed7d: asCount(raw.attributed_7d),
      unattributedTotal: asCount(raw.unattributed_total),
      landingPage: asCount(raw.landing_page),
      pricingPage: asCount(raw.pricing_page),
      founderPage: asCount(raw.founder_page),
      founderShare: asCount(raw.founder_share),
      pricingInterestShare: asCount(raw.pricing_interest_share),
      growerInvite: asCount(raw.grower_invite),
      contextCheck: asCount(raw.context_check),
    },
  };
}
