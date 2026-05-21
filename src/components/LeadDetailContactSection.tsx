import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import type { LeadRow } from "@/hooks/useLeadsList";
import type { LeadDetailViewModel } from "@/lib/leadDetailViewModel";

export interface LeadDetailContactSectionProps {
  lead: LeadRow;
  vm: LeadDetailViewModel;
}

export default function LeadDetailContactSection({
  lead,
  vm,
}: LeadDetailContactSectionProps) {
  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(lead.email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <>
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
    </>
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
