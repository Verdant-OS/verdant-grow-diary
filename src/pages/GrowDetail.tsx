import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  ClipboardList,
  Leaf,
  Tent as TentIcon,
  ListChecks,
  Sparkles,
  Bell,
} from "lucide-react";
import { useGrowDetailData, type GrowOutcomesState } from "@/hooks/useGrowDetailData";
import {
  type CountValue,
  type GrowStatus,
  type StatusLevel,
  formatCount,
} from "@/lib/growStatus";
import {
  actionDetailPath,
  actionsPath,
  alertDetailPath,
  alertsPath,
  dashboardPath,
  logsPath,
  plantsPath,
  tentsPath,
} from "@/lib/routes";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import ActionOutcomeLearningReport from "@/components/ActionOutcomeLearningReport";

/**
 * Read-only grow detail hub. Presentational only — all data loading +
 * derivation live in @/hooks/useGrowDetailData and @/lib/growStatus.
 * No writes. No ai-coach call. No device-control surface.
 */
export default function GrowDetail() {
  const { grow, growId, loading, notFound, counts, recent, status, outcomes } = useGrowDetailData();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (notFound || !grow) {
    return (
      <div className="max-w-xl mx-auto">
        <BackLink />
        <div className="glass rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold mb-2">Grow not found</h1>
          <p className="text-sm text-muted-foreground">
            This grow may have been removed, or you do not have access to it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <GrowBreadcrumbs growId={grow.id} growName={grow.name} current={grow.name} section="grow-detail" />
      <BackLink />


      <header className="glass rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge variant="outline" className="uppercase text-[10px]">{grow.stage}</Badge>
          <Badge variant="outline" className="text-[10px]">{grow.grow_type}</Badge>
          {grow.is_archived && (
            <Badge variant="outline" className="text-[10px]">archived</Badge>
          )}
        </div>
        <h1 className="text-xl font-display font-bold">{grow.name}</h1>
        {grow.notes && (
          <p className="text-sm text-muted-foreground mt-1">{grow.notes}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Field label="Started" value={new Date(grow.started_at).toLocaleString()} />
          <Field label="Created" value={new Date(grow.created_at).toLocaleString()} />
          <Field label="Updated" value={new Date(grow.updated_at).toLocaleString()} />
          <Field label="Grow ID" value={grow.id} mono />
        </dl>
      </header>

      <GrowStatusCard status={status} growId={growId} />

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Grow hub links">
        <HubLink
          to={logsPath(growId)}
          icon={<ClipboardList className="h-4 w-4" />}
          title="Timeline"
          description="All events for your grows."
          count={counts.diary}
          countLabel="diary entries"
        />
        <HubLink
          to={plantsPath(growId)}
          icon={<Leaf className="h-4 w-4" />}
          title="Plants"
          description="Manage plants in this grow."
          count={counts.plants}
          countLabel="plants"
        />
        <HubLink
          to={tentsPath(growId)}
          icon={<TentIcon className="h-4 w-4" />}
          title="Tents"
          description="Tents linked to this grow."
          count={counts.tents}
          countLabel="tents"
        />
        <HubLink
          to={actionsPath(growId)}
          icon={<ListChecks className="h-4 w-4" />}
          title="Action Queue"
          description={`${formatCount(counts.actionsPending)} pending · ${formatCount(counts.auditEvents)} audit events`}
          count={counts.actionsTotal}
          countLabel="actions"
        />
        <HubLink
          to={alertsPath(growId)}
          icon={<Bell className="h-4 w-4" />}
          title="Alerts"
          description={`${formatCount(counts.alertsCritical)} critical · ${formatCount(counts.alertsWarning)} warning`}
          count={counts.alertsOpen}
          countLabel="open alerts"
        />
        <HubLink
          to={dashboardPath(growId)}
          icon={<Sparkles className="h-4 w-4" />}
          title="Dashboard"
          description="Open the live dashboard scoped to this grow."
          count="unavailable"
          countLabel="dashboard"
        />
      </section>

      <section className="glass rounded-2xl p-4 mt-4" aria-label="Recent activity">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </h2>
          <Link to={logsPath(growId)} className="text-xs text-primary hover:underline">
            View full Timeline →
          </Link>
        </div>
        {recent.status === "loading" ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : recent.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">Recent activity unavailable.</p>
        ) : recent.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.items.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {item.kind === "diary"
                      ? "Diary Entry"
                      : item.kind === "alert_event"
                        ? "Alert Event"
                        : "Action Queue Event"}
                  </Badge>
                  <span className="text-xs truncate">{item.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(item.ts).toLocaleString()}
                  </span>
                </div>
                {item.detail && (
                  <p className="text-xs mt-1 italic text-muted-foreground">{item.detail}</p>
                )}
                {item.href && (
                  <Link to={item.href} className="text-xs text-primary hover:underline">
                    View details →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <RecentOutcomesCard outcomes={outcomes} />
    </div>
  );
}

function RecentOutcomesCard({ outcomes }: { outcomes: GrowOutcomesState }) {
  const { status, summary, recent } = outcomes;
  return (
    <section className="glass rounded-2xl p-4 mt-4" aria-label="Recent outcomes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Outcomes
        </h2>
        <span className="text-[11px] text-muted-foreground">Grower-recorded</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3" data-testid="outcome-count-chips">
        <OutcomeChip label="Improved" count={summary.improved} tone="success" />
        <OutcomeChip label="Unchanged" count={summary.unchanged} tone="muted" />
        <OutcomeChip label="Worsened" count={summary.worsened} tone="destructive" />
        <OutcomeChip label="More data needed" count={summary.more_data_needed} tone="warning" />
      </div>

      {status === "loading" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">Recent outcomes unavailable.</p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recorded outcomes yet.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((o) => (
            <li
              key={o.diary_entry_id ?? `${o.action_queue_id}-${o.recorded_at}`}
              className="rounded-lg border border-border/40 bg-secondary/20 p-2 text-sm"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {o.label}
                </Badge>
                {o.metric && (
                  <span className="text-[11px] text-muted-foreground">metric: {o.metric}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {o.recorded_at ? new Date(o.recorded_at).toLocaleString() : "—"}
                </span>
              </div>
              {o.suggested_change && (
                <p className="text-xs mt-1 text-foreground/80">{o.suggested_change}</p>
              )}
              {o.note && (
                <p className="text-xs mt-1 italic text-muted-foreground">{o.note}</p>
              )}
              <p className="text-[10px] mt-1 text-muted-foreground">
                Grower-recorded · Recorded after follow-up
              </p>
              <div className="flex gap-3 mt-1 text-xs">
                {o.action_queue_id && (
                  <Link
                    to={actionDetailPath(o.action_queue_id)}
                    className="text-primary hover:underline"
                  >
                    View action →
                  </Link>
                )}
                {o.source_alert_id && (
                  <Link
                    to={alertDetailPath(o.source_alert_id)}
                    className="text-primary hover:underline"
                  >
                    View alert →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OutcomeChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "success" | "muted" | "destructive" | "warning";
}) {
  const toneMap: Record<typeof tone, string> = {
    success:
      "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
    muted: "bg-muted text-muted-foreground border-border/40",
    destructive: "bg-destructive/15 text-destructive border-destructive/30",
    warning:
      "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  };
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${toneMap[tone]}`}
    >
      {label}: {count}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      to="/grows"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Grows
    </Link>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</dt>
      <dd className={mono ? "font-mono text-[11px] break-all" : ""}>{value}</dd>
    </div>
  );
}

function HubLink({
  to,
  icon,
  title,
  description,
  count,
  countLabel,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  count: CountValue;
  countLabel: string;
}) {
  return (
    <Link
      to={to}
      className="glass rounded-2xl p-4 hover:bg-secondary/20 transition-colors block"
    >
      <div className="flex items-center gap-2 mb-1 text-sm font-semibold">
        {icon}
        {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          <span data-testid={`count-${countLabel.replace(/\s+/g, "-")}`}>{formatCount(count)}</span> {countLabel}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </Link>
  );
}

/**
 * Read-only status card. Status is derived in @/lib/growStatus.deriveStatus;
 * this component only renders. NOT an AI diagnosis.
 */
function GrowStatusCard({ status, growId }: { status: GrowStatus; growId: string }) {
  const labelMap: Record<StatusLevel, string> = {
    good: "Good",
    watch: "Watch",
    needs_review: "Needs Review",
    unavailable: "Status unavailable",
  };
  const toneMap: Record<StatusLevel, string> = {
    good: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
    watch: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
    needs_review: "bg-destructive/15 text-destructive border-destructive/30",
    unavailable: "bg-muted text-muted-foreground border-border/40",
  };
  const pendingNum = typeof status.pending === "number" ? status.pending : 0;
  return (
    <section
      className="glass rounded-2xl p-4 mb-4"
      aria-label="Grow status summary"
      data-testid="grow-status-card"
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Grow Status
        </h2>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${toneMap[status.level]}`}
          data-testid="grow-status-level"
        >
          {labelMap[status.level]}
        </span>
      </div>
      <p className="text-sm">{status.reason}</p>
      <p className="text-[11px] text-muted-foreground mt-1">
        Derived from your data — not an AI diagnosis.
      </p>
      <dl className="grid grid-cols-3 gap-2 mt-3 text-xs">
        <div>
          <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Pending</dt>
          <dd>{formatCount(status.pending)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Top risk</dt>
          <dd className="capitalize">{status.highestRisk}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">Last diary</dt>
          <dd>
            {status.lastDiaryAt ? new Date(status.lastDiaryAt).toLocaleDateString() : "—"}
          </dd>
        </div>
      </dl>
      <div className="flex gap-3 mt-3 text-xs">
        {pendingNum > 0 && (
          <Link to={actionsPath(growId)} className="text-primary hover:underline">
            Review pending actions →
          </Link>
        )}
        <Link to={logsPath(growId)} className="text-primary hover:underline">
          View Timeline →
        </Link>
      </div>
    </section>
  );
}
