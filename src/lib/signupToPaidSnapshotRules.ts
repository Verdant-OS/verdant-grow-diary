import type { PaidAcquisitionSource } from "@/lib/paidAcquisitionAttributionRules";

export type SignupToPaidSource = PaidAcquisitionSource | "unattributed";

export interface SignupToPaidSourceCounts {
  accounts: number;
  activePaid: number;
}

export interface SignupToPaidCounts {
  accountsTotal: number;
  activePaidTotal: number;
  attributedAccountsTotal: number;
  attributedActivePaidTotal: number;
  unattributedAccountsTotal: number;
  unattributedActivePaidTotal: number;
}

export interface SignupToPaidSnapshot {
  ok: boolean;
  reason: string | null;
  reasonLabel: string | null;
  generatedAt: string | null;
  counts: SignupToPaidCounts;
  sources: Readonly<Record<SignupToPaidSource, SignupToPaidSourceCounts>>;
}

export interface SignupToPaidSourceRow extends SignupToPaidSourceCounts {
  id: SignupToPaidSource;
  label: string;
  activePaidRatePercent: number | null;
  sampleStatus: "unavailable" | "directional" | "usable";
  integrityMismatch: boolean;
}

export interface SignupToPaidFunnelViewModel {
  rows: readonly SignupToPaidSourceRow[];
  bestObservedSource: SignupToPaidSourceRow | null;
  recommendation: string;
}

const ATTRIBUTED_SOURCES = [
  "landing_page",
  "pricing_page",
  "founder_page",
  "founder_share",
  "pricing_interest_share",
  "operator_outreach",
  "grower_invite",
  "context_check",
  "vpd_calculator",
] as const satisfies readonly PaidAcquisitionSource[];

export const SIGNUP_TO_PAID_SOURCES = [
  ...ATTRIBUTED_SOURCES,
  "unattributed",
] as const satisfies readonly SignupToPaidSource[];

export const SIGNUP_TO_PAID_SOURCE_LABELS: Readonly<Record<SignupToPaidSource, string>> =
  Object.freeze({
    landing_page: "Landing page",
    pricing_page: "Pricing page",
    founder_page: "Founder page",
    founder_share: "Founder shares",
    pricing_interest_share: "Paid-interest shares",
    operator_outreach: "Operator outreach",
    grower_invite: "Grower invites",
    context_check: "AI Doctor context check",
    vpd_calculator: "VPD calculator",
    unattributed: "Source unavailable",
  });

const EMPTY_SOURCE_COUNTS: SignupToPaidSourceCounts = Object.freeze({ accounts: 0, activePaid: 0 });
const EMPTY_COUNTS: SignupToPaidCounts = Object.freeze({
  accountsTotal: 0,
  activePaidTotal: 0,
  attributedAccountsTotal: 0,
  attributedActivePaidTotal: 0,
  unattributedAccountsTotal: 0,
  unattributedActivePaidTotal: 0,
});

const REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  not_authenticated: "Sign in is required to view signup-to-paid conversion.",
  operator_required: "Operator role is required to view signup-to-paid conversion.",
  unknown_response: "Signup-to-paid conversion data was not recognized.",
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

function emptySources(): Record<SignupToPaidSource, SignupToPaidSourceCounts> {
  return Object.fromEntries(
    SIGNUP_TO_PAID_SOURCES.map((source) => [source, { ...EMPTY_SOURCE_COUNTS }]),
  ) as Record<SignupToPaidSource, SignupToPaidSourceCounts>;
}

/** Discards every response field except fixed aggregate count and source keys. */
export function parseSignupToPaidSnapshot(input: unknown): SignupToPaidSnapshot {
  if (!isRecord(input)) {
    return {
      ok: false,
      reason: "unknown_response",
      reasonLabel: REASON_LABELS.unknown_response,
      generatedAt: null,
      counts: { ...EMPTY_COUNTS },
      sources: emptySources(),
    };
  }

  const ok = input.ok === true;
  const reason = asString(input.reason) ?? (ok ? null : "unknown_response");
  const rawCounts = isRecord(input.counts) ? input.counts : {};
  const rawSources = isRecord(input.sources) ? input.sources : {};
  const sources = emptySources();

  for (const source of SIGNUP_TO_PAID_SOURCES) {
    const raw = isRecord(rawSources[source]) ? rawSources[source] : {};
    sources[source] = {
      accounts: asCount(raw.accounts),
      activePaid: asCount(raw.active_paid),
    };
  }

  return {
    ok,
    reason,
    reasonLabel: reason
      ? (REASON_LABELS[reason] ?? "Signup-to-paid conversion data is unavailable.")
      : null,
    generatedAt: asString(input.generated_at),
    counts: {
      accountsTotal: asCount(rawCounts.accounts_total),
      activePaidTotal: asCount(rawCounts.active_paid_total),
      attributedAccountsTotal: asCount(rawCounts.attributed_accounts_total),
      attributedActivePaidTotal: asCount(rawCounts.attributed_active_paid_total),
      unattributedAccountsTotal: asCount(rawCounts.unattributed_accounts_total),
      unattributedActivePaidTotal: asCount(rawCounts.unattributed_active_paid_total),
    },
    sources,
  };
}

function buildRate(accounts: number, activePaid: number): number | null {
  if (accounts === 0 || activePaid > accounts) return null;
  return Math.round((activePaid / accounts) * 1_000) / 10;
}

/**
 * Produces a stable, conservative ranking. Five account starts are required
 * before a source can be called usable; smaller samples remain directional.
 */
export function buildSignupToPaidFunnelViewModel(
  snapshot: SignupToPaidSnapshot,
): SignupToPaidFunnelViewModel {
  const rows = SIGNUP_TO_PAID_SOURCES.map((id): SignupToPaidSourceRow => {
    const source = snapshot.sources[id];
    const integrityMismatch = source.activePaid > source.accounts;
    return {
      id,
      label: SIGNUP_TO_PAID_SOURCE_LABELS[id],
      accounts: source.accounts,
      activePaid: source.activePaid,
      activePaidRatePercent: buildRate(source.accounts, source.activePaid),
      sampleStatus:
        source.accounts === 0 ? "unavailable" : source.accounts < 5 ? "directional" : "usable",
      integrityMismatch,
    };
  });

  const ranked = rows
    .filter(
      (row) =>
        row.id !== "unattributed" &&
        row.sampleStatus === "usable" &&
        !row.integrityMismatch &&
        row.activePaid > 0,
    )
    .sort((a, b) => {
      if (a.activePaid !== b.activePaid) return b.activePaid - a.activePaid;
      if (a.activePaidRatePercent !== b.activePaidRatePercent) {
        return (b.activePaidRatePercent ?? 0) - (a.activePaidRatePercent ?? 0);
      }
      if (a.accounts !== b.accounts) return b.accounts - a.accounts;
      return a.id.localeCompare(b.id);
    });

  const bestObservedSource = ranked[0] ?? null;
  let recommendation =
    "Keep acquisition tags live until at least one source has five account starts and one active-paid subscriber.";

  if (
    snapshot.counts.attributedAccountsTotal > 0 &&
    snapshot.counts.attributedActivePaidTotal === 0
  ) {
    recommendation =
      "Attributed account starts exist, but none currently match an active-paid entitlement. Review signup verification, pricing, and checkout handoff before scaling traffic.";
  } else if (bestObservedSource) {
    recommendation = `${bestObservedSource.label} has the strongest observed active-paid volume among usable attributed cohorts. Prioritize a reviewed repeat of that path while monitoring retention and sample size.`;
  }

  return { rows, bestObservedSource, recommendation };
}
