import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";
import type { LeadDetailViewModel } from "@/lib/leadDetailViewModel";

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

export interface LeadDetailMetadataSectionProps {
  lead: LeadRow;
  vm: LeadDetailViewModel;
  onStatusChange: (lead: LeadRow, next: LeadStatus) => void | Promise<void>;
  onSaveNotes: (lead: LeadRow, notes: string) => void | Promise<void>;
  onSaveFollowUp: (lead: LeadRow, isoOrEmpty: string) => void | Promise<void>;
}

export default function LeadDetailMetadataSection({
  lead,
  vm,
  onStatusChange,
  onSaveNotes,
  onSaveFollowUp,
}: LeadDetailMetadataSectionProps) {
  return (
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
  );
}
