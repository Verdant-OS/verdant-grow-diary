import { useQuery } from "@tanstack/react-query";
import { ownerBadgeShelfEnabled } from "@/lib/badgeAwardFlags";
import { selectVisibleOwnerBadgeAwards } from "@/lib/badgeAwardRules";
import {
  evaluateOwnerBadgeAward,
  listOwnerBadgeAwards,
  type OwnerBadgeAward,
} from "@/lib/badgeAwardService";
import { useAuth } from "@/store/auth";

export function useOwnerBadgeAwards() {
  const userId = useAuth().user?.id ?? null;
  return useQuery({
    queryKey: ["owner-badge-awards", userId],
    enabled: ownerBadgeShelfEnabled && userId !== null,
    queryFn: async (): Promise<OwnerBadgeAward[]> => {
      if (!ownerBadgeShelfEnabled || userId === null) return [];
      await evaluateOwnerBadgeAward();
      return selectVisibleOwnerBadgeAwards(await listOwnerBadgeAwards(), userId);
    },
  });
}
