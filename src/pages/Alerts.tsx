import { Bell } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import SeverityBadge from "@/components/SeverityBadge";
import EmptyState from "@/components/EmptyState";
import { useAlerts, useTents } from "@/hooks/useMockData";
import { formatDistanceToNow } from "date-fns";

export default function Alerts() {
  const { data: alerts = [] } = useAlerts();
  const { data: tents = [] } = useTents();
  const groups = ["critical", "warning", "info"] as const;
  return (
    <div>
      <PageHeader title="Alerts" description="Threshold breaches, overdue tasks, and AI signals." icon={<Bell className="h-5 w-5" />} />
      {alerts.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="All clear" /> : (
        <div className="space-y-5">
          {groups.map((sev) => {
            const items = alerts.filter((a) => a.severity === sev);
            if (!items.length) return null;
            return (
              <section key={sev}>
                <div className="flex items-center gap-2 mb-2"><SeverityBadge severity={sev} /><span className="text-xs text-muted-foreground">{items.length}</span></div>
                <ul className="space-y-2">
                  {items.map((a) => {
                    const tent = tents.find((t) => t.id === a.tentId);
                    return (
                      <li key={a.id} className="glass rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.detail}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{tent?.name ?? "—"} · {a.source} · {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}</p>
                          </div>
                          {a.acknowledged && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ack</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
