import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  useLeadsList,
  type LeadRow,
  type LeadStatus,
} from "@/hooks/useLeadsList";
import { useLeadEvents } from "@/hooks/useLeadEvents";
import { useCreateLeadEvent } from "@/hooks/useCreateLeadEvent";
import {
  QUICK_FILTERS,
  filterAndSortLeads,
  followUpBadge,
  summarizeLeads,
  type LeadQuickFilter,
} from "@/lib/leadFollowupRules";
import {
  INTERACTION_OPTIONS,
  describeFollowUpChange,
  followUpDidChange,
  labelForEventType,
  type InteractionEventType,
} from "@/lib/leadEventRules";

const LEAD_TYPES = [
  "beta_user",
  "hardware_partner",
  "grower",
  "investor",
  "other",
] as const;

const SOURCES = ["landing", "other"] as const;

const STATUSES: LeadStatus[] = [
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
];

const STATUS_VARIANT: Record<LeadStatus, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  reviewed: "secondary",
  contacted: "secondary",
  follow_up: "outline",
  closed: "outline",
  spam: "destructive",
};

export default function Leads() {
  const [leadType, setLeadType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<LeadQuickFilter>("all");
  const [search, setSearch] = useState("");

  const { loading, authorized, error, leads, updateLead } = useLeadsList({
    leadType: leadType === "all" ? null : leadType,
    source: source === "all" ? null : source,
    status: status === "all" ? null : status,
  });
  const { createEvent, submitting: creatingEvent } = useCreateLeadEvent();
  const [activityNonce, setActivityNonce] = useState<Record<string, number>>({});
  const bumpActivity = (leadId: string) =>
    setActivityNonce((m) => ({ ...m, [leadId]: (m[leadId] ?? 0) + 1 }));

  const summary = useMemo(() => summarizeLeads(leads), [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? leads.filter(
          (l) =>
            l.email.toLowerCase().includes(q) ||
            (l.name ?? "").toLowerCase().includes(q) ||
            (l.company ?? "").toLowerCase().includes(q),
        )
      : leads;
    return filterAndSortLeads(base, quickFilter);
  }, [leads, search, quickFilter]);

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  async function setLeadStatus(l: LeadRow, next: LeadStatus) {
    const patch: Parameters<typeof updateLead>[1] = { status: next };
    if (next === "contacted" || next === "closed") {
      patch.contacted_at = l.contacted_at ?? new Date().toISOString();
      patch.follow_up_at = null;
    } else if (next === "follow_up") {
      patch.contacted_at = l.contacted_at ?? new Date().toISOString();
    } else {
      patch.contacted_at = null;
      patch.follow_up_at = null;
    }
    const { error: uErr } = await updateLead(l.id, patch);
    if (uErr) toast.error(uErr);
    else toast.success(`Marked ${next.replace("_", " ")}`);
  }

  async function saveNotes(l: LeadRow, notes: string) {
    const { error: uErr } = await updateLead(l.id, {
      operator_notes: notes || null,
    });
    if (uErr) toast.error(uErr);
    else toast.success("Notes saved");
  }

  async function saveFollowUp(l: LeadRow, iso: string) {
    const next = iso || null;
    const changed = followUpDidChange(l.follow_up_at, next);
    const { error: uErr } = await updateLead(l.id, {
      follow_up_at: next,
    });
    if (uErr) {
      toast.error(uErr);
      return;
    }
    if (changed) {
      await createEvent({
        leadId: l.id,
        eventType: "follow_up_changed",
        note: describeFollowUpChange(l.follow_up_at, next),
      });
      bumpActivity(l.id);
    }
    toast.success("Follow-up updated");
    return;
  }

  async function logInteraction(
    l: LeadRow,
    eventType: InteractionEventType,
    note: string,
  ) {
    const { error: cErr } = await createEvent({
      leadId: l.id,
      eventType,
      note: note.trim() || null,
    });
    if (cErr) {
      toast.error(cErr);
      return;
    }
    bumpActivity(l.id);
    toast.success(`${labelForEventType(eventType)} logged`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Leads Inbox" description="Operator-only view of public lead submissions" />

      {!loading && !authorized && (
        <div className="rounded-xl border border-border/50 bg-card/40 p-6 text-center">
          <h2 className="font-display text-lg font-semibold">Unauthorized</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Leads are operator-only. If you should have access, contact an operator.
          </p>
        </div>
      )}

      {authorized && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "New leads", value: summary.new_leads },
              { label: "Needs action", value: summary.needs_action },
              { label: "Overdue follow-ups", value: summary.overdue },
              { label: "Due today", value: summary.due_today },
              { label: "Upcoming follow-ups", value: summary.upcoming },
              { label: "Closed leads", value: summary.closed },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-border/50 bg-card/40 p-3"
              >
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="mt-1 font-display text-2xl font-semibold">
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lead quick filters">
            {QUICK_FILTERS.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={quickFilter === f.id ? "default" : "outline"}
                onClick={() => setQuickFilter(f.id)}
                role="tab"
                aria-selected={quickFilter === f.id}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Lead type</label>
              <Select value={leadType} onValueChange={setLeadType}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {LEAD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Source</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-48">
              <label className="text-xs text-muted-foreground">Search</label>
              <Input
                placeholder="email, name, company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load leads: {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading leads…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card/40 p-8 text-center">
              <p className="text-sm text-muted-foreground">No leads match these filters.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={STATUS_VARIANT[l.status] ?? "secondary"}>
                            {l.status}
                          </Badge>
                          {(() => {
                            const b = followUpBadge(l);
                            if (!b) return null;
                            const map: Record<string, { variant: "destructive" | "default" | "secondary" | "outline"; label: string }> = {
                              overdue: { variant: "destructive", label: "Overdue" },
                              due_today: { variant: "default", label: "Due today" },
                              upcoming: { variant: "secondary", label: "Upcoming" },
                              no_follow_up: { variant: "outline", label: "No follow-up" },
                            };
                            const m = map[b];
                            return <Badge variant={m.variant}>{m.label}</Badge>;
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>{l.name ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{l.email}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => copyEmail(l.email)}
                            aria-label="Copy email"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{l.company ?? "—"}</TableCell>
                      <TableCell><Badge variant="secondary">{l.lead_type}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{l.source}</Badge></TableCell>
                      <TableCell className="max-w-sm whitespace-pre-wrap text-sm text-muted-foreground">
                        {l.message ?? "—"}
                      </TableCell>
                      <TableCell className="min-w-72 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => setLeadStatus(l, "reviewed")}>
                            Reviewed
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setLeadStatus(l, "contacted")}>
                            Contacted
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setLeadStatus(l, "follow_up")}>
                            Follow-up
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setLeadStatus(l, "closed")}>
                            Close
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setLeadStatus(l, "spam")}>
                            Spam
                          </Button>
                        </div>
                        {l.status === "follow_up" && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">
                              Follow-up at
                            </label>
                            <Input
                              type="datetime-local"
                              defaultValue={
                                l.follow_up_at
                                  ? new Date(l.follow_up_at)
                                      .toISOString()
                                      .slice(0, 16)
                                  : ""
                              }
                              onBlur={(e) => {
                                const v = e.target.value;
                                const iso = v ? new Date(v).toISOString() : "";
                                if (
                                  (iso || null) !== (l.follow_up_at ?? null)
                                ) {
                                  saveFollowUp(l, iso);
                                }
                              }}
                            />
                          </div>
                        )}
                        <Textarea
                          rows={2}
                          placeholder="Operator notes"
                          defaultValue={l.operator_notes ?? ""}
                          onBlur={(e) => {
                            if ((e.target.value || "") !== (l.operator_notes ?? "")) {
                              saveNotes(l, e.target.value);
                            }
                          }}
                        />
                        <LogInteraction
                          disabled={creatingEvent}
                          onSubmit={(t, n) => logInteraction(l, t, n)}
                        />
                        <LeadActivity
                          leadId={l.id}
                          refreshKey={`${l.updated_at ?? l.created_at}:${activityNonce[l.id] ?? 0}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeadActivity({ leadId, refreshKey }: { leadId: string; refreshKey: string }) {
  // refreshKey lets the activity panel refetch when the lead row is updated.
  const refreshNonce = useMemo(() => refreshKey.length + refreshKey.charCodeAt(0), [refreshKey]);
  const { events, loading, error } = useLeadEvents(leadId, refreshNonce);
  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading activity…</p>;
  }
  if (error) {
    return <p className="text-xs text-destructive">Activity unavailable: {error}</p>;
  }
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">No activity yet.</p>;
  }
  return (
    <ul className="space-y-1 text-xs text-muted-foreground" data-testid="lead-activity">
      {events.map((ev) => (
        <li key={ev.id} className="flex items-start gap-2">
          <span className="tabular-nums">
            {new Date(ev.created_at).toLocaleString()}
          </span>
          <span>
            {ev.event_type === "status_change"
              ? `${ev.old_status ?? "—"} → ${ev.new_status ?? "—"}`
              : ev.event_type}
            {ev.note ? ` · ${ev.note}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
