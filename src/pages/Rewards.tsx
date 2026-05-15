import { useEffect, useState } from "react";
import { Sparkles, Lock, Trophy, Check, Scissors } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { useNugs } from "@/store/nugs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LEVEL_THRESHOLDS, TIER_LABEL, UNLOCK_LABELS, progressToNext, tierForLevel, ONBOARDING_QUESTS, nextHarvestGate } from "@/lib/leveling";
import QuestChecklist from "@/components/QuestChecklist";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface NugEvent { id: string; kind: string; amount: number; created_at: string; meta: any; }

export default function Rewards() {
  const { user } = useAuth();
  const { profile, unlocks, completedQuests, harvestCount, levelCap, award, refresh } = useNugs();
  const [events, setEvents] = useState<NugEvent[]>([]);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => { setName(profile?.display_name ?? ""); }, [profile?.display_name]);

  useEffect(() => {
    if (!user) return;
    (supabase as any).from("nug_events").select("id,kind,amount,created_at,meta")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }: any) => setEvents(data || []));
  }, [user, profile?.nugs_total]);

  const total = profile?.nugs_total ?? 0;
  const level = profile?.level ?? 0;
  const tier = profile?.tier ?? tierForLevel(level);
  const { current, next, pct } = progressToNext(total, level);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setSavingName(true);
    const { error } = await (supabase as any).from("profiles").update({ display_name: name.trim() }).eq("user_id", user.id);
    if (error) { toast.error(error.message); setSavingName(false); return; }
    if (!completedQuests.has("onboarding_profile")) {
      await award("onboarding_profile", 100, { questKey: "onboarding_profile" });
    } else {
      await refresh();
      toast.success("Profile updated");
    }
    setSavingName(false);
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Rewards</h1>
        <p className="text-sm text-muted-foreground">Stack NUGs, level up, unlock perks.</p>
      </div>

      {/* Hero card */}
      <section className="glass rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{TIER_LABEL[tier]}</div>
            <div className="text-3xl font-display font-bold">Level {level}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Total NUGs</div>
            <div className="text-2xl font-bold tabular-nums flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" />{total.toLocaleString()}</div>
          </div>
        </div>
        <Progress value={pct} className="h-2 mt-3" />
        <div className="flex justify-between text-xs text-muted-foreground mt-1.5 tabular-nums">
          <span>{current.toLocaleString()}</span>
          <span>{level >= 50 ? "Maxed" : `${(next - total).toLocaleString()} to Lv ${level + 1}`}</span>
          <span>{next.toLocaleString()}</span>
        </div>
      </section>

      {/* Tier 2 harvest gate */}
      {level >= 8 && level < 21 && (
        <section className="glass rounded-2xl p-4 mb-5 border border-primary/30">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Scissors className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tier 2 · Vegetative gate</div>
              <h2 className="font-display font-semibold leading-tight">Currently capped at Lv {levelCap}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Levels 11–20 unlock as you document harvests.
              </p>
            </div>
          </div>

          {/* Big "next gate" callout */}
          {(() => {
            const g = nextHarvestGate(harvestCount);
            if (!g) {
              return (
                <div className="rounded-xl border border-primary/50 bg-primary/10 p-3 text-center">
                  <div className="text-sm font-display font-semibold text-primary">All Tier 2 gates cleared 🎉</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Keep stacking NUGs toward Lv 20.</div>
                </div>
              );
            }
            return (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-center gap-3">
                <div className="text-3xl font-display font-bold text-primary tabular-nums leading-none">{g.needed}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold leading-tight">
                    more harvest{g.needed > 1 ? "s" : ""} to reach <span className="tabular-nums">Lv {g.cap}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    {harvestCount} of {g.needed + harvestCount} harvest{g.needed + harvestCount > 1 ? "s" : ""} logged · log one from the Grows tab
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Gate ladder */}
          <ol className="grid grid-cols-3 gap-2 mt-3" aria-label="Tier 2 harvest gates">
            {[
              { req: 1, max: 14 },
              { req: 2, max: 17 },
              { req: 3, max: 20 },
            ].map((gate) => {
              const met = harvestCount >= gate.req;
              const isCurrent = !met && nextHarvestGate(harvestCount)?.cap === gate.max;
              return (
                <li
                  key={gate.req}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`rounded-xl border p-2 text-center transition ${
                    met
                      ? "border-primary/60 bg-primary/10"
                      : isCurrent
                      ? "border-primary bg-primary/5 ring-2 ring-primary/40"
                      : "border-border/40 opacity-60"
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-center gap-1">
                    {met && <Check className="h-3 w-3 text-primary" />}
                    {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
                    {gate.req} harvest{gate.req > 1 ? "s" : ""}
                  </div>
                  <div className="text-sm font-semibold tabular-nums">Lv {gate.max}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {met ? "unlocked" : isCurrent ? "next" : "locked"}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <QuestChecklist />

      {/* Profile setup */}
      <section className="glass rounded-2xl p-4 mb-5">
        <h2 className="font-display font-semibold mb-3">Profile</h2>
        <form onSubmit={saveProfile} className="grid gap-3">
          <div>
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="GreenThumb420" required />
          </div>
          <Button disabled={savingName || !name.trim()} className="gradient-leaf text-primary-foreground">
            {completedQuests.has("onboarding_profile") ? "Save" : "Save & claim 100 NUGs"}
          </Button>
        </form>
      </section>

      {/* Tier roadmap */}
      <section className="glass rounded-2xl p-4 mb-5">
        <h2 className="font-display font-semibold mb-3">Unlocks</h2>
        <ul className="grid gap-2">
          {Object.entries(UNLOCK_LABELS).sort((a, b) => a[1].level - b[1].level).map(([key, u]) => {
            const has = unlocks.has(key);
            return (
              <li key={key} className={`flex items-center gap-3 rounded-xl border border-border/40 p-3 ${has ? "" : "opacity-70"}`}>
                {has ? <Check className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 text-sm">{u.label}</div>
                <div className="text-xs text-muted-foreground tabular-nums">Lv {u.level}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Activity */}
      <section className="glass rounded-2xl p-4">
        <h2 className="font-display font-semibold mb-3">Recent NUGs</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet — start with a quest above.</p>
        ) : (
          <ul className="grid gap-1.5">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm py-1">
                <span className="truncate capitalize">{e.kind.replace(/_/g, " ")}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                  <span className="text-primary font-semibold tabular-nums">+{e.amount}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-muted-foreground text-center mt-4">
        L1 starts at {LEVEL_THRESHOLDS[1]} NUGs · Tier 5 caps at {LEVEL_THRESHOLDS[50].toLocaleString()}
      </p>
    </div>
  );
}
