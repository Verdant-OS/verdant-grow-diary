/**
 * How `/cultivars/$slug` decides found, redirect, or not-found.
 * The route loader and the SSR head both call `decide` so they cannot disagree.
 */
import { VERDANT_CULTIVAR_SLUGS, VERDANT_CULTIVARS } from "@/constants/strainReferenceLibrary";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { VERDANT_SITE_ORIGIN } from "@/constants/verdantSeoContent";
import { supabase } from "@/integrations/supabase/client";
import { cultivarDetailRobots } from "@/lib/cultivarDetailSeo";
import { mapCultivarDatabaseSnapshot } from "@/lib/cultivarDatabaseReadModel";
import {
  fetchPublishedCultivarSnapshot,
  type CultivarReferenceReadClient,
} from "@/lib/cultivarReferenceService";
import { featureFlags } from "@/lib/featureFlags";
import { staticRouteHead, type StaticRouteHead } from "@/lib/build/staticRouteHead";

export type CultivarSlugDecision =
  | { status: "found"; slug: string; profile: VerdantCultivarProfile | null }
  | { status: "redirect"; slug: string }
  | { status: "missing" }
  | { status: "unavailable"; slug: string };

type KnownSlug = { slug: string; profile: VerdantCultivarProfile | null };

type CatalogRead = { ok: boolean; known: readonly KnownSlug[] };

/** One snapshot read shared by the loader and head for this turn. */
let catalogPromise: Promise<CatalogRead> | null = null;

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

  /** Drop the shared snapshot so the next request reads again. */
  static resetRequestCache(): void {
    catalogPromise = null;
  }

  static async decide(slug: string | undefined): Promise<CultivarSlugDecision> {
    const read = await CultivarSlugRouteRules.knownSlugs();
    const decision = CultivarSlugRouteRules.fromKnown(slug, read.known);
    if (!read.ok && decision.status === "missing") {
      return { status: "unavailable", slug: slug ?? "" };
    }
    return decision;
  }

  private static knownSlugs(): Promise<CatalogRead> {
    if (catalogPromise) return catalogPromise;
    let shared: Promise<CatalogRead>;
    shared = CultivarSlugRouteRules.readKnownSlugs().then(
      (read) => {
        if (!read.ok) {
          if (catalogPromise === shared) catalogPromise = null;
          return read;
        }
        setTimeout(() => {
          if (catalogPromise === shared) catalogPromise = null;
        }, 0);
        return read;
      },
      (error: unknown) => {
        if (catalogPromise === shared) catalogPromise = null;
        throw error;
      },
    );
    catalogPromise = shared;
    return shared;
  }

  private static async readKnownSlugs(): Promise<CatalogRead> {
    const known: KnownSlug[] = VERDANT_CULTIVARS.map((profile) => ({
      slug: profile.slug,
      profile: null,
    }));
    if (!featureFlags.cultivarDatabaseReadsEnabled) return { ok: true, known };
    const snapshot = await fetchPublishedCultivarSnapshot(
      supabase as unknown as CultivarReferenceReadClient,
    );
    if (!snapshot.ok) return { ok: false, known };
    const mapped = mapCultivarDatabaseSnapshot(snapshot.snapshot);
    for (const profile of mapped.catalog.profiles) {
      if (profile.publicationStatus !== "published") continue;
      const index = known.findIndex((entry) => entry.slug === profile.slug);
      if (index >= 0) known[index] = { slug: profile.slug, profile };
      else known.push({ slug: profile.slug, profile });
    }
    return { ok: true, known };
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
