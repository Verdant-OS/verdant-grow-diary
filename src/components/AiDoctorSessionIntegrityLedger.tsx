/**
 * AiDoctorSessionIntegrityLedger — read-only, owner-scoped view proving WHAT
 * was persisted for each saved AI Doctor session (timestamp, grow/tent/plant
 * scope, frozen sensor-evidence classification) without exposing raw prompt
 * text, analysis, photo URLs, model payloads, or `user_id`.
 *
 * Mounted at `/doctor/sessions?view=ledger` — see AiDoctorSessionsIndex.tsx.
 *
 * Safety:
 *   - Read-only. Never re-runs AI, never fetches live sensor telemetry,
 *     never creates Action Queue items, alerts, or diary entries.
 *   - Presenter-only: all classification/formatting logic lives in
 *     `aiDoctorSessionLedgerViewModel.ts`; this component only renders it.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, Copy, Check, Eye, EyeOff, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { copyShareLink } from "@/lib/aiDoctorSessionsShareLinkRules";
import { useAiDoctorSessionLedger } from "@/hooks/useAiDoctorSessionLedger";
import {
  truncateId,
  type AiDoctorLedgerEntry,
  type AiDoctorLedgerEvidenceTone,
} from "@/lib/aiDoctorSessionLedgerViewModel";

const EVIDENCE_TONE_BADGE_CLASS: Record<AiDoctorLedgerEvidenceTone, string> = {
  healthy: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
  cautionary: "border-amber-500/50 text-amber-700 dark:text-amber-300",
  unsafe: "border-destructive/50 text-destructive",
  missing: "text-muted-foreground",
  legacy: "text-muted-foreground",
};

function IdChip({
  id,
  showTechnical,
  copiedValue,
  onCopy,
  testIdPrefix,
}: {
  id: string | null;
  showTechnical: boolean;
  copiedValue: string | null;
  onCopy: (value: string) => void;
  testIdPrefix: string;
}) {
  if (!id) {
    return (
      <span className="text-xs" data-testid={`${testIdPrefix}-none`}>
        —
      </span>
    );
  }
  const display = showTechnical ? id : truncateId(id);
  return (
    <span className="inline-flex items-center gap-1" data-testid={testIdPrefix}>
      <code className="text-[11px]" data-testid={`${testIdPrefix}-value`} title={id}>
        {display}
      </code>
      <button
        type="button"
        className="inline-flex items-center rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onCopy(id)}
        data-testid={`${testIdPrefix}-copy`}
        aria-label={`Copy ${testIdPrefix.replace(/-/g, " ")}`}
      >
        {copiedValue === id ? (
          <Check className="h-3 w-3" data-testid={`${testIdPrefix}-copied`} />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

function ScopeCell({
  scope,
  scopeName,
  showTechnical,
  copiedValue,
  onCopy,
}: {
  scope: AiDoctorLedgerEntry["grow"];
  scopeName: "grow" | "tent" | "plant";
  showTechnical: boolean;
  copiedValue: string | null;
  onCopy: (value: string) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid={`ai-doctor-session-integrity-ledger-${scopeName}-label`}
      data-archived={scope.archivedOrUnavailable}
      data-plantless={scopeName === "plant" ? scope.id === null : undefined}
    >
      <span className="text-xs">{scope.label}</span>
      {scope.id ? (
        <IdChip
          id={scope.id}
          showTechnical={showTechnical}
          copiedValue={copiedValue}
          onCopy={onCopy}
          testIdPrefix={`ai-doctor-session-integrity-ledger-${scopeName}-id`}
        />
      ) : null}
    </div>
  );
}

function EvidenceBadge({ evidence }: { evidence: AiDoctorLedgerEntry["evidence"] }) {
  return (
    <div className="space-y-0.5" data-testid="ai-doctor-session-integrity-ledger-evidence">
      <Badge
        variant="outline"
        className={`text-[11px] ${EVIDENCE_TONE_BADGE_CLASS[evidence.tone]}`}
        data-testid="ai-doctor-session-integrity-ledger-evidence-badge"
        data-evidence-tone={evidence.tone}
      >
        {evidence.label}
      </Badge>
      {evidence.reasonLabel ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="ai-doctor-session-integrity-ledger-evidence-reason"
        >
          {evidence.reasonLabel}
        </p>
      ) : null}
      {evidence.evaluatedAtDisplay ? (
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="ai-doctor-session-integrity-ledger-evidence-evaluated-at"
        >
          Evaluated {evidence.evaluatedAtDisplay}
        </p>
      ) : null}
    </div>
  );
}

export default function AiDoctorSessionIntegrityLedger() {
  const [page, setPage] = useState(0);
  const [showTechnical, setShowTechnical] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useAiDoctorSessionLedger(page);
  const entries = data?.entries ?? [];
  const hasMore = !!data?.hasMore;

  const handleCopy = (value: string) => {
    copyShareLink(value)
      .then(() => {
        setCopiedValue(value);
        window.setTimeout(() => {
          setCopiedValue((v) => (v === value ? null : v));
        }, 1500);
      })
      .catch(() => {
        // Non-fatal: a copy failure never blocks reading the ledger.
      });
  };

  return (
    <div className="space-y-4" data-testid="ai-doctor-session-integrity-ledger">
      <div className="flex items-start justify-between gap-2">
        <h2
          className="text-base font-semibold flex items-center gap-2"
          data-testid="ai-doctor-session-integrity-ledger-heading"
        >
          <ShieldCheck className="h-4 w-4" /> Session integrity ledger
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTechnical((v) => !v)}
          data-testid="ai-doctor-session-integrity-ledger-toggle-technical"
          aria-pressed={showTechnical}
        >
          {showTechnical ? (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Hide technical IDs
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5" /> Show technical IDs
            </>
          )}
        </Button>
      </div>

      <p
        className="text-[11px] text-muted-foreground"
        data-testid="ai-doctor-session-integrity-ledger-privacy-caption"
      >
        Your private saved-session ledger. It confirms stored snapshots; it does not run a new
        diagnosis, show live telemetry, or create actions.
      </p>

      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="space-y-2"
          data-testid="ai-doctor-session-integrity-ledger-loading"
        >
          <p className="text-muted-foreground text-sm">Loading session integrity ledger…</p>
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2"
          data-testid="ai-doctor-session-integrity-ledger-error"
        >
          <p className="font-medium text-foreground flex items-center gap-1">
            <AlertCircle className="h-4 w-4" /> Unable to load the session integrity ledger.
          </p>
          <p className="text-xs text-muted-foreground">
            Check your connection and try again. No changes were made.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetch();
            }}
            disabled={isRefetching}
            data-testid="ai-doctor-session-integrity-ledger-error-retry"
            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {isRefetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : entries.length === 0 && page === 0 ? (
        <div
          className="rounded-lg border bg-muted/20 p-4 text-sm space-y-1"
          data-testid="ai-doctor-session-integrity-ledger-empty"
        >
          <p className="font-medium text-foreground">No saved sessions yet.</p>
          <p className="text-xs text-muted-foreground">
            Persisted AI Doctor snapshots will appear here once you save one.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop: compact table */}
          <div className="hidden md:block" data-testid="ai-doctor-session-integrity-ledger-table">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Saved</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Grow</TableHead>
                    <TableHead>Tent</TableHead>
                    <TableHead>Plant</TableHead>
                    <TableHead>Frozen sensor evidence</TableHead>
                    <TableHead className="text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} data-testid="ai-doctor-session-integrity-ledger-row">
                      <TableCell
                        className="text-xs align-top"
                        data-testid="ai-doctor-session-integrity-ledger-timestamp"
                        data-valid={entry.hasValidTimestamp}
                      >
                        {entry.timestampDisplay}
                      </TableCell>
                      <TableCell className="align-top">
                        <IdChip
                          id={entry.id}
                          showTechnical={showTechnical}
                          copiedValue={copiedValue}
                          onCopy={handleCopy}
                          testIdPrefix="ai-doctor-session-integrity-ledger-session-id"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <ScopeCell
                          scope={entry.grow}
                          scopeName="grow"
                          showTechnical={showTechnical}
                          copiedValue={copiedValue}
                          onCopy={handleCopy}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <ScopeCell
                          scope={entry.tent}
                          scopeName="tent"
                          showTechnical={showTechnical}
                          copiedValue={copiedValue}
                          onCopy={handleCopy}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <ScopeCell
                          scope={entry.plant}
                          scopeName="plant"
                          showTechnical={showTechnical}
                          copiedValue={copiedValue}
                          onCopy={handleCopy}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <EvidenceBadge evidence={entry.evidence} />
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Link
                          to={`/doctor/sessions/${entry.id}`}
                          className="text-primary underline text-xs rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          data-testid="ai-doctor-session-integrity-ledger-view-link"
                        >
                          View session
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Mobile: cards */}
          <ul
            className="md:hidden space-y-2"
            data-testid="ai-doctor-session-integrity-ledger-cards"
          >
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border bg-card/40 p-3 text-sm space-y-1.5"
                data-testid="ai-doctor-session-integrity-ledger-card"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span
                    className="text-xs text-muted-foreground"
                    data-testid="ai-doctor-session-integrity-ledger-card-timestamp"
                    data-valid={entry.hasValidTimestamp}
                  >
                    {entry.timestampDisplay}
                  </span>
                  <IdChip
                    id={entry.id}
                    showTechnical={showTechnical}
                    copiedValue={copiedValue}
                    onCopy={handleCopy}
                    testIdPrefix="ai-doctor-session-integrity-ledger-card-session-id"
                  />
                </div>
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1"
                  data-testid="ai-doctor-session-integrity-ledger-card-scope"
                >
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Grow:</span>
                    <ScopeCell
                      scope={entry.grow}
                      scopeName="grow"
                      showTechnical={showTechnical}
                      copiedValue={copiedValue}
                      onCopy={handleCopy}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Tent:</span>
                    <ScopeCell
                      scope={entry.tent}
                      scopeName="tent"
                      showTechnical={showTechnical}
                      copiedValue={copiedValue}
                      onCopy={handleCopy}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Plant:</span>
                    <ScopeCell
                      scope={entry.plant}
                      scopeName="plant"
                      showTechnical={showTechnical}
                      copiedValue={copiedValue}
                      onCopy={handleCopy}
                    />
                  </div>
                </div>
                <EvidenceBadge evidence={entry.evidence} />
                <Link
                  to={`/doctor/sessions/${entry.id}`}
                  className="text-primary underline text-xs rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="ai-doctor-session-integrity-ledger-card-view-link"
                >
                  View session
                </Link>
              </li>
            ))}
          </ul>

          <div
            className="flex items-center justify-between pt-2"
            data-testid="ai-doctor-session-integrity-ledger-pager"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              data-testid="ai-doctor-session-integrity-ledger-prev"
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              data-testid="ai-doctor-session-integrity-ledger-next"
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
