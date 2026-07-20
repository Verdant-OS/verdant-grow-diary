/**
 * Screening + quarantine history for a subject.
 *
 * EVIDENCE TRUTH: a failed query is UNAVAILABLE evidence, never ABSENT evidence.
 * Each query renders an explicit error state (with a calm retry) BEFORE any empty
 * state, and the current posture is only computed/shown when the screening query
 * actually succeeded — a failed screening read never produces a "not tested" (or
 * any) posture. The route `kind` is validated against the supported subject-kind
 * union and fails closed for anything else.
 */
import { useParams, Link } from "react-router-dom";
import { ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useSubjectScreening, useSubjectQuarantine } from "@/hooks/useGeneticsTrace";
import { EvidenceStatePill } from "@/components/genetics/EvidenceStatePill";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import { computeEvidence, scopedNegativeCopy } from "@/lib/genetics/screeningEvidenceRules";
import { geneticsTracePath } from "@/lib/routes";
import { isSubjectType, traceNodeKindLabel, type SubjectType } from "@/lib/genetics/traceabilityTypes";

const RESULT_TONE: Record<string, string> = {
  positive: "text-red-300",
  negative: "text-emerald-300",
  inconclusive: "text-amber-300",
  not_tested: "text-white/45",
};

function UnavailableState({ label, onRetry, testId }: { label: string; onRetry: () => void; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-200 space-y-3"
    >
      <p className="inline-flex items-center justify-center gap-2 break-words">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {label}
      </p>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export default function ScreeningQuarantineHistory() {
  const params = useParams<{ kind: string; id: string }>();
  const rawKind = params.kind ?? "";
  const id = params.id ?? "";

  // Fail closed: only accession/batch/plant are valid screening/quarantine
  // subjects. An unknown kind never queries and never renders an empty state.
  const kind: SubjectType | null = isSubjectType(rawKind) ? rawKind : null;

  const screening = useSubjectScreening(kind, id);
  const quarantine = useSubjectQuarantine(kind, id);

  // Posture is trustworthy ONLY when the screening read succeeded. A failed read
  // must not round down to "not tested" (or anything else).
  const evidence = screening.isSuccess
    ? computeEvidence(
        (screening.data ?? []).map((r) => ({
          id: r.id,
          target: r.target,
          result: r.result,
          collectedDate: r.collectedDate,
          recordedAt: r.recordedAt,
          supersedesId: r.supersedesId,
        })),
      )
    : null;

  if (!kind) {
    return (
      <div className="container max-w-3xl py-6 space-y-6 min-w-0">
        <PageHeader
          title="Screening & quarantine"
          description="Pathogen evidence and quarantine history."
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <div
          data-testid="invalid-kind"
          className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
        >
          Unsupported subject type. Screening and quarantine history are only available for an
          accession, a propagation batch, or a plant.
        </div>
      </div>
    );
  }

  const quarantineRows = quarantine.data ?? [];

  return (
    <div className="container max-w-3xl py-6 space-y-6 min-w-0">
      <PageHeader
        title="Screening & quarantine"
        description={`Pathogen evidence and quarantine history for this ${traceNodeKindLabel(kind).toLowerCase()}.`}
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link to={geneticsTracePath(kind, id)}>View trace</Link>
          </Button>
        }
      />

      <section className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-white/80">Current posture</h2>
          {screening.isError ? (
            <UnknownStateChip kind="unknown" label="Evidence unavailable" />
          ) : screening.isLoading ? (
            <span className="text-xs text-white/40">loading…</span>
          ) : evidence ? (
            <>
              <EvidenceStatePill
                state={evidence.state}
                // Only assert quarantine status when its read succeeded.
                openQuarantine={quarantine.isSuccess && quarantineRows.some((q) => q.status === "open")}
              />
              {quarantine.isError ? <UnknownStateChip kind="unknown" label="Quarantine status unavailable" /> : null}
            </>
          ) : null}
        </div>

        {screening.isError ? (
          <UnavailableState
            testId="screening-unavailable"
            label="Screening evidence could not be loaded. This is not the same as “not tested.”"
            onRetry={() => screening.refetch()}
          />
        ) : screening.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading evidence…
          </div>
        ) : (screening.data ?? []).length === 0 ? (
          <div
            data-testid="screening-empty"
            className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          >
            No screening recorded. This subject is <strong>not tested</strong> — not clean.
          </div>
        ) : (
          <ul className="space-y-2">
            {(screening.data ?? []).map((r) => (
              <li
                key={r.id}
                data-testid="screening-row"
                className="rounded-md border border-white/[0.06] bg-[#0f0f0f] p-3 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium text-white/85">{r.target}</span>
                  <span className="text-xs text-white/40 break-words">
                    {r.result === "negative" && r.collectedDate
                      ? scopedNegativeCopy(r.target, r.collectedDate)
                      : `${r.result} · ${r.collectedDate ?? "date unrecorded"}`}
                    {r.laboratory ? ` · ${r.laboratory}` : ""}
                  </span>
                </div>
                <span className={`shrink-0 text-xs font-medium ${RESULT_TONE[r.result] ?? "text-white/50"}`}>
                  {r.result}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 min-w-0">
        <h2 className="text-sm font-semibold text-white/80">Quarantine episodes</h2>
        {quarantine.isError ? (
          <UnavailableState
            testId="quarantine-unavailable"
            label="Quarantine history could not be loaded. Its absence here does not mean there are none."
            onRetry={() => quarantine.refetch()}
          />
        ) : quarantine.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : quarantineRows.length === 0 ? (
          <div
            data-testid="quarantine-empty"
            className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground"
          >
            No quarantine episodes.
          </div>
        ) : (
          <ul className="space-y-2">
            {quarantineRows.map((q) => (
              <li
                key={q.id}
                data-testid="quarantine-row"
                className="rounded-md border border-white/[0.06] bg-[#0f0f0f] p-3 flex min-w-0 flex-wrap items-center justify-between gap-2"
              >
                <span className="min-w-0 truncate text-sm text-white/80">{q.target}</span>
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60">
                    {q.status}
                  </span>
                  {q.closureKind === "override" ? <UnknownStateChip kind="unknown" label="Override" /> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
