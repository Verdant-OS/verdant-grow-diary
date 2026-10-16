/**
 * Documentation wording for owner badges.
 *
 * Cut 001: any photo attached to the owner's own diary entry earns First
 * Diary Entry, including a photo added later to an entry saved without
 * one. Note text is not required. These lines do not claim skill, rank,
 * yield, safety, or that a badge was verified. They do not shame a
 * text-only entry. This shelf is the owner view. A later slice shows
 * badges on the grower's profile. Signed-in members can read active
 * awards. Logged-out visitors see no awards. Evidence photos stay
 * private to the owning account.
 * Petal must approve this copy before ownerBadgeShelfEnabled is turned on.
 */
export const BADGE_AWARD_COPY = {
  shelfLabel: "Documented milestones",
  firstDiaryEntry: "You saved a diary entry with a photo attached.",
  firstTent: "You documented your first tent with a photo.",
  setupDocumented: "You documented an assembled tent and the equipment installed in it.",
  firstRecordedHarvest: "You recorded a harvest and linked a photo of it.",
} as const;
