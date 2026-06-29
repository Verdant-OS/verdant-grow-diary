/**
 * EvidenceCoveragePanel — read-only diagnostics presenter.
 *
 * Renders counts of Alerts and Action Queue items with linked vs.
 * fallback-only originating timeline event refs. No raw refs, no IDs,
 * no payloads, no tokens. No inference of missing evidence.
 */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  EvidenceCoverageBreakdownRow,
  EvidenceCoverageBucket,
  EvidenceCoverageViewModel,
} from "@/lib/evidenceCoverageViewModel";

export interface EvidenceCoveragePanelProps {
  viewModel: EvidenceCoverageViewModel;
  status?: "idle" | "loading" | "ok" | "unavailable";
}

function BucketCard({
  title,
  bucket,
  testId,
}: {
  title: string;
  bucket: EvidenceCoverageBucket;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline" data-testid={`${testId}-linked-pct`}>
            {bucket.linkedPct}% linked
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-1">
        <p>
          Total: <span data-testid={`${testId}-total`}>{bucket.total}</span>
        </p>
        <p>
          Linked:{" "}
          <span data-testid={`${testId}-linked`}>{bucket.linked}</span>
        </p>
        <p>
          Fallback-only:{" "}
          <span data-testid={`${testId}-fallback`}>{bucket.fallbackOnly}</span>
        </p>
        <p>
          Invalid refs:{" "}
          <span data-testid={`${testId}-invalid`}>{bucket.invalidRefs}</span>
        </p>
      </CardContent>
    </Card>
  );
}

export function EvidenceCoveragePanel({
  viewModel,
  status = "ok",
}: EvidenceCoveragePanelProps) {
  return (
    <section
      aria-labelledby="evidence-coverage-heading"
      className="space-y-3"
      data-testid="evidence-coverage-panel"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="evidence-coverage-heading" className="text-lg font-semibold">
          Read-only evidence coverage
        </h2>
        <Badge variant="outline">Internal</Badge>
        <Badge variant="secondary">Diagnostics</Badge>
        <Badge variant="outline">Read-only</Badge>
      </div>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Loading coverage…</p>
      )}
      {status === "unavailable" && (
        <p className="text-sm text-muted-foreground">
          Coverage unavailable right now.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <BucketCard
          title="Alerts"
          bucket={viewModel.alerts}
          testId="evidence-coverage-alerts"
        />
        <BucketCard
          title="Action Queue"
          bucket={viewModel.actions}
          testId="evidence-coverage-actions"
        />
        <BucketCard
          title="Overall"
          bucket={viewModel.overall}
          testId="evidence-coverage-overall"
        />
      </div>

      {viewModel.coverageHint && (
        <Card
          data-testid="evidence-coverage-hint"
          className="border-muted bg-muted/40"
        >
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Evidence coverage note
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p data-testid="evidence-coverage-hint-copy">
              {viewModel.coverageHint}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2" data-testid="evidence-coverage-breakdown">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Coverage by category</h3>
          <p className="text-xs text-muted-foreground">
            Grouped counts only. No raw evidence refs or payloads are shown.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <BreakdownCard
            title="Alerts by category"
            rows={viewModel.alertsByCategory}
            emptyLabel="No alert categories to summarize yet."
            testId="evidence-coverage-alerts-by-category"
          />
          <BreakdownCard
            title="Action Queue by category"
            rows={viewModel.actionsByCategory}
            emptyLabel="No action categories to summarize yet."
            testId="evidence-coverage-actions-by-category"
          />
        </div>
      </div>

      <ul
        className="text-xs text-muted-foreground space-y-1 list-disc pl-5"
        data-testid="evidence-coverage-notes"
      >
        {viewModel.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </section>
  );
}

function BreakdownCard({
  title,
  rows,
  emptyLabel,
  testId,
}: {
  title: string;
  rows: readonly EvidenceCoverageBreakdownRow[];
  emptyLabel: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid={`${testId}-empty`}
          >
            {emptyLabel}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Linked</TableHead>
                <TableHead className="text-right">Fallback-only</TableHead>
                <TableHead className="text-right">Invalid refs</TableHead>
                <TableHead className="text-right">Linked %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.label}
                  data-testid={`${testId}-row-${row.label}`}
                >
                  <TableCell>{row.label}</TableCell>
                  <TableCell className="text-right">{row.total}</TableCell>
                  <TableCell className="text-right">{row.linked}</TableCell>
                  <TableCell className="text-right">{row.fallbackOnly}</TableCell>
                  <TableCell className="text-right">{row.invalidRefs}</TableCell>
                  <TableCell className="text-right">{row.linkedPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default EvidenceCoveragePanel;
