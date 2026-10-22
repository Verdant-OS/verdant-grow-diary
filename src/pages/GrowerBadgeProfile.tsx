import { MEMBER_BADGE_PROFILE_COPY } from "@/constants/memberBadgeProfileCopy";
import { useIsSignedInMember, useMemberBadgeAwards } from "@/hooks/useMemberBadgeAwards";

/** A grower's badges as another signed-in member sees them. No evidence photos. */
export default function GrowerBadgeProfile({ profileUserId }: { profileUserId: string }) {
  const signedIn = useIsSignedInMember();
  const query = useMemberBadgeAwards(profileUserId);
  const badges = query.data ?? [];

  return (
    <main className="mx-auto max-w-2xl p-4" data-testid="grower-badge-profile">
      <h1 className="text-lg font-semibold">{MEMBER_BADGE_PROFILE_COPY.pageTitle}</h1>
      {!signedIn ? (
        <p className="text-sm text-muted-foreground mt-2">{MEMBER_BADGE_PROFILE_COPY.signedOut}</p>
      ) : badges.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-2">{MEMBER_BADGE_PROFILE_COPY.empty}</p>
      ) : (
        <ul className="mt-2 space-y-1" data-testid="member-badge-list">
          {badges.map((badge) => (
            <li key={badge.id} className="text-sm" data-testid={`member-badge-${badge.badgeKey}`}>
              {badge.copy}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
