/**
 * PhenoFamilyTree — presenter for a hunt's breeding pedigree (the "family tree").
 *
 * Renders the pure phenoPedigreeViewModel as an actual TREE: each keeper (mother)
 * is a root, and the crosses she seeded branch off with drawn connector lines.
 * The pollen source is an inbound chip whose style encodes provenance — a SOLID
 * emerald link when it resolves to a real keeper in this hunt, a DASHED amber link
 * when the line can't be backed up.
 *
 * Theme-aware, accessible, and — per the build ethos — HONEST: provenance flags
 * render as visible amber markers and unverifiable lines are drawn broken, never
 * clean. Presentational only: no I/O, no writes, no ranking. A "Simple / Detailed"
 * toggle serves beginners and advanced growers on the same surface.
 */
import { useState, type ReactNode } from "react";
import { GitBranch, Sprout, AlertTriangle, Link2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  PhenoPedigree,
  PedigreeCrossNode,
  ProvenanceFlag,
} from "@/lib/phenoPedigreeViewModel";
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

type DonorState = "linked" | "honest" | "unverified";

/** How to draw the pollen source: a backed keeper, an honest null, or an unverifiable gap. */
function donorState(c: PedigreeCrossNode, keeperIds: ReadonlySet<string>): DonorState {
  const unverifiable = c.flags.some(
    (f) => f.code === "unknown_pollen_parent" || f.code === "parent_not_in_hunt",
  );
  if (unverifiable) return "unverified";
  if (c.maleKeeperId != null && keeperIds.has(c.maleKeeperId)) return "linked";
  return "honest"; // self / open pollination — a null male is honest here
}

const DONOR_CLASS: Record<DonorState, string> = {
  linked: "border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  honest: "border border-border bg-secondary text-muted-foreground",
  unverified:
    "border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function DonorChip({ c, state }: { c: PedigreeCrossNode; state: DonorState }) {
  const Icon = state === "linked" ? Link2 : state === "unverified" ? HelpCircle : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        DONOR_CLASS[state],
      )}
      data-testid={`pheno-family-donor-${c.id}`}
    >
      <span aria-hidden className="opacity-70">
        ×
      </span>
      {Icon && <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />}
      {c.donorLabel}
      <span aria-hidden className="opacity-60">
        ♂
      </span>
    </span>
  );
}

function CrossNode({
  c,
  keeperIds,
  detailed,
}: {
  c: PedigreeCrossNode;
  keeperIds: ReadonlySet<string>;
  detailed: boolean;
}) {
  const flagged = c.flags.length > 0;
  return (
    <div
      data-testid={`pheno-family-cross-${c.id}`}
      className={cn(
        "rounded-md border bg-card/70 px-2.5 py-1.5 transition-colors",
        flagged ? "border-amber-500/40" : "border-border",
      )}
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
        <DonorChip c={c} state={donorState(c, keeperIds)} />
        {typeof c.generation === "number" && (
          <span className="text-[10px] text-muted-foreground">· gen {c.generation}</span>
        )}
        {c.crossedAt && detailed && (
          <span className="text-[10px] text-muted-foreground/80">{c.crossedAt}</span>
        )}
      </div>
      <FlagList flags={c.flags} />
    </div>
  );
}

/** The connector rail + elbow that ties a branch to its mother. Colour by backing. */
function Branch({
  children,
  last,
  broken,
}: {
  children: ReactNode;
  last: boolean;
  broken: boolean;
}) {
  const line = broken ? "bg-amber-500/40" : "bg-emerald-500/30";
  return (
    <li className="relative pl-5">
      {/* vertical rail — stops at the elbow on the last child for a clean tree */}
      <span
        aria-hidden
        className={cn("absolute left-1.5 top-0 w-px", line, last ? "h-[1.15rem]" : "h-full")}
        style={broken ? { backgroundImage: "none" } : undefined}
      />
      {/* elbow into the node */}
      <span aria-hidden className={cn("absolute left-1.5 top-[1.15rem] h-px w-3", line)} />
      {children}
    </li>
  );
}

function MotherHeader({ node }: { node: PhenoPedigree["keepers"][number] }) {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Sprout className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <span className="truncate text-sm font-semibold text-foreground">{node.name}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        {node.sourceCandidateLabel ?? "origin unrecorded"}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {node.reversed && (
          <Badge
            variant="outline"
            className="border-violet-500/40 bg-violet-500/10 text-[10px] text-violet-700 dark:text-violet-300"
            data-testid={`pheno-family-keeper-reversed-${node.id}`}
          >
            Reversed{node.reversalMethods.length ? ` · ${node.reversalMethods.join(", ")}` : ""}
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          {node.cloneCount} clone{node.cloneCount === 1 ? "" : "s"}
        </Badge>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            node.stabilityRunCount > 0
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "text-muted-foreground",
          )}
        >
          {node.stabilityRunCount > 0
            ? `held ${node.stabilityRunCount} run${node.stabilityRunCount === 1 ? "" : "s"}`
            : "no stability runs yet"}
        </Badge>
      </div>
      <FlagList flags={node.flags} />
    </>
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

  // Root each cross under its (verified) mother; the rest are honestly "unrooted".
  const keeperIds = new Set(keepers.map((k) => k.id));
  const crossesByMother = new Map<string, PedigreeCrossNode[]>();
  const unrooted: PedigreeCrossNode[] = [];
  for (const c of crosses) {
    if (c.femaleKeeperId != null && keeperIds.has(c.femaleKeeperId)) {
      const list = crossesByMother.get(c.femaleKeeperId) ?? [];
      list.push(c);
      crossesByMother.set(c.femaleKeeperId, list);
    } else {
      unrooted.push(c);
    }
  }

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
            Each mother roots the crosses she seeded. Solid links are backed; dashed links can't be
            verified.
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
          {flags.length} lineage {flags.length === 1 ? "note" : "notes"} to verify — the tree only
          draws what it can back up.
        </p>
      )}

      {empty ? (
        <p data-testid="pheno-family-empty" className="text-xs text-muted-foreground">
          No keepers or crosses recorded yet. Name a keeper and record a cross to grow the tree.
        </p>
      ) : (
        <div className="space-y-3" data-testid="pheno-family-roots">
          {keepers.map((k) => {
            const children = crossesByMother.get(k.id) ?? [];
            return (
              <div
                key={k.id}
                className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3"
              >
                <div data-testid={`pheno-family-keeper-${k.id}`}>
                  <MotherHeader node={k} />
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
                </div>

                {children.length > 0 && (
                  <ul className="mt-2 space-y-1.5" data-testid={`pheno-family-branches-${k.id}`}>
                    {children.map((c, i) => (
                      <Branch
                        key={c.id}
                        last={i === children.length - 1}
                        broken={c.flags.length > 0}
                      >
                        <CrossNode c={c} keeperIds={keeperIds} detailed={detailed} />
                      </Branch>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {/* Crosses we can't root to a keeper in this hunt — shown, not hidden. */}
          {unrooted.length > 0 && (
            <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/[0.04] p-3">
              <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                Unrooted lineage
              </h4>
              <ul className="space-y-1.5" data-testid="pheno-family-unrooted">
                {unrooted.map((c) => (
                  <li key={c.id}>
                    <CrossNode c={c} keeperIds={keeperIds} detailed={detailed} />
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
