import { useQuery } from "@tanstack/react-query";
import { memberBadgeProfileEnabled } from "@/lib/badgeAwardFlags";
import { isProfileUserId, selectMemberProfileBadges } from "@/lib/memberBadgeProfileRules";
import { listMemberBadgeAwards } from "@/lib/memberBadgeProfileService";
import { useAuth } from "@/store/auth";

/** True only for a signed-in, non-anonymous viewer. */
export function useIsSignedInMember(): boolean {
  const user = useAuth().user as { id?: string; is_anonymous?: boolean } | null;
  return Boolean(user?.id) && user?.is_anonymous !== true;
}

export function useMemberBadgeAwards(profileUserId: string) {
  const signedIn = useIsSignedInMember();
  const enabled = memberBadgeProfileEnabled && signedIn && isProfileUserId(profileUserId);
  return useQuery({
    queryKey: ["member-badge-awards", profileUserId],
    enabled,
    queryFn: async () =>
      selectMemberProfileBadges(await listMemberBadgeAwards(profileUserId), profileUserId),
  });
}
