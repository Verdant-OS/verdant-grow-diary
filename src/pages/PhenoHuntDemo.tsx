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
 *    Colour and glow guide the eye toward what earned it — they never overrule
 *    the verdict badge or the caveat.
 */
import { useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import PhenoFamilyTree from "@/components/PhenoFamilyTree";
import PhenoContendersBoard from "@/components/PhenoContendersBoard";
import PhenoRadar from "@/components/PhenoRadar";
import {
  buildContenders,
  contenderScore,
  type ContenderInput,
} from "@/lib/phenoContendersViewModel";
import PhenoFightNight from "@/components/PhenoFightNight";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPhenoPedigree } from "@/lib/phenoPedigreeViewModel";
import { buildCloneTreeRows } from "@/lib/phenoCloneTreeViewModel";
import {
  DEMO_PHENO_HUNT,
  DEMO_CANDIDATES,
  DEMO_KEEPERS,
  DEMO_CROSSES,
  DEMO_CLONES,
  type DemoCandidate,
  type DemoVerdict,
} from "@/lib/demo/phenoHuntDemoFixture";

const VERDICT_TONE: Record<DemoVerdict, string> = {
  keep: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  maybe: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cull: "border-border bg-secondary text-muted-foreground",
};

/**
 * The card frame carries the triage at a glance: keepers glow, "maybe" stays
 * neutral, culls recede. The verdict badge remains the authority — this only
 * steers the eye.
 */
const CARD_TONE: Record<DemoVerdict, string> = {
  keep: "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 via-card to-card ring-1 ring-emerald-500/20 shadow-sm shadow-emerald-500/10",
  maybe: "border-border bg-card",
  cull: "border-border bg-card opacity-70",
};

/**
 * Terpene family palette — aroma should read like a flavor, not a grey tag.
 * Substring match so "diesel", "gas", "gassy" all land in the fuel family.
 */
function aromaTone(aroma: string): string {
  const a = aroma.toLowerCase();
  const fam = (keys: string[]) => keys.some((k) => a.includes(k));
  if (fam(["gas", "diesel", "fuel", "skunk", "chem", "petrol"]))
    return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (fam(["candy", "sweet", "sugar", "gelato"]))
    return "bg-pink-500/15 text-pink-700 dark:text-pink-300";
  if (fam(["berry", "fruit", "cherry", "grape", "tropic", "melon"]))
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  if (fam(["cake", "cookie", "cream", "vanilla", "dough", "nutty"]))
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (fam(["sherb", "citrus", "lemon", "lime", "orange", "zest"]))
    return "bg-lime-500/15 text-lime-700 dark:text-lime-300";
  if (fam(["earth", "pine", "wood", "hash", "musk", "pepper", "kush"]))
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (fam(["floral", "lavender", "rose", "spice", "mint"]))
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
}

function tagTone(tag: string): string {
  const t = tag.toLowerCase();
  if (t === "herm") return "bg-red-500/15 text-red-700 dark:text-red-300";
  if (t === "foxtail" || t === "mold" || t === "pests")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "bg-secondary text-muted-foreground";
}

function CandidateCard({ c }: { c: DemoCandidate }) {
  const score = contenderScore(c.loud);
  const cured = c.rounds.includes("post_cure");
  const isKeeper = c.verdict === "keep";
  return (
    <li
      data-testid={`pheno-hunt-demo-candidate-${c.candidateNumber}`}
      className={cn("rounded-xl border p-3 transition-colors", CARD_TONE[c.verdict])}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
              {isKeeper && <Sprout className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />}
              <span className="truncate">
                <span className="text-muted-foreground">#{c.candidateNumber}</span> {c.name}
              </span>
            </span>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[10px] uppercase tracking-wide",
                VERDICT_TONE[c.verdict],
              )}
            >
              {c.verdict}
            </Badge>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {c.aroma.map((a) => (
              <span
                key={a}
                className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", aromaTone(a))}
              >
                {a}
              </span>
            ))}
            {c.tags.map((t) => (
              <span
                key={t}
                className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", tagTone(t))}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Loud score as a strength bar — a shortlist gauge, not the verdict. */}
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Loud score <span className="font-semibold text-foreground">{score}</span>
                <span className="opacity-70"> · shortlist</span>
              </span>
              <span>
                nose {c.loud.nose}/10 · {c.rounds.length} round{c.rounds.length === 1 ? "" : "s"}
                {cured && (
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {" "}
                    · cured
                  </span>
                )}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
              role="meter"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Loud shortlist score ${score} of 100`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scorecard as a shape — keepers fill emerald, the rest a calm sky. */}
        <PhenoRadar
          values={c.loud}
          size={64}
          tone={isKeeper ? "keeper" : "muted"}
          className="mt-0.5"
        />
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">{c.note}</p>
    </li>
  );
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
  const contenders = useMemo(
    () =>
      buildContenders(
        DEMO_CANDIDATES.map((c) => ({
          id: c.candidateNumber,
          name: c.name,
          verdict: c.verdict,
          aroma: c.aroma,
          axes: c.loud,
        })),
      ),
    [],
  );
  const fightPool = useMemo<ContenderInput[]>(
    () =>
      DEMO_CANDIDATES.filter((c) => c.verdict !== "cull").map((c) => ({
        id: c.candidateNumber,
        name: c.name,
        verdict: c.verdict,
        aroma: c.aroma,
        axes: c.loud,
      })),
    [],
  );
  const keeperIds = useMemo(
    () => DEMO_CANDIDATES.filter((c) => c.verdict === "keep").map((c) => c.candidateNumber),
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
        className="mb-5 rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-xs text-muted-foreground"
      >
        Demo — {DEMO_PHENO_HUNT.meta.name} · {DEMO_PHENO_HUNT.meta.packLabel} ·{" "}
        {DEMO_PHENO_HUNT.meta.packSize} seeds. Labeled fixture data only.
      </p>

      {/* The pack — walk order, verdict-first, score as a shortlist. */}
      <section aria-label="The pack" className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">The pack</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
        </div>
        <ul className="grid gap-2.5 sm:grid-cols-2" data-testid="pheno-hunt-demo-candidates">
          {candidates.map((c) => (
            <CandidateCard key={c.candidateNumber} c={c} />
          ))}
        </ul>
        <p
          data-testid="pheno-hunt-demo-caveat"
          className="mt-3 rounded-md border-l-2 border-emerald-500/50 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground"
        >
          The Loud score is a fast shortlist to sort the pack — not the verdict. The keeper
          decision, earned through the cure and re-grow stability, is what counts.
        </p>
        <p className="mt-1.5 text-[10px] text-muted-foreground/80">
          Radar axes — <span className="text-foreground/70">N</span> nose ·{" "}
          <span className="text-foreground/70">R</span> resin ·{" "}
          <span className="text-foreground/70">S</span> structure ·{" "}
          <span className="text-foreground/70">Y</span> yield ·{" "}
          <span className="text-foreground/70">B</span> breeding
        </p>
      </section>

      {/* Contenders — the shortlist compared on the merits, before the tree. */}
      <section aria-label="Contenders" className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Contenders</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
        </div>
        <PhenoContendersBoard board={contenders} />
      </section>

      {/* Fight night — pit any two contenders, head to head. */}
      {fightPool.length >= 2 && (
        <section aria-label="Fight night" className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Fight night</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
          </div>
          <PhenoFightNight
            pool={fightPool}
            defaultAId={keeperIds[0] ?? fightPool[0].id}
            defaultBId={keeperIds[1] ?? fightPool[1].id}
          />
        </section>
      )}

      {/* Keepers, clones, and the family tree. */}
      <section aria-label="Keepers and family tree">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Keepers &amp; family tree</h2>
          <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
        </div>
        <PhenoFamilyTree pedigree={pedigree} cloneRowsByKeeperId={cloneRowsByKeeperId} />
      </section>
    </div>
  );
}
