import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { tierForLevel, type Tier, UNLOCK_LABELS } from "@/lib/leveling";
import { toast } from "sonner";

interface Profile {
  user_id: string;
  display_name: string | null;
  nugs_total: number;
  level: number;
  tier: Tier;
}

interface AwardResult {
  awarded: number;
  new_total: number;
  prev_level?: number;
  new_level: number;
  tier: Tier;
  unlocked: string[];
  duplicate?: boolean;
}

interface Ctx {
  profile: Profile | null;
  unlocks: Set<string>;
  completedQuests: Set<string>;
  harvestCount: number;
  levelCap: number;
  loading: boolean;
  award: (kind: string, amount: number, opts?: { questKey?: string; meta?: Record<string, unknown>; silent?: boolean }) => Promise<AwardResult | null>;
  refresh: () => Promise<void>;
}

function capForHarvests(h: number): number {
  if (h >= 3) return 20;
  if (h >= 2) return 17;
  if (h >= 1) return 14;
  return 10;
}

const NugsCtx = createContext<Ctx>({} as Ctx);

export function NugsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [unlocks, setUnlocks] = useState<Set<string>>(new Set());
  const [completedQuests, setCompletedQuests] = useState<Set<string>>(new Set());
  const [harvestCount, setHarvestCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setProfile(null); setUnlocks(new Set()); setCompletedQuests(new Set()); setHarvestCount(0); setLoading(false); return; }
    setLoading(true);
    const [p, u, q, h] = await Promise.all([
      (supabase as any).from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("unlocks").select("key").eq("user_id", user.id),
      (supabase as any).from("user_quests").select("quest_key").eq("user_id", user.id),
      (supabase as any).from("harvests").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    if (p.data) {
      setProfile({ ...p.data, tier: tierForLevel(p.data.level ?? 0) });
    }
    setUnlocks(new Set((u.data || []).map((r: any) => r.key)));
    setCompletedQuests(new Set((q.data || []).map((r: any) => r.quest_key)));
    setHarvestCount(h.count ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const award = useCallback<Ctx["award"]>(async (kind, amount, opts = {}) => {
    if (!user) return null;
    const { data, error } = await (supabase as any).rpc("award_nugs", {
      _kind: kind,
      _amount: amount,
      _meta: opts.meta ?? {},
      _quest_key: opts.questKey ?? null,
    });
    if (error) { console.error("[award_nugs]", error); return null; }
    const res = data as AwardResult;

    if (!res?.duplicate && (res?.awarded ?? 0) > 0 && !opts.silent) {
      toast.success(`+${res.awarded} NUGs 🌱`);
    }
    if (res && (res.new_level ?? 0) > (res.prev_level ?? 0) && !opts.silent) {
      toast.success(`Level ${res.new_level} reached!`, { duration: 5000 });
    }
    if (res?.unlocked?.length && !opts.silent) {
      res.unlocked.forEach((k) => toast.success(`Unlocked: ${UNLOCK_LABELS[k]?.label ?? k}`, { duration: 5000 }));
    }
    await refresh();
    return res;
  }, [user, refresh]);

  const levelCap = capForHarvests(harvestCount);
  return (
    <NugsCtx.Provider value={{ profile, unlocks, completedQuests, harvestCount, levelCap, loading, award, refresh }}>
      {children}
    </NugsCtx.Provider>
  );
}

export const useNugs = () => useContext(NugsCtx);
