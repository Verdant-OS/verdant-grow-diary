/**
 * Paywall CTA view model — Slice P2 foundation.
 *
 * Pure helper that prepares calm, presenter-ready copy for any surface
 * that wants to explain what upgrading unlocks. This module deliberately
 * has:
 *
 *   - no React imports
 *   - no payment-provider logic (Paddle / Stripe / etc.)
 *   - no checkout side effects
 *   - no current-tier context (Slice P3 territory)
 *   - no tier-gated routing behavior
 *
 * It is copy + structure only. Mount it inside an existing presenter
 * component (`<PaywallCta />`) on surfaces that are already billing- or
 * upgrade-shaped (e.g. `/billing/:plan` placeholder). It must NOT be
 * used to gate access to a route.
 *
 * Banned strings (must not appear in any human-facing CTA output):
 *   confirmed, certain, synced, connected, imported, guaranteed,
 *   live data, live feed.
 */

export interface PaywallCtaInput {
  /** Feature / page title being gated (e.g. "Advanced timeline filtering"). */
  featureTitle?: string;
  /** Plan label the feature requires (e.g. "Pro", "Founder Lifetime"). */
  requiredPlanLabel?: string;
  /** Optional label for the user's current plan, if known. */
  currentPlanLabel?: string;
  /** Optional override for the unlock bullets. If omitted, calm defaults are used. */
  unlockBullets?: ReadonlyArray<string>;
  /** Optional override for the primary CTA label. */
  primaryCtaLabel?: string;
  /** Optional override for the pricing route href. Defaults to "/pricing". */
  pricingHref?: string;
  /** Optional explanatory copy under the bullets. */
  secondaryCopy?: string;
}

export interface PaywallCtaViewModel {
  title: string;
  requiredPlanLabel: string;
  currentPlanLabel?: string;
  description: string;
  unlockBullets: ReadonlyArray<string>;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCopy?: string;
}

const DEFAULT_PRICING_HREF = "/pricing";
const DEFAULT_REQUIRED_PLAN_LABEL = "Pro";
const DEFAULT_TITLE = "Upgrade to unlock this part of Verdant";
const DEFAULT_PRIMARY_CTA_LABEL = "See plans";

/**
 * Calm, banned-word-free default unlock bullets. These describe Pro-tier
 * capabilities in neutral language. They intentionally avoid claims like
 * "live", "synced", or "guaranteed".
 */
const DEFAULT_UNLOCK_BULLETS: ReadonlyArray<string> = [
  "Unlimited grows and full grow history",
  "More AI Doctor credits each month",
  "Read-only sensor integrations where available",
  "Full Action Queue with approval-required steps",
  "Advanced timeline filtering and sensor snapshot history",
  "Exports and backups of your grow data",
];

const BANNED_WORDS: ReadonlyArray<string> = [
  "confirmed",
  "certain",
  "synced",
  "connected",
  "imported",
  "guaranteed",
  "live data",
  "live feed",
];

/** True if `text` contains any banned substring (case-insensitive). */
export function paywallCtaHasBannedWords(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some((b) => lower.includes(b));
}

/** Returns the banned words present in `text` (lowercased, deduped, sorted). */
export function paywallCtaFindBannedWords(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const b of BANNED_WORDS) if (lower.includes(b)) hits.add(b);
  return [...hits].sort();
}

function describePlanSentence(
  requiredPlan: string,
  currentPlan: string | undefined,
): string {
  if (currentPlan && currentPlan.trim() && currentPlan !== requiredPlan) {
    return `You are on ${currentPlan}. ${requiredPlan} unlocks more of Verdant's grow memory and operator tools.`;
  }
  return `${requiredPlan} unlocks more of Verdant's grow memory and operator tools.`;
}

/**
 * Build a presenter-ready paywall CTA view model. Pure function — given the
 * same input it always returns the same output. No I/O, no React, no
 * payment-provider calls.
 */
export function buildPaywallCtaViewModel(
  input: PaywallCtaInput = {},
): PaywallCtaViewModel {
  const requiredPlanLabel =
    input.requiredPlanLabel?.trim() || DEFAULT_REQUIRED_PLAN_LABEL;
  const currentPlanLabel = input.currentPlanLabel?.trim() || undefined;
  const featureTitle = input.featureTitle?.trim();

  const title = featureTitle
    ? `${featureTitle} is part of ${requiredPlanLabel}`
    : DEFAULT_TITLE;

  const bullets =
    input.unlockBullets && input.unlockBullets.length > 0
      ? input.unlockBullets.map((b) => b.trim()).filter((b) => b.length > 0)
      : DEFAULT_UNLOCK_BULLETS;

  const description = describePlanSentence(requiredPlanLabel, currentPlanLabel);

  return {
    title,
    requiredPlanLabel,
    currentPlanLabel,
    description,
    unlockBullets: bullets,
    primaryCtaLabel:
      input.primaryCtaLabel?.trim() || DEFAULT_PRIMARY_CTA_LABEL,
    primaryCtaHref: input.pricingHref?.trim() || DEFAULT_PRICING_HREF,
    secondaryCopy: input.secondaryCopy?.trim() || undefined,
  };
}

/**
 * Convenience: returns every human-facing string in the view model as a
 * single concatenated blob. Useful for banned-word assertions in tests.
 */
export function paywallCtaViewModelText(vm: PaywallCtaViewModel): string {
  return [
    vm.title,
    vm.description,
    vm.primaryCtaLabel,
    vm.requiredPlanLabel,
    vm.currentPlanLabel ?? "",
    vm.secondaryCopy ?? "",
    ...vm.unlockBullets,
  ].join("\n");
}
