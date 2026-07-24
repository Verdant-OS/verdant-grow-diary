/**
 * Genetics Library — the mobile-first home for accessions and propagation
 * batches. Presenter-only: all data comes from owner-scoped hooks and all
 * shaping from pure helpers. Explicit unknown/unassigned/archived states are
 * always visible; nothing is inferred.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Dna, Loader2, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccessions, useBatches } from "@/hooks/useGeneticsLibrary";
import { AccessionForm } from "@/components/genetics/AccessionForm";
import { UnknownStateChip } from "@/components/genetics/UnknownStateChip";
import {
  accessionSourceLabel,
  batchStatusLabel,
  knownStateLabel,
  propagationMethodLabel,
} from "@/lib/genetics/traceabilityTypes";
import {
  geneticsAccessionDetailPath,
  geneticsBatchDetailPath,
  geneticsTracePath,
} from "@/lib/routes";
import type { AccessionDto, BatchDto } from "@/lib/genetics/traceabilityApi";

function AccessionCard({ a }: { a: AccessionDto }) {
  const title = a.cultivarName || a.lineName || "Unnamed accession";
  return (
    <div className="glass rounded-2xl overflow-hidden border border-border p-4 flex flex-col gap-2 min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Link to={geneticsAccessionDetailPath(a.id)} className="min-w-0">
          <span className="block truncate text-sm font-medium text-white/90" title={title}>
            {title}
          </span>
        </Link>
        {a.archivedAt ? <UnknownStateChip kind="archived" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-white/60">
          {accessionSourceLabel(a.sourceKind)}
        </span>
        {a.knownState !== "known" ? (
          <UnknownStateChip
            kind={a.knownState === "not_applicable" ? "not_applicable" : "unknown"}
            label={knownStateLabel(a.knownState)}
          />
        ) : null}
        {a.sourceParty ? (
          <span className="truncate text-white/40">{a.sourceParty}</span>
        ) : (
          <UnknownStateChip kind="unknown" label="Breeder unknown" />
        )}
      </div>
      <div className="mt-1">
        <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
          <Link to={geneticsTracePath("accession", a.id)}>View trace</Link>
        </Button>
      </div>
    </div>
  );
}

function BatchCard({ b }: { b: BatchDto }) {
  return (
    <div className="glass rounded-2xl overflow-hidden border border-border p-4 flex flex-col gap-2 min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Link to={geneticsBatchDetailPath(b.id)} className="min-w-0">
          <span className="block truncate text-sm font-medium text-white/90" title={b.name || b.batchCode}>
            {b.name || b.batchCode}
          </span>
        </Link>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/60">
          {batchStatusLabel(b.status)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
        <span className="truncate">{propagationMethodLabel(b.propagationMethod)}</span>
        {b.originUnknown ? <UnknownStateChip kind="unknown" label="Origin unknown" /> : null}
        {b.countsUnknown || b.initialQuantity === null ? (
          <UnknownStateChip kind="unknown" label="Counts unknown" />
        ) : (
          <span>
            {b.viableQuantity ?? "—"}/{b.initialQuantity} viable
          </span>
        )}
      </div>
      <div className="mt-1">
        <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
          <Link to={geneticsTracePath("batch", b.id)}>View trace</Link>
        </Button>
      </div>
    </div>
  );
}

export default function GeneticsLibrary() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const accessions = useAccessions();
  const batches = useBatches();

  return (
    <div className="container max-w-5xl py-6 space-y-6 min-w-0">
      <PageHeader
        title="Genetics Library"
        description="Accessions, propagation batches, and the traceable line between your source material and your plants."
        icon={<Dna className="h-5 w-5" />}
        actions={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="min-h-11">
                <Plus className="h-4 w-4 mr-1.5" aria-hidden /> New accession
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New genetics accession</DialogTitle>
              </DialogHeader>
              <AccessionForm onSaved={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs defaultValue="accessions" className="min-w-0">
        <TabsList>
          <TabsTrigger value="accessions">Accessions</TabsTrigger>
          <TabsTrigger value="batches">Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="accessions" className="mt-4 min-w-0">
          {accessions.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading accessions…
            </div>
          ) : (accessions.data ?? []).length === 0 ? (
            <div
              data-testid="accessions-empty"
              className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
            >
              No accessions yet. Add your first source of genetics to start tracing lineage.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(accessions.data ?? []).map((a) => (
                <AccessionCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="batches" className="mt-4 min-w-0">
          {batches.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading batches…
            </div>
          ) : (batches.data ?? []).length === 0 ? (
            <div
              data-testid="batches-empty"
              className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
            >
              No propagation batches yet.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(batches.data ?? []).map((b) => (
                <BatchCard key={b.id} b={b} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
