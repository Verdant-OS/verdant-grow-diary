/**
 * Screening + quarantine history for a subject. Every screening claim shows its
 * target, result, source, and date; the rolled-up posture is honest (never
 * clean). Quarantine episodes show their lifecycle without ever implying a
 * cleared state from incomplete evidence.
 */
import { useParams, Link } from "react-router-dom";
import { ShieldAlert, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useSubjectScreening, useSubjectQuarantine } from "@/hooks/useGeneticsTrace";
import { EvidenceStatePill } from "@/components/genetics/EvidenceStatePill";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import { computeEvidence, scopedNegativeCopy } from "@/lib/genetics/screeningEvidenceRules";
import { geneticsTracePath } from "@/lib/routes";
import { traceNodeKindLabel } from "@/lib/genetics/traceabilityTypes";

const RESULT_TONE: Record<string, string> = {
  positive: "text-red-300",
  negative: "text-emerald-300",
  inconclusive: "text-amber-300",
  not_tested: "text-white/45",
};

export default function ScreeningQuarantineHistory() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = params.kind ?? "";
  const id = params.id ?? "";
  const screening = useSubjectScreening(kind, id);
  const quarantine = useSubjectQuarantine(kind, id);

  const rows = screening.data ?? [];
  const evidence = computeEvidence(
    rows.map((r) => ({
      id: r.id,
      target: r.target,
      result: r.result,
      collectedDate: r.collectedDate,
      recordedAt: r.recordedAt,
      supersedesId: r.supersedesId,
    })),
  );

  return (
    <div className="container max-w-3xl py-6 space-y-6 min-w-0">
      <PageHeader
        title="Screening & quarantine"
        description={`Pathogen evidence and quarantine history for this ${traceNodeKindLabel(kind).toLowerCase()}.`}
        icon={<ShieldAlert className="h-5 w-5" />}
        actions={
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link to={geneticsTracePath(kind as never, id)}>View trace</Link>
          </Button>
        }
      />

      <section className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-white/80">Current posture</h2>
          <EvidenceStatePill state={evidence.state} openQuarantine={quarantine.data?.some((q) => q.status === "open") ?? false} />
        </div>

        {screening.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading evidence…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No screening recorded. This subject is <strong>not tested</strong> — not clean.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
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
        {quarantine.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : (quarantine.data ?? []).length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-4 text-center text-sm text-muted-foreground">
            No quarantine episodes.
          </div>
        ) : (
          <ul className="space-y-2">
            {(quarantine.data ?? []).map((q) => (
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
