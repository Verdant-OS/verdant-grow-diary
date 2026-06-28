/**
 * EndOfRunGrowReportPreview (page) — protected route shell for the
 * read-only End-of-Run Grow Report preview.
 *
 * Presenter-only: data access lives in useEndOfRunGrowReportData and all
 * aggregation in the pure view-model builder. No writes, no AI generation,
 * no automation, no device control, no schema changes.
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";

import EmptyState from "@/components/EmptyState";
import EndOfRunGrowReportPreview from "@/components/EndOfRunGrowReportPreview";
import { Button } from "@/components/ui/button";
import { useEndOfRunGrowReportData } from "@/hooks/useEndOfRunGrowReportData";
import { growDetailPath } from "@/lib/routes";

export default function EndOfRunGrowReportPreviewPage() {
  const { growId } = useParams<{ growId: string }>();
  const { status, report, error } = useEndOfRunGrowReportData(growId);

  if (status === "loading" || status === "idle") {
    return (
      <div className="mx-auto max-w-5xl" data-testid="end-of-run-report-loading">
        <EmptyState
          icon={<Loader2 className="h-6 w-6 animate-spin" />}
          title="Building end-of-run report…"
          description="Collecting logged events, sensor snapshots, alerts, and actions."
        />
      </div>
    );
  }

  if (status === "unavailable" || !report) {
    return (
      <div className="mx-auto max-w-5xl" data-testid="end-of-run-report-error">
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Report unavailable"
          description={error ?? "This grow report could not be loaded."}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-10">
      <Button asChild variant="ghost" size="sm" className="mb-3">
        <Link to={growDetailPath(report.header.growId)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to grow
        </Link>
      </Button>
      <EndOfRunGrowReportPreview report={report} />
    </div>
  );
}
