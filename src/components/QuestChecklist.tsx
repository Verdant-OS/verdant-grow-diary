import { Link } from "react-router-dom";
import { Check, Circle, Sparkles } from "lucide-react";
import { ONBOARDING_QUESTS } from "@/lib/leveling";
import { useNugs } from "@/store/nugs";

export default function QuestChecklist() {
  const { completedQuests, profile } = useNugs();
  const done = ONBOARDING_QUESTS.filter((q) => completedQuests.has(q.key)).length;
  if (done === ONBOARDING_QUESTS.length) return null;

  return (
    <section className="glass rounded-2xl p-4 mb-5 animate-fade-in">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-display font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />Earn your first 500 NUGs
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {done}/{ONBOARDING_QUESTS.length} complete · {profile?.nugs_total ?? 0} NUGs so far
          </p>
        </div>
      </header>
      <ul className="grid gap-2">
        {ONBOARDING_QUESTS.map((q) => {
          const isDone = completedQuests.has(q.key);
          return (
            <li key={q.key}>
              <Link
                to={q.href}
                className={`flex items-center gap-3 rounded-xl border border-border/40 p-3 transition ${isDone ? "opacity-60" : "hover:border-primary/60 hover:bg-secondary/40"}`}
              >
                {isDone
                  ? <Check className="h-5 w-5 text-primary shrink-0" />
                  : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isDone ? "line-through" : ""}`}>{q.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{q.description}</div>
                </div>
                <span className="text-xs font-semibold text-primary tabular-nums shrink-0">+{q.amount}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
