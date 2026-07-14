import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Breeding programs</h1>
          <p className="text-sm text-muted-foreground">
            Operator-authored SOP runs. Diary-linked evidence per step.
          </p>
        </div>
        <Button asChild>
          <Link to="/breeding/new">New program</Link>
        </Button>
      </header>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {programs === null && !error && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">Loading…</CardContent>
        </Card>
      )}

      {programs && programs.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No breeding programs yet. Create one to start tracking an SOP run.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {(programs ?? []).map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <Link to={`/breeding/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <Badge variant="outline">{p.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>
                Cross: {p.p1_maternal_label ?? "—"} × {p.p1_paternal_label ?? "—"}
                {p.cross_pair_label ? ` (${p.cross_pair_label})` : ""}
              </div>
              <div>SOP {p.sop_version} · starting at {p.starting_generation}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
