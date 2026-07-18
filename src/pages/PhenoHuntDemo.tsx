/**
 * PhenoHuntDemo — internal read-only walkthrough of a FULL pheno hunt, from the
 * pack through triage → keepers → clones → crosses → family tree, using labeled
 * demo fixture data (phenoHuntDemoFixture).
 *
 * Hard constraints (matches the other /internal demo routes):
 *  - Read-only. No fetch, no Supabase, no AI, no writes, no Action Queue.
 *  - Fixture data only, clearly labeled as demo.
 *  - Honors the build ethos: the Loud score is presented as a fast SHORTLIST,
 *    never the verdict; the keeper decision (earned by cure + stability) is.
 */
import { useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import PhenoFamilyTree from "@/components/PhenoFamilyTree";
import { cn } from "@/lib/utils";
import { buildPhenoPedigree } from "@/lib/phenoPedigreeViewModel";
import { buildCloneTreeRows } from "@/lib/phenoCloneTreeViewModel";
import {
  DEMO_PHENO_HUNT,
  DEMO_CANDIDATES,
  DEMO_KEEPERS,
  DEMO_CROSSES,
  DEMO_CLONES,
  type DemoVerdict,
} from "@/lib/demo/phenoHuntDemoFixture";

const VERDICT_TONE: Record<DemoVerdict, string> = {
  keep: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  maybe: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cull: "border-border bg-secondary text-muted-foreground",
};

function tagTone(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "herm") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (t === "foxtail" || t === "mold" || t === "pests")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-secondary text-muted-foreground";
}

export default function PhenoHuntDemo() {
  const pedigree = useMemo(() => buildPhenoPedigree(DEMO_KEEPERS, DEMO_CROSSES), []);
  const cloneRowsByKeeperId = useMemo(
    () => ({ [DEMO_PHENO_HUNT.keeperIds.gasRuntz]: buildCloneTreeRows(DEMO_CLONES) }),
    [],
  );
  const candidates = useMemo(
    () => [...DEMO_CANDIDATES].sort((a, b) => a.candidateNumber - b.candidateNumber),
    [],
  );

  return (
    <div data-testid="pheno-hunt-demo-page" className="container mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title="Pheno Hunt (Demo)"
        description="Read-only walkthrough of a full hunt using labeled demo data. No live data, no AI, no save, no share."
      />

      <p
        data-testid="pheno-hunt-demo-banner"
        className="mb-4 rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
      >
        Demo — {DEMO_PHENO_HUNT.meta.name} · {DEMO_PHENO_HUNT.meta.packLabel} ·{" "}
        {DEMO_PHENO_HUNT.meta.packSize} seeds. Labeled fixture data only.
      </p>

      {/* The pack — walk order, verdict-first, score as a shortlist. */}
      <section aria-label="The pack" className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">The pack</h2>
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="pheno-hunt-demo-candidates">
          {candidates.map((c) => (
            <li
              key={c.candidateNumber}
              data-testid={`pheno-hunt-demo-candidate-${c.candidateNumber}`}
              className="rounded-md border border-border bg-card p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  #{c.candidateNumber} · {c.name}
                </span>
                <Badge variant="outline" className={cn("text-[10px] uppercase", VERDICT_TONE[c.verdict])}>
                  {c.verdict}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {c.aroma.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300"
                  >
                    {a}
                  </span>
                ))}
                {c.tags.map((t) => (
                  <span key={t} className={cn("rounded-full px-1.5 py-0.5 text-[10px]", tagTone(t))}>
                    {t}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Loud score {c.loud.nose * 3 + c.loud.resin * 2.5 + c.loud.structure * 1.5 +
                  c.loud.yield * 1.5 + c.loud.breeding * 1.5}
                <span className="opacity-70"> · shortlist</span> · nose {c.loud.nose}/10 ·{" "}
                {c.rounds.length} round{c.rounds.length === 1 ? "" : "s"}
                {c.rounds.includes("post_cure") && (
                  <span className="text-emerald-600 dark:text-emerald-400"> · cured</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{c.note}</p>
            </li>
          ))}
        </ul>
        <p
          data-testid="pheno-hunt-demo-caveat"
          className="mt-2 text-[11px] text-muted-foreground"
        >
          The Loud score is a fast shortlist to sort the pack — not the verdict. The keeper
          decision, earned through the cure and re-grow stability, is what counts.
        </p>
      </section>

      {/* Keepers, clones, and the family tree. */}
      <section aria-label="Keepers and family tree">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Keepers &amp; family tree</h2>
        <PhenoFamilyTree pedigree={pedigree} cloneRowsByKeeperId={cloneRowsByKeeperId} />
      </section>
    </div>
  );
}
