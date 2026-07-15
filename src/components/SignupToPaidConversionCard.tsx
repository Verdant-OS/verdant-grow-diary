import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildSignupToPaidFunnelViewModel,
  type SignupToPaidSnapshot,
} from "@/lib/signupToPaidSnapshotRules";

export interface SignupToPaidConversionCardProps {
  snapshot: SignupToPaidSnapshot;
  authoritativeActivePaid: number;
}

function formatRate(value: number | null): string {
  return value === null ? "Unavailable" : `${value}%`;
}

/** Presenter-only conversion readout; cohort/ranking decisions live in pure rules. */
export default function SignupToPaidConversionCard({
  snapshot,
  authoritativeActivePaid,
}: SignupToPaidConversionCardProps) {
  const viewModel = buildSignupToPaidFunnelViewModel(snapshot);
  const reconciles = snapshot.counts.activePaidTotal === authoritativeActivePaid;

  return (
    <Card data-testid="signup-to-paid-conversion-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Signup-to-active-paid cohorts</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Current active-paid subscribers divided by account starts from the same fixed
              first-touch source. This is observed attribution, not proof that a channel caused a
              purchase.
            </CardDescription>
          </div>
          <Badge variant={reconciles ? "outline" : "destructive"} data-testid="paid-reconciliation">
            {reconciles ? "Paid total reconciled" : "Paid total needs audit"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground">Attributed account starts</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {snapshot.counts.attributedAccountsTotal}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground">Attributed active paid</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {snapshot.counts.attributedActivePaidTotal}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground">Source unavailable — accounts</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {snapshot.counts.unattributedAccountsTotal}
          </div>
        </div>
        <div className="rounded-lg border border-border/50 p-3">
          <div className="text-xs text-muted-foreground">Source unavailable — active paid</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">
            {snapshot.counts.unattributedActivePaidTotal}
          </div>
        </div>
      </CardContent>

      <CardContent className="border-t border-border/60 pt-6">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Operator decision signal</p>
          <p className="mt-1 text-sm text-muted-foreground">{viewModel.recommendation}</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">First-touch source</th>
                <th className="py-2 pr-3">Account starts</th>
                <th className="py-2 pr-3">Active paid</th>
                <th className="py-2 pr-3">Active-paid rate</th>
                <th className="py-2">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {viewModel.rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0" data-source={row.id}>
                  <td className="py-3 pr-3 font-medium">{row.label}</td>
                  <td className="py-3 pr-3 tabular-nums">{row.accounts}</td>
                  <td className="py-3 pr-3 tabular-nums">{row.activePaid}</td>
                  <td className="py-3 pr-3 tabular-nums">
                    {row.integrityMismatch
                      ? "Audit required"
                      : formatRate(row.activePaidRatePercent)}
                  </td>
                  <td className="py-3">
                    <Badge variant={row.integrityMismatch ? "destructive" : "outline"}>
                      {row.integrityMismatch
                        ? "Mismatch"
                        : row.sampleStatus === "usable"
                          ? "Usable sample"
                          : row.sampleStatus === "directional"
                            ? "Directional"
                            : "No sample"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          A source needs at least five account starts before Verdant calls the sample usable. Older
          accounts without launch attribution remain in “Source unavailable” and are never assigned
          to a campaign retroactively.
        </p>
      </CardContent>
    </Card>
  );
}
