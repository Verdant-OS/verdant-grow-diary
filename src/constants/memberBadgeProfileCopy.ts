/**
 * Member-facing wording for a grower's badge profile (Cut 001 AC7).
 *
 * Third person, because the reader is another signed-in member. Like
 * `badgeAwardCopy`, these lines claim no skill, rank, yield, safety, or
 * verification. Evidence photos are not shown here: member access to
 * evidence is AC11 and is not built. Petal must approve this copy before
 * `memberBadgeProfileEnabled` is turned on.
 */
export const MEMBER_BADGE_PROFILE_COPY = {
  pageTitle: "Grower badges",
  empty: "No badges to show yet.",
  signedOut: "Sign in to see this grower's badges.",
  firstDiaryEntry: "Saved a diary entry with a photo attached.",
  firstTent: "Documented a first tent with a photo.",
  setupDocumented: "Documented an assembled tent and the equipment installed in it.",
  firstRecordedHarvest: "Recorded a harvest and linked a photo of it.",
} as const;
