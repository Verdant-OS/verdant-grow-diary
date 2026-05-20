import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGrows } from "@/store/grows";
import { useAuth } from "@/store/auth";
import { STAGES, stageLabel } from "@/lib/grow";
import { format, formatDistanceToNow } from "date-fns";
import { Sprout, Image as ImageIcon, Loader2, Camera, FileText, FlaskConical, Check, Pencil, Leaf, Gauge, Bell, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams, useLocation } from "react-router-dom";

import EntryEditDialog from "@/components/EntryEditDialog";
import { cn } from "@/lib/utils";
import { getEventType } from "@/lib/diary";

interface Entry {
  id: string; note: string; photo_url: string | null; stage: string | null;
  details: Record<string, unknown>; entry_at: string;
  plant_id: string | null; tent_id: string | null;
}

type ActionEventType =
  | "created" | "simulated" | "approved" | "rejected" | "completed" | "cancelled" | "note";

interface ActionQueueEvent {
  id: string;
  action_queue_id: string;
  event_type: ActionEventType;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  created_at: string;
  action?: { suggested_change: string | null; reason: string | null } | null;
}

type EventFilter = "all" | "photo" | "note" | "measurement";
const MEASUREMENT_KEYS = new Set(["ph", "ec", "runoff", "watering"]);

function entryKinds(e: Entry): EventFilter[] {
  const kinds: EventFilter[] = ["note"];
  if (e.photo_url) kinds.push("photo");
  if (e.details && Object.keys(e.details).some((k) => MEASUREMENT_KEYS.has(k))) kinds.push("measurement");
  return kinds;
}

export default function Timeline() {
  const { user } = useAuth();
  const { activeGrow, activeGrowId: storeGrowId, grows, loading: growsLoading } = useGrows();
  const [searchParams] = useSearchParams();
  const urlGrowId = searchParams.get("growId");
  const activeGrowId = urlGrowId ?? storeGrowId;
  const [entries, setEntries] = useState<Entry[]>([]);
  const [actionEvents, setActionEvents] = useState<ActionQueueEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<EventFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    if (!user || !activeGrowId) { setEntries([]); setActionEvents([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("diary_entries")
      .select("id,note,photo_url,stage,details,entry_at,plant_id,tent_id")
      .eq("grow_id", activeGrowId).order("entry_at", { ascending: false }).limit(100);
    const rows = (data as Entry[]) || [];
    const paths = rows.map((r) => r.photo_url).filter((p): p is string => !!p && !p.startsWith("http"));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("diary-photos").createSignedUrls(paths, 3600);
      const map = new Map((signed || []).map((s) => [s.path as string, s.signedUrl]));
      rows.forEach((r) => { if (r.photo_url && map.has(r.photo_url)) r.photo_url = map.get(r.photo_url)!; });
    }
    setEntries(rows);

    // Action Queue events for this grow (read-only audit trail).
    // RLS ensures only the owner sees their events.
    const { data: aqe } = await supabase.from("action_queue_events")
      .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at,action:action_queue(suggested_change,reason)")
      .eq("grow_id", activeGrowId)
      .order("created_at", { ascending: false })
      .limit(50);
    setActionEvents((aqe as unknown as ActionQueueEvent[]) || []);

    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [activeGrowId, user]);
  useEffect(() => {
    const h = () => load();
    window.addEventListener("verdant:entry-created", h);
    return () => window.removeEventListener("verdant:entry-created", h);
  });

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach((e) => { if (e.stage) m[e.stage] = (m[e.stage] || 0) + 1; });
    return m;
  }, [entries]);

  const eventCounts = useMemo(() => {
    const m = { all: entries.length, photo: 0, note: 0, measurement: 0 };
    entries.forEach((e) => entryKinds(e).forEach((k) => { m[k] = (m[k] || 0) + 1; }));
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (stageFilter !== "all" && e.stage !== stageFilter) return false;
      if (eventFilter !== "all" && !entryKinds(e).includes(eventFilter)) return false;
      return true;
    });
  }, [entries, stageFilter, eventFilter]);

  const groupedByStage = useMemo(() => {
    const groups: { stage: string; items: Entry[] }[] = [];
    filtered.forEach((e) => {
      const key = e.stage || "unknown";
      const last = groups[groups.length - 1];
      if (last && last.stage === key) last.items.push(e);
      else groups.push({ stage: key, items: [e] });
    });
    return groups;
  }, [filtered]);

  const currentStageIdx = STAGES.findIndex((s) => s.value === activeGrow?.stage);

  if (growsLoading) return <Center><Loader2 className="h-5 w-5 animate-spin" /></Center>;

  if (grows.length === 0) {
    return (
      <Empty title="Start your first grow" desc="Create a grow to begin tracking your plants." cta={<Button asChild className="gradient-leaf text-primary-foreground"><Link to="/grows">Create grow</Link></Button>} />
    );
  }

  return (
    <div>
      
      {activeGrow && (
        <div className="mb-5">
          <h1 className="text-2xl font-display font-bold">{activeGrow.name}</h1>
          <p className="text-sm text-muted-foreground">{stageLabel(activeGrow.stage)} · day {Math.max(1, Math.floor((Date.now() - new Date(activeGrow.started_at).getTime()) / 86400000))}</p>
        </div>
      )}

      {/* Stage progression */}
      {activeGrow && (
        <div className="glass rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage progression</h2>
            <span className="text-[11px] text-muted-foreground">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
          </div>
          <ol className="grid grid-cols-6 gap-1.5">
            {STAGES.map((s, i) => {
              const count = stageCounts[s.value] || 0;
              const isCurrent = i === currentStageIdx;
              const isPast = currentStageIdx >= 0 && i < currentStageIdx;
              return (
                <li key={s.value} className="flex flex-col items-center gap-1.5">
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border transition",
                    isCurrent && "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30",
                    isPast && "bg-primary/20 text-primary border-primary/40",
                    !isCurrent && !isPast && "bg-secondary/50 text-muted-foreground border-border/50",
                  )}>
                    {isPast ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  <span className={cn("text-[10px] leading-tight text-center", isCurrent ? "text-foreground font-medium" : "text-muted-foreground")}>{s.label}</span>
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {urlGrowId && (
        <div className="glass rounded-2xl px-4 py-2 mb-4 flex items-center justify-between text-xs" aria-label="Grow filter banner">
          <span className="text-muted-foreground">Showing timeline for this grow</span>
          <Link to="/timeline" className="text-primary hover:underline">Clear grow filter</Link>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={stageFilter === "all"} onClick={() => setStageFilter("all")} label="All stages" count={entries.length} />
          {STAGES.map((s) => (
            <FilterChip
              key={s.value}
              active={stageFilter === s.value}
              onClick={() => setStageFilter(s.value)}
              label={s.label}
              count={stageCounts[s.value] || 0}
              disabled={!stageCounts[s.value]}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={eventFilter === "all"} onClick={() => setEventFilter("all")} label="All" count={eventCounts.all} />
          <FilterChip active={eventFilter === "photo"} onClick={() => setEventFilter("photo")} label="Photos" icon={<Camera className="h-3 w-3" />} count={eventCounts.photo} />
          <FilterChip active={eventFilter === "note"} onClick={() => setEventFilter("note")} label="Notes" icon={<FileText className="h-3 w-3" />} count={eventCounts.note} />
          <FilterChip active={eventFilter === "measurement"} onClick={() => setEventFilter("measurement")} label="Measurements" icon={<FlaskConical className="h-3 w-3" />} count={eventCounts.measurement} />
        </div>
      </div>

      <ActionQueueEventsSection events={actionEvents} />





      {loading ? <Center><Loader2 className="h-5 w-5 animate-spin" /></Center>
        : entries.length === 0 ? (
          <Empty title="No entries yet" desc="Tap the + button to log your first photo and note." />
        ) : filtered.length === 0 ? (
          <Empty title="No matching entries" desc="Try a different stage or event filter." />
        ) : (
          <div className="space-y-5">
            {groupedByStage.map((group, gi) => (
              <section key={`${group.stage}-${gi}`}>
                <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 py-1 bg-background/80 backdrop-blur-sm">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Sprout className="h-3.5 w-3.5" />{stageLabel(group.stage)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{group.items.length} {group.items.length === 1 ? "entry" : "entries"}</span>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                <ul className="space-y-3">
                  {group.items.map((e) => (
                    <li key={e.id} className="glass rounded-2xl overflow-hidden animate-fade-in">
                      {e.photo_url ? (
                        <img src={e.photo_url} className="w-full aspect-[4/3] object-cover" alt="" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-[4/3] bg-secondary/40 flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="p-4">
                        {(() => {
                          const et = getEventType((e.details?.event_type as string | undefined) ?? null);
                          const Icon = et.icon;
                          const plantName = e.details?.plant_name as string | undefined;
                          const sensor = e.details?.sensor as { temp?: number; rh?: number; vpd?: number; co2?: number; soil?: number } | undefined;
                          const remindAt = e.details?.remind_at as string | undefined;
                          const HIDDEN = ["event_type","plant_id","plant_name","tent_id","sensor","remind_at"];
                          const extra = Object.entries(e.details || {}).filter(([k]) => !HIDDEN.includes(k));
                          return (
                            <>
                              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground flex-wrap">
                                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium", et.tone)}>
                                  <Icon className="h-3 w-3" />{et.label}
                                </span>
                                <span className="inline-flex items-center gap-1 text-primary"><Sprout className="h-3 w-3" />{stageLabel(e.stage)}</span>
                                {plantName && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40 text-[11px]">
                                    <Leaf className="h-3 w-3" />{plantName}
                                  </span>
                                )}
                                <span title={format(new Date(e.entry_at), "PPpp")}>{formatDistanceToNow(new Date(e.entry_at), { addSuffix: true })}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(e.id)}
                                  aria-label="Edit entry"
                                  className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition"
                                >
                                  <Pencil className="h-3 w-3" />Edit
                                </button>
                              </div>
                              <p className="text-sm whitespace-pre-wrap">{e.note}</p>
                              {remindAt && (
                                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                                  <Bell className="h-3 w-3" />Remind {format(new Date(remindAt), "PPp")}
                                </div>
                              )}
                              {sensor && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                                    <Gauge className="h-3 w-3" />Snapshot
                                  </span>
                                  {sensor.temp != null && <SnapChip>{sensor.temp}°C</SnapChip>}
                                  {sensor.rh != null && <SnapChip>{sensor.rh}% RH</SnapChip>}
                                  {sensor.vpd != null && <SnapChip>VPD {sensor.vpd}</SnapChip>}
                                  {sensor.co2 != null && <SnapChip>CO₂ {sensor.co2}</SnapChip>}
                                  {sensor.soil != null && <SnapChip>Soil {sensor.soil}%</SnapChip>}
                                </div>
                              )}
                              {extra.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {extra.map(([k, v]) => (
                                    <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40 capitalize">
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

      <EntryEditDialog
        entry={entries.find((e) => e.id === editingId) || null}
        open={!!editingId}
        onOpenChange={(o) => { if (!o) setEditingId(null); }}
        onSaved={(patch) => setEntries((rows) => rows.map((r) => r.id === patch.id ? { ...r, ...patch } as Entry : r))}
        onDeleted={(id) => setEntries((rows) => rows.filter((r) => r.id !== id))}
      />
    </div>
  );
}

function FilterChip({ active, onClick, label, count, icon, disabled }: { active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/50 text-foreground border-border/50 hover:bg-secondary",
        disabled && "opacity-40 cursor-not-allowed hover:bg-secondary/50",
      )}
    >
      {icon}
      <span>{label}</span>
      {typeof count === "number" && (
        <span className={cn("text-[10px] px-1.5 py-0 rounded-full", active ? "bg-primary-foreground/20" : "bg-background/60")}>{count}</span>
      )}
    </button>
  );
}

function Center({ children }: { children: React.ReactNode }) { return <div className="py-20 flex justify-center text-muted-foreground">{children}</div>; }
function Empty({ title, desc, cta }: { title: string; desc: string; cta?: React.ReactNode }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto h-16 w-16 rounded-2xl glass flex items-center justify-center mb-4"><Sprout className="h-7 w-7 text-primary" /></div>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-xs mx-auto">{desc}</p>
      {cta}
    </div>
  );
}

function SnapChip({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40">{children}</span>;
}

const ACTION_EVENT_TONE: Record<ActionEventType, string> = {
  created:   "bg-secondary/60 border-border/50 text-foreground",
  simulated: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  approved:  "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  rejected:  "bg-red-500/10 border-red-500/30 text-red-300",
  completed: "bg-primary/10 border-primary/30 text-primary",
  cancelled: "bg-muted/40 border-border/50 text-muted-foreground",
  note:      "bg-amber-500/10 border-amber-500/30 text-amber-300",
};

function ActionQueueEventsSection({ events }: { events: ActionQueueEvent[] }) {
  if (!events?.length) return null;
  // Defensive: sort newest-first regardless of fetch order.
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return (
    <section className="glass rounded-2xl p-4 mb-4" aria-label="Action Queue events">
      <div className="flex items-center gap-2 mb-3">
        <ListChecks className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Action Queue events
        </h2>
        <span className="text-[11px] text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? "event" : "events"} · read-only
        </span>
      </div>
      <ul className="space-y-2">
        {sorted.map((e) => (
          <li
            key={e.id}
            className="rounded-xl border border-border/50 bg-secondary/30 p-3"
          >
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium uppercase",
                  ACTION_EVENT_TONE[e.event_type] ?? ACTION_EVENT_TONE.created,
                )}
              >
                {e.event_type}
              </span>
              <span className="text-muted-foreground">
                {e.previous_status ?? "—"} → {e.new_status ?? "—"}
              </span>
              <span
                className="ml-auto text-muted-foreground"
                title={format(new Date(e.created_at), "PPpp")}
              >
                {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
              </span>
              {e.action_queue_id && (
                <Link
                  to={`/actions/${e.action_queue_id}`}
                  className="text-[11px] text-primary hover:underline"
                >
                  View Details
                </Link>
              )}
            </div>
            {e.action?.suggested_change && (
              <p className="text-sm mt-2">{e.action.suggested_change}</p>
            )}
            {e.action?.reason && (
              <p className="text-xs text-muted-foreground mt-1">{e.action.reason}</p>
            )}
            {e.note && (
              <p className="text-xs italic text-muted-foreground mt-2">· {e.note}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
