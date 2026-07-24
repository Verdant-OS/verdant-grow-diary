/**
 * Propagation batch detail — operational batch record plus multi-plant
 * assignment. Counts and origin stay explicit; unknown is shown as unknown.
 */
import { useParams, Link } from "react-router-dom";
import { Boxes, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useBatches } from "@/hooks/useGeneticsLibrary";
import { PlantAssignmentPanel } from "@/components/genetics/PlantAssignmentPanel";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import {
  batchStatusLabel,
  propagationMethodLabel,
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

export default function PropagationBatchDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const batches = useBatches();
  const b = (batches.data ?? []).find((x) => x.id === id);

  if (batches.isLoading) {
    return (
      <div className="container max-w-3xl py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      </div>
    );
  }

  if (!b) {
    return (
      <div className="container max-w-3xl py-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          This batch could not be found.
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6 min-w-0">
      <PageHeader
        title={b.name || b.batchCode}
        description="Operational propagation batch."
        icon={<Boxes className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to={geneticsTracePath("batch", b.id)}>Trace</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="min-h-11">
              <Link to={geneticsHealthHistoryPath("batch", b.id)}>Screening</Link>
            </Button>
          </div>
        }
      />

      <dl className="grid gap-4 sm:grid-cols-2 rounded-lg border border-border bg-card p-4">
        <Field label="Batch code" value={b.batchCode} />
        <Field label="Status" value={batchStatusLabel(b.status)} />
        <Field label="Method" value={propagationMethodLabel(b.propagationMethod)} />
        <Field
          label="Origin"
          value={b.originUnknown || (!b.motherPlantId && !b.sourceAccessionId)
            ? <UnknownStateChip kind="unknown" label="Unknown origin" />
            : b.motherPlantId ? "Mother tracked" : "From accession"}
        />
        <Field
          label="Counts"
          value={b.countsUnknown || b.initialQuantity === null
            ? <UnknownStateChip kind="unknown" label="Counts unknown" />
            : `${b.viableQuantity ?? "—"} / ${b.initialQuantity} viable`}
        />
      </dl>

      <section className="space-y-3 min-w-0">
        <h2 className="text-sm font-semibold text-white/80">Assign plants to this batch</h2>
        <PlantAssignmentPanel batchId={b.id} />
      </section>
    </div>
  );
}
