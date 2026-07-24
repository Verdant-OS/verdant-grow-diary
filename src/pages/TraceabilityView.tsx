/**
 * Traceability view — backward/forward lineage for any accession, batch, plant,
 * keeper, clone, or cross. Reads the subject from the route, resolves the trace
 * server-side, and renders it as a semantic, keyboard-operable tree.
 */
import { useParams } from "react-router-dom";
import { GitBranch, Loader2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useGeneticsTrace, type TraceDirection } from "@/hooks/useGeneticsTrace";
import { TraceabilityTree } from "@/components/genetics/TraceabilityTree";
import { traceNodeKindLabel } from "@/lib/genetics/traceabilityTypes";
import { useState } from "react";

const DIRECTIONS: ReadonlyArray<{ value: TraceDirection; label: string }> = [
  { value: "both", label: "Both" },
  { value: "ancestors", label: "Ancestors" },
  { value: "descendants", label: "Descendants" },
];

export default function TraceabilityView() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = params.kind ?? "";
  const id = params.id ?? "";
  const [direction, setDirection] = useState<TraceDirection>("both");
  const { view, isLoading, isError, refetch } = useGeneticsTrace(kind, id, direction);

  return (
    <div className="container max-w-4xl py-6 space-y-5 min-w-0">
      <PageHeader
        title="Lineage trace"
        description={`Backward and forward provenance for this ${traceNodeKindLabel(kind).toLowerCase()}.`}
        icon={<GitBranch className="h-5 w-5" />}
      />

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Trace direction"
      >
        {DIRECTIONS.map((d) => (
          <Button
            key={d.value}
            type="button"
            size="sm"
            variant={direction === d.value ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={direction === d.value}
            onClick={() => setDirection(d.value)}
          >
            {d.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Resolving lineage…
        </div>
      ) : isError || (!view.ok && view.reason) ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground space-y-3">
          <p className="break-words">
            {view.reason === "not_found"
              ? "This subject could not be found."
              : "The lineage could not be resolved."}
          </p>
          <Button type="button" variant="outline" className="min-h-11" onClick={refetch}>
            Try again
          </Button>
        </div>
      ) : (
        <TraceabilityTree view={view} />
      )}
    </div>
  );
}
