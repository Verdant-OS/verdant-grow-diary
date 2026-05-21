import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { LeadRow } from "@/hooks/useLeadsList";
import { useLeadEvents } from "@/hooks/useLeadEvents";
import {
  INTERACTION_OPTIONS,
  labelForEventType,
  type InteractionEventType,
} from "@/lib/leadEventRules";

export interface LeadDetailIntelligenceSectionProps {
  lead: LeadRow;
  activityNonce: number;
  creatingEvent: boolean;
  onLogInteraction: (
    lead: LeadRow,
    type: InteractionEventType,
    note: string,
  ) => void | Promise<void>;
}

export default function LeadDetailIntelligenceSection({
  lead,
  activityNonce,
  creatingEvent,
  onLogInteraction,
}: LeadDetailIntelligenceSectionProps) {
  return (
    <>
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
