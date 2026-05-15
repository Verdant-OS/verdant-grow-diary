import { ListChecks, Droplet, FlaskConical, Scissors, Sparkles, Eye, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useTasks, useTents } from "@/hooks/useMockData";
import { format } from "date-fns";

const ICONS: Record<string, any> = { water: Droplet, feed: FlaskConical, training: Sparkles, defoliation: Scissors, flush: Droplet, inspect: Eye };

function Column({ title, items, tents }: any) {
  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="font-display font-semibold mb-3 flex items-center gap-2">{title} <span className="text-xs text-muted-foreground">({items.length})</span></h3>
      <ul className="space-y-2">
        {items.map((t: any) => {
          const Icon = ICONS[t.type] || ListChecks;
          const tent = tents.find((x: any) => x.id === t.tentId);
          return (
            <li key={t.id} className="rounded-xl border border-border/40 p-3">
              <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-[11px] text-muted-foreground">{tent?.name ?? "—"} · {format(new Date(t.dueAt), "MMM d")}{t.recurring ? ` · ${t.recurring}` : ""}</p>
                </div>
                {t.status === "done" && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Tasks() {
  const { data: tasks = [] } = useTasks();
  const { data: tents = [] } = useTents();
  return (
    <div>
      <PageHeader title="Tasks" description="Watering, feeding, training, and inspection schedule." icon={<ListChecks className="h-5 w-5" />} />
      <div className="grid md:grid-cols-3 gap-4">
        <Column title="Today" items={tasks.filter((t) => t.status === "today")} tents={tents} />
        <Column title="Upcoming" items={tasks.filter((t) => t.status === "upcoming")} tents={tents} />
        <Column title="Done" items={tasks.filter((t) => t.status === "done")} tents={tents} />
      </div>
    </div>
  );
}
