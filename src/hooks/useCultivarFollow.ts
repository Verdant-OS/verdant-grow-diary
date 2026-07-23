/**
 * useCultivarFollow — follow/unfollow a public cultivar reference and detect the
 * "updated since you followed" nudge (guide version advanced past what was seen).
 *
 * Own-scoped via RLS. No plant linkage. The `cultivar_follows` table is added by
 * migration 20260723120000; until the founder deploys it and regenerates the
 * Supabase types, we access it through a narrow cast at the `.from()` seam.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import type { VerdantCultivarProfile } from "@/constants/verdantCultivars";
import { hasCultivarGuideUpdate } from "@/lib/cultivarFollowRules";

// Narrow cast: the generated types won't include cultivar_follows until the
// migration is deployed and types are regenerated. Replace with the typed table
// then. Keeps client compilation green in the meantime.
function followsTable() {
  return (supabase as unknown as { from: (t: string) => any }).from("cultivar_follows");
}

export interface UseCultivarFollowReturn {
  loading: boolean;
  isFollowing: boolean;
  hasUpdate: boolean;
  follow: () => Promise<void>;
  unfollow: () => Promise<void>;
  markSeen: () => Promise<void>;
}

export function useCultivarFollow(
  cultivar: VerdantCultivarProfile,
): UseCultivarFollowReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [seenVersion, setSeenVersion] = useState<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      if (mounted.current) {
        setIsFollowing(false);
        setSeenVersion(null);
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    const { data } = await followsTable()
      .select("seen_guide_version")
      .eq("user_id", user.id)
      .eq("cultivar_slug", cultivar.slug)
      .maybeSingle();
    if (!mounted.current) return;
    if (data && typeof data.seen_guide_version === "number") {
      setIsFollowing(true);
      setSeenVersion(data.seen_guide_version);
    } else {
      setIsFollowing(false);
      setSeenVersion(null);
    }
    setLoading(false);
  }, [user, cultivar.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const follow = useCallback(async () => {
    if (!user) return;
    await followsTable().upsert(
      {
        user_id: user.id,
        cultivar_slug: cultivar.slug,
        seen_guide_version: cultivar.guideVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,cultivar_slug" },
    );
    if (!mounted.current) return;
    setIsFollowing(true);
    setSeenVersion(cultivar.guideVersion);
  }, [user, cultivar.slug, cultivar.guideVersion]);

  const unfollow = useCallback(async () => {
    if (!user) return;
    await followsTable().delete().eq("user_id", user.id).eq("cultivar_slug", cultivar.slug);
    if (!mounted.current) return;
    setIsFollowing(false);
    setSeenVersion(null);
  }, [user, cultivar.slug]);

  const markSeen = useCallback(async () => {
    if (!user || !isFollowing) return;
    await followsTable()
      .update({ seen_guide_version: cultivar.guideVersion, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("cultivar_slug", cultivar.slug);
    if (!mounted.current) return;
    setSeenVersion(cultivar.guideVersion);
  }, [user, isFollowing, cultivar.slug, cultivar.guideVersion]);

  const hasUpdate =
    isFollowing && seenVersion != null && hasCultivarGuideUpdate(seenVersion, cultivar.guideVersion);

  return { loading, isFollowing, hasUpdate, follow, unfollow, markSeen };
}
