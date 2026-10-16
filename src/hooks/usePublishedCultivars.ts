/**
 * Strain Reference Library V1.1 — published cultivar catalog for public pages.
 *
 * While `cultivarDatabaseReadsEnabled` is false (the default) this returns the
 * bundled library synchronously and issues NO database request. When enabled
 * it performs one read-only, RLS-filtered snapshot read per page load (shared
 * between the index and detail pages) and resolves an explicit source state;
 * any failure falls back, visibly, to the bundled library.
 *
 * SSR and the first client render always use the bundled catalog, so the
 * prerendered HTML and hydration stay byte-identical to the bundled pages.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { featureFlags } from "@/lib/featureFlags";
import {
  fetchPublishedCultivarSnapshot,
  type CultivarReferenceReadClient,
  type CultivarSnapshotResult,
} from "@/lib/cultivarReferenceService";
import {
  resolveCultivarReferenceSource,
  type CultivarReferenceQueryState,
  type CultivarReferenceSourceResolution,
} from "@/lib/cultivarReferenceSourceRules";

let inflight: Promise<CultivarSnapshotResult> | null = null;

function loadSnapshot(): Promise<CultivarSnapshotResult> {
  if (!inflight) {
    inflight = fetchPublishedCultivarSnapshot(
      supabase as unknown as CultivarReferenceReadClient,
    ).then((result) => {
      // Keep a success for the page session; let a failure retry on next mount.
      if (!result.ok) inflight = null;
      return result;
    });
  }
  return inflight;
}

/** Test seam: forget the shared in-flight snapshot. */
export function resetPublishedCultivarSnapshotCache(): void {
  inflight = null;
}

export function usePublishedCultivars(options?: {
  databaseReadsEnabled?: boolean;
}): CultivarReferenceSourceResolution {
  const databaseReadsEnabled =
    options?.databaseReadsEnabled ?? featureFlags.cultivarDatabaseReadsEnabled;
  const [query, setQuery] = useState<CultivarReferenceQueryState>({ status: "pending" });

  useEffect(() => {
    if (!databaseReadsEnabled) return;
    let cancelled = false;
    loadSnapshot().then(
      (result) => {
        if (!cancelled) setQuery({ status: "success", result });
      },
      (error: unknown) => {
        if (!cancelled) {
          setQuery({ status: "error", error: error instanceof Error ? error.message : "unknown" });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [databaseReadsEnabled]);

  return useMemo(
    () => resolveCultivarReferenceSource({ databaseReadsEnabled, query }),
    [databaseReadsEnabled, query],
  );
}
