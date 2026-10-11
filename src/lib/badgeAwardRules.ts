/**
 * Display mirror for owner badges.
 *
 * Qualification, photo checks, and the kill switch live in
 * public.badge_awards_evaluate_owner. This module only decides which
 * already-awarded rows the shelf may show. It does not award anything,
 * and it does not show badges on a profile. Signed-in members can read
 * active award rows. Evidence photos stay private to the owning account.
 */
export const FIRST_DIARY_ENTRY_BADGE_KEY = "first_diary_entry" as const;

const FORBIDDEN_BADGE_COPY = /\b(skill|rank|yield|safety|verified)\b/i;

export interface OwnerBadgeAwardView {
  badgeKey: string;
  hiddenAt: string | null;
  revokedAt?: string | null;
}

export function badgeCopyAvoidsRankLanguage(copy: readonly string[]): boolean {
  return copy.every((line) => !FORBIDDEN_BADGE_COPY.test(line));
}

export function selectVisibleOwnerBadgeAwards<T extends OwnerBadgeAwardView>(
  awards: readonly T[],
): T[] {
  return awards.filter(
    (award) =>
      award.badgeKey === FIRST_DIARY_ENTRY_BADGE_KEY &&
      award.hiddenAt === null &&
      award.revokedAt == null,
  );
}
