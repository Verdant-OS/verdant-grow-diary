import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import LeadDetailDrawer from "@/components/LeadDetailDrawer";
import LeadAnalyticsPanel from "@/components/LeadAnalyticsPanel";
import {
  useLeadsList,
  type LeadRow,
  type LeadStatus,
} from "@/hooks/useLeadsList";
import { useCreateLeadEvent } from "@/hooks/useCreateLeadEvent";
import {
  QUICK_FILTERS,
  filterAndSortLeads,
  followUpBadge,
  summarizeLeads,
  type LeadQuickFilter,
} from "@/lib/leadFollowupRules";
import {
  SORT_OPTIONS,
  searchLeads,
  sortLeads,
  type LeadSortOption,
} from "@/lib/leadSearchRules";
import {
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

const FOLLOW_UP_BADGE_MAP: Record<
  string,
  { variant: "destructive" | "default" | "secondary" | "outline"; label: string }
> = {
  overdue: { variant: "destructive", label: "Overdue" },
  due_today: { variant: "default", label: "Due today" },
  upcoming: { variant: "secondary", label: "Upcoming" },
  no_follow_up: { variant: "outline", label: "No follow-up" },
};

export default function Leads() {
  const [leadType, setLeadType] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<LeadQuickFilter>("all");
  const [search, setSearch] = useState("");
  const [sortOption, setSortOption] = useState<LeadSortOption>("default");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    const searched = searchLeads(leads, search);
    const filteredSorted = filterAndSortLeads(searched, quickFilter);
    return sortOption === "default"
      ? filteredSorted
      : sortLeads(filteredSorted, sortOption);
  }, [leads, search, quickFilter, sortOption]);


  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedId) ?? null,
    [leads, selectedId],
  );

  function openLead(l: LeadRow) {
    setSelectedId(l.id);
    setDrawerOpen(true);
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
    const { error: uErr } = await updateLead(l.id, { follow_up_at: next });
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
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
              <div className="relative">
                <Input
                  placeholder="name, email, company, role, type, source, message, notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="leads-search-input"
                  className="pr-16"
                />
                {search && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSearch("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 px-2"
                    data-testid="leads-search-clear"
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sort by</label>
              <Select
                value={sortOption}
                onValueChange={(v) => setSortOption(v as LeadSortOption)}
              >
                <SelectTrigger className="w-52" data-testid="leads-sort-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Failed to load leads: {error}
            </div>
          )}

          {!loading && (
            <div
              className="text-xs text-muted-foreground"
              data-testid="leads-result-count"
            >
              Showing {filtered.length} of {leads.length} leads
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading leads…</p>
          ) : filtered.length === 0 ? (
            <div
              className="rounded-xl border border-border/50 bg-card/40 p-8 text-center"
              data-testid="leads-empty-state"
            >
              <p className="text-sm text-muted-foreground">
                No leads match this search/filter.
              </p>
            </div>

          ) : (
            <div
              className="rounded-xl border border-border/50 overflow-x-auto"
              data-testid="leads-table"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Follow-up</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => {
                    const b = followUpBadge(l);
                    const fu = b ? FOLLOW_UP_BADGE_MAP[b] : null;
                    const primary = l.name?.trim() || l.email;
                    const secondary = l.company ?? l.email;
                    return (
                      <TableRow
                        key={l.id}
                        className="cursor-pointer"
                        onClick={() => openLead(l)}
                        data-testid="lead-row"
                      >
                        <TableCell className="space-y-0.5">
                          <div className="font-medium">{primary}</div>
                          <div className="text-xs text-muted-foreground">{secondary}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[l.status] ?? "secondary"}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {fu ? <Badge variant={fu.variant}>{fu.label}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(l.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-end gap-1">
                            {l.status === "new" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLeadStatus(l, "reviewed")}
                              >
                                Reviewed
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openLead(l)}
                              data-testid="lead-view-button"
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      <LeadDetailDrawer
        lead={selectedLead}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        activityNonce={selectedLead ? activityNonce[selectedLead.id] ?? 0 : 0}
        creatingEvent={creatingEvent}
        onStatusChange={setLeadStatus}
        onSaveNotes={saveNotes}
        onSaveFollowUp={saveFollowUp}
        onLogInteraction={logInteraction}
      />
    </div>
  );
}
