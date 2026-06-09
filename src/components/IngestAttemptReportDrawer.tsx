/**
 * IngestAttemptReportDrawer — operator-only Dialog wrapper around
 * IngestAttemptReportPanel. Opens from /operator/ecowitt-bridge-status.
 *
 * Read-only. Calls nothing. Stores nothing. Never displays the raw token.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import IngestAttemptReportPanel from "@/components/IngestAttemptReportPanel";
import type { IngestAttemptReport } from "@/lib/ingestAttemptReportRules";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  report: IngestAttemptReport | null;
  onCopy?: (json: string) => void;
}

export default function IngestAttemptReportDrawer({
  open,
  onOpenChange,
  report,
  onCopy,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="ingest-attempt-report-drawer"
        className="max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Latest Ecowitt bridge ingest report</DialogTitle>
          <DialogDescription>
            Read-only, redacted operator view. Nothing is sent or stored from
            this drawer.
          </DialogDescription>
        </DialogHeader>
        {report ? (
          <IngestAttemptReportPanel report={report} onCopy={onCopy} />
        ) : (
          <p
            className="text-sm text-muted-foreground"
            data-testid="ingest-attempt-report-drawer-empty"
          >
            No ingest report available yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
