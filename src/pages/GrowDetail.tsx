import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Loader2,
  ClipboardList,
  Leaf,
  Tent as TentIcon,
  ListChecks,
} from "lucide-react";

interface GrowRow {
  id: string;
  name: string;
  stage: string;
  grow_type: string;
  is_archived: boolean;
  started_at: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

/**
 * Read-only grow detail hub. No writes. Authenticated client only (RLS enforces
 * auth.uid() = user_id). No device-control surface introduced.
 */
type CountValue = number | "unavailable";

interface GrowCounts {
  plants: CountValue;
  tents: CountValue;
  diary: CountValue;
  actionsPending: CountValue;
  actionsTotal: CountValue;
  auditEvents: CountValue;
}

const EMPTY_COUNTS: GrowCounts = {
  plants: 0,
  tents: 0,
  diary: 0,
  actionsPending: 0,
  actionsTotal: 0,
  auditEvents: 0,
};

interface RecentItem {
  id: string;
  kind: "diary" | "action_event";
  ts: string;
  title: string;
  detail?: string | null;
  href?: string;
}

type RecentState =
  | { status: "loading" }
  | { status: "ok"; items: RecentItem[] }
  | { status: "unavailable" };

/**
 * Grow Status summary — derived strictly from existing read-only data
 * (pending action counts, pending risk levels, latest diary timestamp).
 * NOT an AI diagnosis. No ai-coach call. No writes. No device control.
 */
type StatusLevel = "good" | "watch" | "needs_review" | "unavailable";

interface GrowStatus {
  level: StatusLevel;
  reason: string;
  pending: CountValue;
  highestRisk: "low" | "medium" | "high" | "critical" | "none" | "unknown";
  lastDiaryAt: string | null;
}


export default function GrowDetail() {
  const { growId } = useParams<{ growId: string }>();
  const { user } = useAuth();
  const [grow, setGrow] = useState<GrowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [counts, setCounts] = useState<GrowCounts>(EMPTY_COUNTS);
  const [recent, setRecent] = useState<RecentState>({ status: "loading" });
  const [status, setStatus] = useState<GrowStatus>({
    level: "good",
    reason: "Loading…",
    pending: 0,
    highestRisk: "none",
    lastDiaryAt: null,
  });



  const load = useCallback(async () => {
    if (!user || !growId) return;
    setLoading(true);
    setNotFound(false);
    const { data, error } = await supabase
      .from("grows")
      .select("id,name,stage,grow_type,is_archived,started_at,created_at,updated_at,notes")
      .eq("id", growId)
      .maybeSingle();
    if (error || !data) {
      setGrow(null);
      setNotFound(true);
      setLoading(false);
      return;
    }
    setGrow(data as GrowRow);

    // Read-only count queries. Any failure degrades to "unavailable" — never crashes.
    async function countFrom(
      table: "plants" | "tents" | "diary_entries" | "action_queue" | "action_queue_events",
      extra?: (q: ReturnType<typeof supabase.from> extends infer _T ? ReturnType<typeof supabase.from> : never) => unknown,
    ): Promise<CountValue> {
      try {
        let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("grow_id", growId!);
        if (extra) q = extra(q) as typeof q;
        const { count, error: cErr } = await q;
        if (cErr) return "unavailable";
        return count ?? 0;
      } catch {
        return "unavailable";
      }
    }

    const [plants, tents, diary, actionsPending, actionsTotal, auditEvents] = await Promise.all([
      countFrom("plants"),
      countFrom("tents"),
      countFrom("diary_entries"),
      countFrom("action_queue", (q) => (q as ReturnType<typeof supabase.from>).eq("status", "pending_approval")),
      countFrom("action_queue"),
      countFrom("action_queue_events"),
    ]);
    setCounts({ plants, tents, diary, actionsPending, actionsTotal, auditEvents });

    // Recent activity: latest 5 diary entries + latest 5 action_queue_events,
    // merged newest-first. Read-only; failure degrades to "unavailable".
    try {
      const [diaryRes, eventsRes] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,entry_at,stage,note")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(5),
        supabase
          .from("action_queue_events")
          .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at")
          .eq("grow_id", growId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (diaryRes.error || eventsRes.error) {
        setRecent({ status: "unavailable" });
      } else {
        const diaryItems: RecentItem[] = (diaryRes.data ?? []).map((d) => ({
          id: `diary-${d.id}`,
          kind: "diary",
          ts: d.entry_at,
          title: d.stage ? `Diary entry (${d.stage})` : "Diary entry",
          detail: d.note,
        }));

        // Resolve parent action_queue rows for suggested_change/reason context.
        const actionIds = Array.from(
          new Set((eventsRes.data ?? []).map((e) => e.action_queue_id).filter(Boolean)),
        );
        let parents: Record<string, { suggested_change: string; reason: string }> = {};
        if (actionIds.length > 0) {
          const { data: pRows } = await supabase
            .from("action_queue")
            .select("id,suggested_change,reason")
            .in("id", actionIds);
          parents = Object.fromEntries(
            (pRows ?? []).map((p) => [p.id, { suggested_change: p.suggested_change, reason: p.reason }]),
          );
        }

        const eventItems: RecentItem[] = (eventsRes.data ?? []).map((e) => {
          const parent = parents[e.action_queue_id];
          return {
            id: `event-${e.id}`,
            kind: "action_event",
            ts: e.created_at,
            title: `${e.event_type}${parent ? `: ${parent.suggested_change}` : ""}`,
            detail: e.note ?? parent?.reason ?? null,
            href: `/actions/${e.action_queue_id}`,
          };
        });

        const merged = [...diaryItems, ...eventItems].sort(
          (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
        );
        setRecent({ status: "ok", items: merged });
      }
    } catch {
      setRecent({ status: "unavailable" });
    }

    // Grow Status — derived from existing read-only data only.
    // NOT AI diagnosis. No ai-coach call. No device control.
    try {
      let highestRisk: GrowStatus["highestRisk"] = "none";
      const { data: riskRows, error: riskErr } = await supabase
        .from("action_queue")
        .select("risk_level")
        .eq("grow_id", growId)
        .eq("status", "pending_approval")
        .limit(50);
      if (riskErr) {
        highestRisk = "unknown";
      } else {
        const order = { critical: 4, high: 3, medium: 2, low: 1 } as const;
        let top = 0;
        for (const r of riskRows ?? []) {
          const v = order[(r.risk_level ?? "low") as keyof typeof order] ?? 0;
          if (v > top) top = v;
        }
        highestRisk = top === 4 ? "critical" : top === 3 ? "high" : top === 2 ? "medium" : top === 1 ? "low" : "none";
      }

      const { data: lastDiaryRows, error: lastDiaryErr } = await supabase
        .from("diary_entries")
        .select("entry_at")
        .eq("grow_id", growId)
        .order("entry_at", { ascending: false })
        .limit(1);
      const lastDiaryAt = lastDiaryErr ? null : (lastDiaryRows?.[0]?.entry_at ?? null);

      const pending = actionsPending;
      const countsUnavailable = pending === "unavailable";
      const ageDays = lastDiaryAt ? (Date.now() - new Date(lastDiaryAt).getTime()) / 86400000 : null;

      let level: StatusLevel;
      let reason: string;
      if (countsUnavailable && highestRisk === "unknown") {
        level = "unavailable";
        reason = "Status unavailable";
      } else if (highestRisk === "critical" || highestRisk === "high") {
        level = "needs_review";
        reason = `Pending action at ${highestRisk} risk needs review`;
      } else if (typeof pending === "number" && pending > 0) {
        level = "watch";
        reason = `${pending} pending action${pending === 1 ? "" : "s"} awaiting approval`;
      } else if (ageDays === null) {
        level = "watch";
        reason = "No diary entries yet";
      } else if (ageDays > 7) {
        level = "watch";
        reason = `Last diary entry ${Math.floor(ageDays)} days ago`;
      } else {
        level = "good";
        reason = "No pending actions, recent diary activity";
      }

      setStatus({ level, reason, pending, highestRisk, lastDiaryAt });
    } catch {
      setStatus({
        level: "unavailable",
        reason: "Status unavailable",
        pending: "unavailable",
        highestRisk: "unknown",
        lastDiaryAt: null,
      });
    }

    setLoading(false);
  }, [user, growId]);



  useEffect(() => {
    load();
  }, [load]);



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

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Grow hub links">
        <HubLink
          to="/logs"
          icon={<ClipboardList className="h-4 w-4" />}
          title="Timeline"
          description="All events for your grows."
          count={counts.diary}
          countLabel="diary entries"
        />
        <HubLink
          to="/plants"
          icon={<Leaf className="h-4 w-4" />}
          title="Plants"
          description="Manage plants in this grow."
          count={counts.plants}
          countLabel="plants"
        />
        <HubLink
          to="/tents"
          icon={<TentIcon className="h-4 w-4" />}
          title="Tents"
          description="Tents linked to this grow."
          count={counts.tents}
          countLabel="tents"
        />
        <HubLink
          to="/actions"
          icon={<ListChecks className="h-4 w-4" />}
          title="Action Queue"
          description={`${formatCount(counts.actionsPending)} pending · ${formatCount(counts.auditEvents)} audit events`}
          count={counts.actionsTotal}
          countLabel="actions"
        />
      </section>

      <section className="glass rounded-2xl p-4 mt-4" aria-label="Recent activity">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Activity
          </h2>
          <Link to="/logs" className="text-xs text-primary hover:underline">
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
                    {item.kind === "diary" ? "Diary Entry" : "Action Queue Event"}
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

    </div>

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

function formatCount(c: CountValue): string {
  return c === "unavailable" ? "Unavailable" : String(c);
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

