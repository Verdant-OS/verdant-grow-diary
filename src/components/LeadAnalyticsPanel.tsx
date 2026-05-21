import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  formatRate,
  groupByLeadType,
  groupBySource,
  summarizeAnalytics,
} from "@/lib/leadAnalyticsRules";
import { useMemo } from "react";

interface Props {
  leads: LeadRow[];
  scopeLabel: string;
}

export default function LeadAnalyticsPanel({ leads, scopeLabel }: Props) {
  const summary = useMemo(() => summarizeAnalytics(leads), [leads]);
  const bySource = useMemo(() => groupBySource(leads), [leads]);
  const byType = useMemo(() => groupByLeadType(leads), [leads]);

  if (leads.length === 0) {
    return (
      <div
        className="rounded-xl border border-border/50 bg-card/40 p-6 text-center"
        data-testid="lead-analytics-empty"
      >
        <p className="text-sm text-muted-foreground">
          No lead analytics available for this view.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3" data-testid="lead-analytics-section">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lead analytics
        </h2>
        <span className="text-xs text-muted-foreground">
          Analytics for {scopeLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Top source", value: summary.top_source },
          { label: "Best closing source", value: summary.best_closing_source },
          { label: "Highest spam source", value: summary.highest_spam_source },
          {
            label: "Most common lead type",
            value: summary.most_common_lead_type,
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-border/50 bg-card/40 p-3"
          >
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className="mt-1 font-display text-lg font-semibold truncate">
              {c.value ?? "—"}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div
          className="rounded-xl border border-border/50 overflow-x-auto"
          data-testid="lead-analytics-source-table"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">New</TableHead>
                <TableHead className="text-right">Contacted</TableHead>
                <TableHead className="text-right">Follow-up</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Spam</TableHead>
                <TableHead className="text-right">Needs</TableHead>
                <TableHead className="text-right">Closed %</TableHead>
                <TableHead className="text-right">Spam %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySource.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.key}</TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right">{s.new}</TableCell>
                  <TableCell className="text-right">{s.contacted}</TableCell>
                  <TableCell className="text-right">{s.follow_up}</TableCell>
                  <TableCell className="text-right">{s.closed}</TableCell>
                  <TableCell className="text-right">{s.spam}</TableCell>
                  <TableCell className="text-right">{s.needs_action}</TableCell>
                  <TableCell className="text-right">
                    {formatRate(s.closed_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatRate(s.spam_rate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div
          className="rounded-xl border border-border/50 overflow-x-auto"
          data-testid="lead-analytics-type-table"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Follow-up</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Spam</TableHead>
                <TableHead className="text-right">Contacted %</TableHead>
                <TableHead className="text-right">Closed %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byType.map((s) => (
                <TableRow key={s.key}>
                  <TableCell className="font-medium">{s.key}</TableCell>
                  <TableCell className="text-right">{s.total}</TableCell>
                  <TableCell className="text-right">{s.follow_up}</TableCell>
                  <TableCell className="text-right">{s.closed}</TableCell>
                  <TableCell className="text-right">{s.spam}</TableCell>
                  <TableCell className="text-right">
                    {formatRate(s.contacted_rate)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatRate(s.closed_rate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
