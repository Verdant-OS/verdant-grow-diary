import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  auditLeadDataQuality,
  type LeadDataQualityFinding,
  type LeadDataQualitySeverity,
} from "@/lib/leadDataQualityAuditRules";
import type { LeadRow } from "@/hooks/useLeadsList";

const SEVERITY_VARIANT: Record<
  LeadDataQualitySeverity,
  "destructive" | "default" | "secondary" | "outline"
> = {
  warning: "destructive",
  watch: "default",
  info: "secondary",
};

export interface LeadDataQualityAuditPanelProps {
  leads: readonly LeadRow[];
}

/**
 * Read-only presenter for Lead Data Quality findings. No I/O.
 */
export default function LeadDataQualityAuditPanel({
  leads,
}: LeadDataQualityAuditPanelProps) {
  const findings = useMemo(() => auditLeadDataQuality(leads), [leads]);

  return (
    <div
      className="rounded-xl border border-border/50 bg-card/40 p-4"
      data-testid="lead-data-quality-audit"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Data Quality Audit
        </h3>
        <span className="text-xs text-muted-foreground">
          {findings.length} finding{findings.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {findings.map((f) => (
          <FindingRow key={f.id} finding={f} />
        ))}
      </ul>
    </div>
  );
}

function FindingRow({ finding }: { finding: LeadDataQualityFinding }) {
  return (
    <li
      className="rounded-md border border-border/40 bg-card/30 p-2"
      data-testid="lead-data-quality-audit-item"
      data-severity={finding.severity}
      data-finding-id={finding.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground">{finding.title}</div>
          <div className="text-xs text-muted-foreground">
            {finding.count} lead{finding.count === 1 ? "" : "s"} ({finding.percentage}%)
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <span className="text-foreground">Suggested:</span>{" "}
            {finding.recommendation}
          </div>
        </div>
        <Badge variant={SEVERITY_VARIANT[finding.severity]}>
          {finding.severity}
        </Badge>
      </div>
    </li>
  );
}
