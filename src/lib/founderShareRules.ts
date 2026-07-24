import { FOUNDER_SOCIAL_META } from "@/constants/founderSocialMeta";

export const FOUNDER_SHARE_URL =
  `${FOUNDER_SOCIAL_META.url}?utm_source=founder_share&utm_medium=referral&utm_campaign=founder_launch` as const;

export interface FounderShareData {
  title: string;
  text: string;
  url: typeof FOUNDER_SHARE_URL;
}

export function buildFounderShareData(): FounderShareData {
  return {
    title: "Verdant Founder Lifetime",
    text: "A grow OS built around plant memory, sensor truth, and grower-approved decisions.",
    url: FOUNDER_SHARE_URL,
  };
}
