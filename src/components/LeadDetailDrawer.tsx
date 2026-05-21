import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
import { Copy } from "lucide-react";
import { toast } from "sonner";

import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";
import { useLeadEvents } from "@/hooks/useLeadEvents";
import {
  INTERACTION_OPTIONS,
  labelForEventType,
  type InteractionEventType,
} from "@/lib/leadEventRules";
import { buildLeadDetailViewModel } from "@/lib/leadDetailViewModel";
import LeadActivityTimeline from "@/components/LeadActivityTimeline";
import LeadNextActionPanel from "@/components/LeadNextActionPanel";
import LeadQualityScoreBadge from "@/components/LeadQualityScoreBadge";
import LeadDetailSnapshotCard from "@/components/LeadDetailSnapshotCard";

const STATUSES: LeadStatus[] = [
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
];

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  contacted: "Contacted",
  follow_up: "Follow-up",
  closed: "Close",
  spam: "Spam",
};

export interface LeadDetailDrawerProps {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activityNonce: number;
  creatingEvent: boolean;
  onStatusChange: (lead: LeadRow, next: LeadStatus) => void | Promise<void>;
  onSaveNotes: (lead: LeadRow, notes: string) => void | Promise<void>;
  onSaveFollowUp: (lead: LeadRow, isoOrEmpty: string) => void | Promise<void>;
  onLogInteraction: (
    lead: LeadRow,
    type: InteractionEventType,
    note: string,
  ) => void | Promise<void>;
}

export default function LeadDetailDrawer({
  lead,
  open,
  onOpenChange,
  activityNonce,
  creatingEvent,
  onStatusChange,
  onSaveNotes,
  onSaveFollowUp,
  onLogInteraction,
}: LeadDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        data-testid="lead-detail-drawer"
      >
        {lead ? (
          <LeadDetailBody
            lead={lead}
            activityNonce={activityNonce}
            creatingEvent={creatingEvent}
            onStatusChange={onStatusChange}
            onSaveNotes={onSaveNotes}
            onSaveFollowUp={onSaveFollowUp}
            onLogInteraction={onLogInteraction}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No lead selected.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetailBody({
  lead,
  activityNonce,
  creatingEvent,
  onStatusChange,
  onSaveNotes,
  onSaveFollowUp,
  onLogInteraction,
}: Omit<LeadDetailDrawerProps, "open" | "onOpenChange" | "lead"> & {
  lead: LeadRow;
}) {
  const vm = buildLeadDetailViewModel(lead);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(lead.email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <div className="space-y-6">
      <SheetHeader className="space-y-1 text-left">
        <SheetTitle className="font-display text-xl">{vm.title}</SheetTitle>
        <SheetDescription>{vm.subtitle}</SheetDescription>
      </SheetHeader>

      {/* Lead Summary */}
      <section className="space-y-2" data-section="summary">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lead Summary
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{lead.status}</Badge>
          <Badge variant="outline">{lead.lead_type}</Badge>
          <Badge variant="outline">{lead.source}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Received</dt>
          <dd>{vm.receivedLabel}</dd>
          <dt className="text-muted-foreground">Contacted</dt>
          <dd>{vm.contactedLabel ?? "—"}</dd>
          <dt className="text-muted-foreground">Follow-up</dt>
          <dd>{vm.followUpLabel ?? "—"}</dd>
        </dl>
      </section>

      {/* Submission Details (read-only) */}
      <section className="space-y-2" data-section="submission">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Submission Details
        </h3>
        <dl
          className="grid grid-cols-[8rem,1fr] gap-x-3 gap-y-2 text-sm"
          data-testid="submission-details"
        >
          {vm.submission.map((f) => (
            <FieldRow
              key={f.label}
              label={f.label}
              value={f.value}
              actions={
                f.label === "Email" ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={copyEmail}
                    aria-label="Copy email"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                ) : null
              }
            />
          ))}
        </dl>
      </section>

      {/* Operator Workflow */}
      <section className="space-y-3" data-section="operator-workflow">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Operator Workflow
        </h3>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={s === "spam" ? "destructive" : s === lead.status ? "default" : "outline"}
              onClick={() => onStatusChange(lead, s)}
            >
              {STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="lead-followup">
            Follow-up at
          </label>
          <Input
            id="lead-followup"
            type="datetime-local"
            defaultValue={vm.followUpInputValue}
            key={`fu-${lead.id}-${vm.followUpInputValue}`}
            onBlur={(e) => {
              const v = e.target.value;
              const iso = v ? new Date(v).toISOString() : "";
              onSaveFollowUp(lead, iso);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="lead-notes">
            Operator notes
          </label>
          <Textarea
            id="lead-notes"
            rows={3}
            placeholder="Internal notes (operators only)"
            defaultValue={lead.operator_notes ?? ""}
            key={`notes-${lead.id}-${lead.updated_at ?? ""}`}
            onBlur={(e) => {
              if ((e.target.value || "") !== (lead.operator_notes ?? "")) {
                onSaveNotes(lead, e.target.value);
              }
            }}
          />
        </div>
      </section>

      {/* Log Interaction */}
      <section className="space-y-2" data-section="log-interaction">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Log Interaction
        </h3>
        <LogInteraction
          disabled={creatingEvent}
          onSubmit={(t, n) => onLogInteraction(lead, t, n)}
        />
      </section>

      {/* Activity History */}
      <section className="space-y-2" data-section="activity">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity History
        </h3>
        <LeadActivity leadId={lead.id} refreshNonce={activityNonce} />
      </section>

      {/* Derived Activity Timeline (read-only) */}
      <section className="space-y-2" data-section="activity-timeline">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Derived Timeline
        </h3>
        <LeadActivityTimeline lead={lead} />
      </section>

      {/* Next Action Advisor (read-only) */}
      <section className="space-y-2" data-section="next-action">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Next Action
        </h3>
        <LeadNextActionPanel lead={lead} />
        <LeadQualityScoreBadge lead={lead} />
      </section>
    </div>
  );
}

function FieldRow({
  label,
  value,
  actions,
}: {
  label: string;
  value: string;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-start gap-2 whitespace-pre-wrap break-words">
        <span className="flex-1">{value}</span>
        {actions}
      </dd>
    </>
  );
}

function LeadActivity({
  leadId,
  refreshNonce,
}: {
  leadId: string;
  refreshNonce: number;
}) {
  const { events, loading, error } = useLeadEvents(leadId, refreshNonce);
  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading activity…</p>;
  }
  if (error) {
    return <p className="text-xs text-destructive">Activity unavailable: {error}</p>;
  }
  if (events.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="activity-empty">
        No activity yet. Use Log Interaction to record the first event.
      </p>
    );
  }
  return (
    <ol
      className="space-y-2 text-xs text-muted-foreground"
      data-testid="lead-activity"
    >
      {events.map((ev) => {
        const label = labelForEventType(ev.event_type);
        const detail =
          ev.event_type === "status_change"
            ? `${ev.old_status ?? "—"} → ${ev.new_status ?? "—"}`
            : null;
        return (
          <li
            key={ev.id}
            className="rounded-md border border-border/40 bg-card/30 p-2"
            data-event-type={ev.event_type}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{label}</span>
              <span className="tabular-nums">
                {new Date(ev.created_at).toLocaleString()}
              </span>
            </div>
            {detail && <div className="mt-1">{detail}</div>}
            {ev.note && <div className="mt-1">{ev.note}</div>}
          </li>
        );
      })}
    </ol>
  );
}

function LogInteraction({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (type: InteractionEventType, note: string) => void | Promise<void>;
}) {
  const [type, setType] = useState<InteractionEventType>("call_logged");
  const [note, setNote] = useState("");
  return (
    <div
      className="space-y-2 rounded-md border border-border/50 bg-card/30 p-3"
      data-testid="log-interaction"
    >
      <div className="flex flex-wrap gap-2">
        <Select value={type} onValueChange={(v) => setType(v as InteractionEventType)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTERACTION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="h-9 flex-1 min-w-40"
          placeholder="Optional note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={async () => {
            await onSubmit(type, note);
            setNote("");
          }}
        >
          Log
        </Button>
      </div>
    </div>
  );
}
