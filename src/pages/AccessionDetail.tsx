/**
 * Accession detail — the source-material record with explicit provenance and
 * non-destructive archive. Links onward to lineage trace and screening history.
 */
import { useParams, Link } from "react-router-dom";
import { Dna, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useAccessions } from "@/hooks/useGeneticsLibrary";
import { useArchiveAccession } from "@/hooks/useGeneticsMutations";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import { SaveStateBar } from "@/components/genetics/SaveStateBar";
import {
  accessionSourceLabel,
  knownStateLabel,
} from "@/lib/genetics/traceabilityTypes";
import { geneticsTracePath, geneticsHealthHistoryPath } from "@/lib/routes";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-white/40">{label}</dt>
      <dd className="min-w-0 truncate text-sm text-white/85">{value}</dd>
    </div>
  );
}

export default function AccessionDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const accessions = useAccessions(true);
  const { submit, retry, status, error } = useArchiveAccession();
  const a = (accessions.data ?? []).find((x) => x.id === id);

  if (accessions.isLoading) {
    return (
      <div className="container max-w-3xl py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      </div>
    );
  }

  if (!a) {
    return (
      <div className="container max-w-3xl py-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          This accession could not be found.
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6 min-w-0">
      <PageHeader
        title={a.cultivarName || a.lineName || "Accession"}
        description="Source material provenance."
        icon={<Dna className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to={geneticsTracePath("accession", a.id)}>Trace</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to={geneticsHealthHistoryPath("accession", a.id)}>Screening</Link>
            </Button>
          </div>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 rounded-lg border border-border bg-card p-4">
        <Field label="Source kind" value={accessionSourceLabel(a.sourceKind)} />
        <Field
          label="Provenance"
          value={a.knownState === "known" ? "Known" : <UnknownStateChip kind="unknown" label={knownStateLabel(a.knownState)} />}
        />
        <Field label="Breeder / source" value={a.sourceParty || <UnknownStateChip kind="unknown" label="Unknown" />} />
        <Field label="Generation" value={a.generation || <UnknownStateChip kind="unknown" label="Unrecorded" />} />
        <Field label="Acquired" value={a.acquisitionDate || <UnknownStateChip kind="unknown" label="Unrecorded" />} />
        <Field label="Status" value={a.archivedAt ? <UnknownStateChip kind="archived" /> : "Active"} />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={status === "pending"}
          onClick={() => submit({ accessionId: a.id, archived: !a.archivedAt })}
        >
          {a.archivedAt ? "Restore" : "Archive"} accession
        </Button>
        <SaveStateBar status={status} error={error} onRetry={retry} />
      </div>
    </div>
  );
}
