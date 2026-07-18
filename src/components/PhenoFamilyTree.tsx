/**
 * PhenoFamilyTree — presenter for a hunt's breeding pedigree (the "family tree").
 *
 * Renders the pure phenoPedigreeViewModel: mothers (keepers) with their reversal
 * / clone / stability read-outs, and the crosses between them. Theme-aware,
 * accessible, and — per the build ethos — HONEST: provenance flags render as
 * visible amber markers, never hidden. Presentational only: no I/O, no writes,
 * no ranking. A "Simple / Detailed" toggle serves beginners and advanced growers
 * on the same surface.
 */
import { useState } from "react";
import { GitBranch, Sprout, AlertTriangle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PhenoPedigree, ProvenanceFlag } from "@/lib/phenoPedigreeViewModel";
import type { CloneTreeRow } from "@/lib/phenoCloneTreeViewModel";

export interface PhenoFamilyTreeProps {
  readonly pedigree: PhenoPedigree;
  /** Optional clone lineage per keeper (from buildCloneTreeRows), shown in Detailed. */
  readonly cloneRowsByKeeperId?: Readonly<Record<string, readonly CloneTreeRow[]>>;
  readonly className?: string;
}

const FLAG_CHIP =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300";

function FlagList({ flags }: { flags: readonly ProvenanceFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1" data-testid="pheno-family-flags">
      {flags.map((f) => (
        <li key={f.code} className={FLAG_CHIP} data-testid={`pheno-family-flag-${f.code}`}>
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {f.message}
        </li>
      ))}
    </ul>
  );
}

export default function PhenoFamilyTree({
  pedigree,
  cloneRowsByKeeperId,
  className,
}: PhenoFamilyTreeProps) {
  const [detailed, setDetailed] = useState(false);
  const { keepers, crosses, flags } = pedigree;
  const empty = keepers.length === 0 && crosses.length === 0;

  return (
    <section
      data-testid="pheno-family-tree"
      aria-label="Family tree"
      className={cn("space-y-4 rounded-lg border border-border bg-card p-4", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <GitBranch className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Family tree
          </h3>
          <p className="text-xs text-muted-foreground">
            Mothers, clones, and the crosses between them.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDetailed((d) => !d)}
          aria-pressed={detailed}
          data-testid="pheno-family-density-toggle"
        >
          {detailed ? "Simple" : "Detailed"}
        </Button>
      </header>

      {/* Honesty summary — surfaced, never hidden. */}
      {flags.length > 0 && (
        <p
          data-testid="pheno-family-honesty-summary"
          className="flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          {flags.length} lineage {flags.length === 1 ? "note" : "notes"} to verify — the tree
          only draws what it can back up.
        </p>
      )}

      {empty ? (
        <p data-testid="pheno-family-empty" className="text-xs text-muted-foreground">
          No keepers or crosses recorded yet. Name a keeper and record a cross to grow the tree.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Mothers / keepers */}
          {keepers.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Keepers
              </h4>
              <ul className="grid gap-2 sm:grid-cols-2" data-testid="pheno-family-keepers">
                {keepers.map((k) => (
                  <li
                    key={k.id}
                    data-testid={`pheno-family-keeper-${k.id}`}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <Sprout className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      <span className="truncate text-sm font-medium text-foreground">{k.name}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {k.sourceCandidateLabel ?? "origin unrecorded"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {k.reversed && (
                        <Badge
                          variant="outline"
                          className="border-violet-500/40 bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-300"
                          data-testid={`pheno-family-keeper-reversed-${k.id}`}
                        >
                          Reversed{k.reversalMethods.length ? ` · ${k.reversalMethods.join(", ")}` : ""}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {k.cloneCount} clone{k.cloneCount === 1 ? "" : "s"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          k.stabilityRunCount > 0
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "text-muted-foreground",
                        )}
                      >
                        {k.stabilityRunCount > 0
                          ? `held ${k.stabilityRunCount} run${k.stabilityRunCount === 1 ? "" : "s"}`
                          : "no stability runs yet"}
                      </Badge>
                    </div>
                    <FlagList flags={k.flags} />
                    {detailed && cloneRowsByKeeperId?.[k.id]?.length ? (
                      <ul
                        className="mt-2 space-y-0.5 border-t border-border/50 pt-1.5"
                        data-testid={`pheno-family-clones-${k.id}`}
                      >
                        {cloneRowsByKeeperId[k.id]!.map((c) => (
                          <li
                            key={c.id}
                            className="text-[11px] text-muted-foreground"
                            style={{ paddingLeft: `${c.depth * 12}px` }}
                          >
                            {c.depth > 0 ? "└ " : ""}
                            {c.label}
                            {c.takenAt ? <span className="opacity-70"> · {c.takenAt}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Crosses */}
          {crosses.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Crosses
              </h4>
              <ul className="space-y-2" data-testid="pheno-family-crosses">
                {crosses.map((c) => (
                  <li
                    key={c.id}
                    data-testid={`pheno-family-cross-${c.id}`}
                    className="rounded-md border border-border bg-secondary/20 p-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{c.name}</span>
                      <Badge
                        variant="outline"
                        className="border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-700 dark:text-indigo-300"
                        data-testid={`pheno-family-cross-badge-${c.id}`}
                      >
                        {c.badge}
                      </Badge>
                      {c.crossedAt && detailed && (
                        <span className="text-[10px] text-muted-foreground">{c.crossedAt}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                      <span className="text-foreground/80">{c.femaleName ?? "unknown seed parent"}</span>
                      <span aria-hidden className="text-muted-foreground/60">(♀)</span>
                      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
                      <span>{c.donorLabel}</span>
                      <span aria-hidden className="text-muted-foreground/60">(♂)</span>
                      {typeof c.generation === "number" && (
                        <span className="opacity-80">· gen {c.generation}</span>
                      )}
                    </div>
                    <FlagList flags={c.flags} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        A pedigree is only as good as its records — lineage the app can't verify is flagged, not
        drawn as fact.
      </p>
    </section>
  );
}
