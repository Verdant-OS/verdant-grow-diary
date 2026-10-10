/**
 * Display flag for the owner badge shelf.
 *
 * This constant is presentation only. The evaluator never reads it.
 * `badge_award_runtime.enabled` is the server kill switch and stays false
 * until Matthew sets that single row with service_role.
 *
 * Petal must approve `badgeAwardCopy` before this flag is ever turned on.
 * Turning this flag on does not award a badge.
 */
export const ownerBadgeShelfEnabled = false as const;
