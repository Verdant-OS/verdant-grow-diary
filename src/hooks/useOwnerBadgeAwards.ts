import { useQuery } from "@tanstack/react-query";
import { ownerBadgeShelfEnabled } from "@/lib/badgeAwardFlags";
import {
  evaluateOwnerBadgeAward,
  listOwnerBadgeAwards,
  type OwnerBadgeAward,
} from "@/lib/badgeAwardService";

export function useOwnerBadgeAwards() {
  return useQuery({
    queryKey: ["owner-badge-awards"],
    enabled: ownerBadgeShelfEnabled,
    queryFn: async (): Promise<OwnerBadgeAward[]> => {
      if (!ownerBadgeShelfEnabled) return [];
      await evaluateOwnerBadgeAward();
      return listOwnerBadgeAwards();
    },
  });
}
