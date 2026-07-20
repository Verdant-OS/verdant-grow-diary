import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpRight, Dna, Loader2, Plus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listBreedingPrograms,
  type BreedingProgramSummary,
} from "@/lib/breeding/breedingProgramApi";

export default function BreedingProgramsIndex() {
  const [programs, setPrograms] = useState<BreedingProgramSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listBreedingPrograms()
      .then((p) => alive && setPrograms(p))
      .catch((e) => alive && setError(e?.message ?? "Failed to load."));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto min-w-0 max-w-5xl" data-testid="breeding-programs-index">
      <PageHeader
        title="Breeding programs"
        eyebrow="Genetics workflow"
        description="Document each planned cross, verify its required criteria, and keep linked diary evidence with every step."
        icon={<Dna className="size-5" />}
        actions={
          <Button
            asChild
            size="sm"
            className="w-full gradient-leaf text-primary-foreground sm:w-auto"
          >
            <Link to="/breeding/new">
              <Plus data-icon="inline-start" />
              New program
            </Link>
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive" data-testid="breeding-programs-error">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Unable to load breeding programs</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {programs === null && !error && (
        <div
          className="flex items-center justify-center rounded-3xl border border-border/60 bg-card/50 py-16 text-muted-foreground"
          data-testid="breeding-programs-loading"
          role="status"
          aria-label="Loading breeding programs"
        >
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      )}

      {programs && programs.length === 0 && (
        <section
          className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-5 py-10 text-center shadow-card sm:px-8"
          data-testid="breeding-programs-empty"
          aria-labelledby="breeding-programs-empty-title"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Dna className="size-6" aria-hidden="true" />
          </div>
          <h2 id="breeding-programs-empty-title" className="font-display text-lg font-semibold">
            No breeding programs yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            Start a documented program when you are ready to track an SOP run and its supporting
            diary evidence.
          </p>
          <Button asChild className="mt-5 gradient-leaf text-primary-foreground">
            <Link to="/breeding/new">
              Create a breeding program
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </section>
      )}

      <ul className="grid gap-3 sm:grid-cols-2" data-testid="breeding-programs-list">
        {(programs ?? []).map((p) => (
          <li key={p.id} className="min-w-0">
            <Card className="group h-full overflow-hidden rounded-3xl border-border/60 bg-card/65 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-elevated">
              <Link
                to={`/breeding/${p.id}`}
                className="block h-full p-5 transition-colors hover:bg-secondary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                data-testid={`breeding-program-link-${p.id}`}
              >
                <CardHeader className="min-w-0 space-y-3 p-0 pb-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 break-words font-display text-lg">
                      {p.name}
                    </CardTitle>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {p.status}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {p.p1_maternal_label ?? "Unassigned maternal"} ×{" "}
                    {p.p1_paternal_label ?? "Unassigned paternal"}
                    {p.cross_pair_label ? ` · ${p.cross_pair_label}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-x-2 gap-y-1 p-0 text-xs text-muted-foreground">
                  <span>SOP {p.sop_version}</span>
                  <span aria-hidden="true">•</span>
                  <span>Starting at {p.starting_generation}</span>
                  <ArrowUpRight
                    className="ml-auto size-4 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Open {p.name}</span>
                </CardContent>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
