/**
 * Which award rows a member may see on another grower's profile.
 *
 * RLS (badge_awards_member_select) already limits signed-in members to
 * active rows and gives anon nothing. This mirror keeps the page honest if a
 * row slips through: other users, hidden, revoked, and unknown keys are
 * dropped. Pure; no I/O.
 */
import { MEMBER_BADGE_PROFILE_COPY } from "@/constants/memberBadgeProfileCopy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BADGE_COPY: Record<string, string> = {
  first_diary_entry: MEMBER_BADGE_PROFILE_COPY.firstDiaryEntry,
  first_tent: MEMBER_BADGE_PROFILE_COPY.firstTent,
  setup_documented: MEMBER_BADGE_PROFILE_COPY.setupDocumented,
  first_recorded_harvest: MEMBER_BADGE_PROFILE_COPY.firstRecordedHarvest,
};

export interface MemberBadgeAwardRow {
  id: string;
  userId: string;
  badgeKey: string;
  firstRecognizedAt: string;
  hiddenAt: string | null;
  revokedAt: string | null;
}

export interface MemberProfileBadge {
  id: string;
  badgeKey: string;
  copy: string;
}

export function isProfileUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function selectMemberProfileBadges(
  rows: readonly MemberBadgeAwardRow[],
  profileUserId: string | null | undefined,
): MemberProfileBadge[] {
  if (!isProfileUserId(profileUserId)) return [];
  return rows
    .filter(
      (row) =>
        row.userId === profileUserId &&
        row.hiddenAt === null &&
        row.revokedAt === null &&
        row.badgeKey in BADGE_COPY,
    )
    .sort(
      (a, b) => a.firstRecognizedAt.localeCompare(b.firstRecognizedAt) || a.id.localeCompare(b.id),
    )
    .map((row) => ({ id: row.id, badgeKey: row.badgeKey, copy: BADGE_COPY[row.badgeKey] }));
}
