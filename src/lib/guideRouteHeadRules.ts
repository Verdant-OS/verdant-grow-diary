/**
 * <head> for /guides/$slug. A slug that is not a published guide must never
 * inherit the root "index, follow": the page only redirects to /guides on the
 * client, so crawlers would otherwise index an empty 200. No canonical either,
 * so the unknown URL is never folded into /guides.
 */
import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { staticRouteHead, type StaticRouteHead } from "@/lib/build/staticRouteHead";

export const UNKNOWN_GUIDE_ROBOTS = "noindex, follow" as const;

export function guideRouteHead(slug: string | undefined): StaticRouteHead {
  const guide = findGuideBySlug(slug);
  if (!guide) {
    return { meta: [{ name: "robots", content: UNKNOWN_GUIDE_ROBOTS }], links: [], scripts: [] };
  }
  return staticRouteHead(`/guides/${guide.slug}`);
}
