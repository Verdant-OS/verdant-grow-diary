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


export default function GrowDetail() {
  const { growId } = useParams<{ growId: string }>();
  const { user } = useAuth();
  const [grow, setGrow] = useState<GrowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [counts, setCounts] = useState<GrowCounts>(EMPTY_COUNTS);

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

