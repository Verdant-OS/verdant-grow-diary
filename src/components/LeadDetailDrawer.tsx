import { Sheet, SheetContent } from "@/components/ui/sheet";

import type { LeadRow, LeadStatus } from "@/hooks/useLeadsList";
import type { InteractionEventType } from "@/lib/leadEventRules";
import { buildLeadDetailViewModel } from "@/lib/leadDetailViewModel";
import LeadActivityTimeline from "@/components/LeadActivityTimeline";
import LeadNextActionPanel from "@/components/LeadNextActionPanel";
import LeadQualityScoreBadge from "@/components/LeadQualityScoreBadge";
import LeadDetailSnapshotCard from "@/components/LeadDetailSnapshotCard";
import LeadDetailHeader from "@/components/LeadDetailHeader";
import LeadDetailContactSection from "@/components/LeadDetailContactSection";
import LeadDetailMetadataSection from "@/components/LeadDetailMetadataSection";
import LeadDetailIntelligenceSection from "@/components/LeadDetailIntelligenceSection";

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

  return (
    <div className="space-y-6">
      <LeadDetailHeader vm={vm} />

      {/* 1. Snapshot Card */}
      <LeadDetailSnapshotCard lead={lead} />

      {/* 2. Next Action + 3. Quality Score */}
      <section className="space-y-2" data-section="next-action">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Next Action
        </h3>
        <LeadNextActionPanel lead={lead} />
        <LeadQualityScoreBadge lead={lead} />
      </section>

      {/* 4. Derived Timeline (read-only) */}
      <section className="space-y-2" data-section="activity-timeline">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Derived Timeline
        </h3>
        <LeadActivityTimeline lead={lead} />
      </section>

      {/* 5. Existing lead details/fields */}
      <LeadDetailContactSection lead={lead} vm={vm} />
      <LeadDetailMetadataSection
        lead={lead}
        vm={vm}
        onStatusChange={onStatusChange}
        onSaveNotes={onSaveNotes}
        onSaveFollowUp={onSaveFollowUp}
      />
      <LeadDetailIntelligenceSection
        lead={lead}
        activityNonce={activityNonce}
        creatingEvent={creatingEvent}
        onLogInteraction={onLogInteraction}
      />
    </div>
  );
}
