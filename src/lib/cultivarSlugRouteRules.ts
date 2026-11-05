/**
 * How `/cultivars/$slug` decides found, redirect, not-found, or unavailable.
 * Pure: no Supabase, no fetch, no clock. The catalog read and its per-request
 * cache live in `cultivarSlugRouteService.ts`, which the route loader and the
 * SSR head both call so they cannot disagree.
 */
import { VERDANT_CULTIVAR_SLUGS, VERDANT_CULTIVARS } from "@/constants/strainReferenceLibrary";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import { cultivarDetailRobots } from "@/lib/cultivarDetailSeo";
import {
  mapCultivarDatabaseSnapshot,
  type CultivarDatabaseSnapshot,
} from "@/lib/cultivarDatabaseReadModel";
import { staticRouteHead, type StaticRouteHead } from "@/lib/build/staticRouteHead";

export type CultivarSlugDecision =
  | { status: "found"; slug: string; profile: VerdantCultivarProfile | null }
  | { status: "redirect"; slug: string }
  | { status: "missing" }
  | { status: "unavailable"; slug: string };

export type CultivarKnownSlug = { slug: string; profile: VerdantCultivarProfile | null };

/** `ok: false` means the database read failed and `known` holds only the static library. */
export type CultivarCatalogRead = { ok: boolean; known: readonly CultivarKnownSlug[] };

export class CultivarSlugRouteRules {
  /** Exact slug, else a case-insensitive redirect to the stored lowercase slug. */
  static fromKnown(
    slug: string | undefined,
    known: readonly { slug: string; profile: VerdantCultivarProfile | null }[],
  ): CultivarSlugDecision {
    if (!slug) return { status: "missing" };
    const exact = known.find((entry) => entry.slug === slug);
    if (exact) return { status: "found", slug: exact.slug, profile: exact.profile };
    const folded = known.find((entry) => entry.slug.toLowerCase() === slug.toLowerCase());
    if (folded) return { status: "redirect", slug: folded.slug };
    return { status: "missing" };
  }

  /** A slug missing only because the catalog read failed is unavailable (503), never a cacheable 404. */
  static decideFromCatalog(
    slug: string | undefined,
    read: CultivarCatalogRead,
  ): CultivarSlugDecision {
    const decision = CultivarSlugRouteRules.fromKnown(slug, read.known);
    if (!read.ok && decision.status === "missing") {
      return { status: "unavailable", slug: slug ?? "" };
    }
    return decision;
  }

  /** The static library slugs, with no database profiles attached. */
  static staticKnownSlugs(): CultivarKnownSlug[] {
    return VERDANT_CULTIVARS.map((profile) => ({ slug: profile.slug, profile: null }));
  }

  /** Static slugs plus every published database profile; a database profile replaces its static slug's null. */
  static knownFromSnapshot(snapshot: CultivarDatabaseSnapshot): CultivarKnownSlug[] {
    const known = CultivarSlugRouteRules.staticKnownSlugs();
    const mapped = mapCultivarDatabaseSnapshot(snapshot);
    for (const profile of mapped.catalog.profiles) {
      if (profile.publicationStatus !== "published") continue;
      const index = known.findIndex((entry) => entry.slug === profile.slug);
      if (index >= 0) known[index] = { slug: profile.slug, profile };
      else known.push({ slug: profile.slug, profile });
    }
    return known;
  }

  static notFoundHead(): StaticRouteHead {
    return {
      meta: [
        { title: "Cultivar not found | Verdant" },
        { name: "robots", content: "noindex, follow" },
      ],
      links: [],
      scripts: [],
    };
  }

  static headFor(decision: CultivarSlugDecision): StaticRouteHead {
    if (decision.status === "redirect") return { meta: [], links: [], scripts: [] };
    if (decision.status === "unavailable") {
      return {
        meta: [
          { title: "Cultivar reference unavailable | Verdant" },
          { name: "robots", content: "noindex, nofollow" },
        ],
        links: [],
        scripts: [],
      };
    }
    if (decision.status === "missing") return CultivarSlugRouteRules.notFoundHead();
    if (VERDANT_CULTIVAR_SLUGS.includes(decision.slug)) {
      return staticRouteHead(`/cultivars/${decision.slug}`);
    }
    const profile = decision.profile;
    const robots = profile ? cultivarDetailRobots(profile.verificationStatus) : "noindex, follow";
    const indexable = robots === "index, follow";
    const url = `${VERDANT_SITE_ORIGIN}/cultivars/${decision.slug}`;
    return {
      meta: [
        { title: `${profile?.name ?? decision.slug} Cultivar Grow Guide | Verdant` },
        { name: "robots", content: robots },
        ...(indexable ? [{ property: "og:url", content: url }] : []),
      ],
      links: indexable ? [{ rel: "canonical", href: url }] : [],
      scripts: [],
    };
  }
}
