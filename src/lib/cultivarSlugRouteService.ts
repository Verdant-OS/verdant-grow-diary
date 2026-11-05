/**
 * I/O for `/cultivars/$slug`: reads the published cultivar catalog and shares
 * one read between the route loader and the SSR head for the same turn.
 * Every decision about the result is pure and lives in `cultivarSlugRouteRules.ts`.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPublishedCultivarSnapshot,
  type CultivarReferenceReadClient,
} from "@/lib/cultivarReferenceService";
import {
  CultivarSlugRouteRules,
  type CultivarCatalogRead,
  type CultivarSlugDecision,
} from "@/lib/cultivarSlugRouteRules";
import { featureFlags } from "@/lib/featureFlags";

/** One snapshot read shared by the loader and head for this turn. */
let catalogPromise: Promise<CultivarCatalogRead> | null = null;

export class CultivarSlugRouteService {
  static async decide(slug: string | undefined): Promise<CultivarSlugDecision> {
    const read = await CultivarSlugRouteService.knownSlugs();
    return CultivarSlugRouteRules.decideFromCatalog(slug, read);
  }

  /** Drop the shared snapshot so the next request reads again. */
  static resetRequestCache(): void {
    catalogPromise = null;
  }

  /** A failed read is dropped at once so the next request retries; a good one after this turn. */
  private static knownSlugs(): Promise<CultivarCatalogRead> {
    if (catalogPromise) return catalogPromise;
    let shared: Promise<CultivarCatalogRead>;
    shared = CultivarSlugRouteService.readKnownSlugs().then(
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

  private static async readKnownSlugs(): Promise<CultivarCatalogRead> {
    if (!featureFlags.cultivarDatabaseReadsEnabled) {
      return { ok: true, known: CultivarSlugRouteRules.staticKnownSlugs() };
    }
    const snapshot = await fetchPublishedCultivarSnapshot(
      supabase as unknown as CultivarReferenceReadClient,
    );
    if (!snapshot.ok) return { ok: false, known: CultivarSlugRouteRules.staticKnownSlugs() };
    return { ok: true, known: CultivarSlugRouteRules.knownFromSnapshot(snapshot.snapshot) };
  }
}
