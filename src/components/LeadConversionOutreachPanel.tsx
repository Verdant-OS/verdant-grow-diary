import { Copy, Mail } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { LeadRow } from "@/hooks/useLeadsList";
import { buildLeadConversionOutreach } from "@/lib/leadConversionOutreachRules";

export default function LeadConversionOutreachPanel({ lead }: { lead: LeadRow }) {
  const result = buildLeadConversionOutreach(lead);
  if (!result.eligible) return null;

  const { draft } = result;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
      data-section="conversion-outreach"
      data-testid="lead-conversion-outreach"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Requested checkout follow-up</h3>
          <p className="text-xs text-muted-foreground">
            {draft.kind === "first_contact" ? "First-contact" : "One-time follow-up"} draft for{" "}
            {draft.planLabel}
          </p>
        </div>
        <Badge variant="outline">Review before sending</Badge>
      </div>

      <div className="space-y-1 text-xs">
        <p>
          <span className="text-muted-foreground">To:</span> {draft.recipient}
        </p>
        <p>
          <span className="text-muted-foreground">Subject:</span> {draft.subject}
        </p>
      </div>

      <Textarea aria-label="Outreach email body" value={draft.body} readOnly rows={12} />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copy(draft.subject, "Subject")}
        >
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy subject
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copy(draft.body, "Body")}
        >
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy body
        </Button>
        <Button asChild type="button" size="sm">
          <a href={draft.mailtoHref}>
            <Mail className="mr-2 h-3.5 w-3.5" />
            Open email draft
          </a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Nothing is sent or logged automatically. After you send, use the existing interaction log to
        record the email and schedule any follow-up.
      </p>
    </section>
  );
}
