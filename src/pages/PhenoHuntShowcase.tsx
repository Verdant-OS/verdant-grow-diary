/**
 * PhenoHuntShowcase — LIVE, read-only walk of the grower's OWN hunt through the
 * same surfaces as the /internal demo: pack → contenders → fight → cure → family
 * tree. Reads via RLS-scoped SELECT (usePhenoHuntView); no session / no hunt /
 * still loading falls back to the labeled demo, so the page is never blank and
 * never fabricates.
 *
 * Read-only: no writes, no AI, no automation. Mounted outside AppShell (like the
 * per-hunt comparison) so the read surface renders without operator chrome.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import PhenoRadar from "@/components/PhenoRadar";
import PhenoContendersBoard from "@/components/PhenoContendersBoard";
import PhenoFightNight from "@/components/PhenoFightNight";
import PhenoCureTimeline from "@/components/PhenoCureTimeline";
import PhenoFamilyTree from "@/components/PhenoFamilyTree";
import { usePhenoHuntView } from "@/hooks/usePhenoHuntView";
import {
  buildContenders,
  contenderScore,
  type ContenderInput,
  type ContenderVerdict,
} from "@/lib/phenoContendersViewModel";
import { buildPhenoPedigree } from "@/lib/phenoPedigreeViewModel";
import { buildCureTimeline } from "@/lib/phenoCureTimelineViewModel";

const VERDICT_TONE: Record<ContenderVerdict, string> = {
  keep: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  maybe: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cull: "border-border bg-secondary text-muted-foreground",
};

function SectionHead({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <span className="h-px flex-1 bg-gradient-to-r from-emerald-500/40 to-transparent" />
    </div>
  );
}

function LivePackCard({ c }: { c: ContenderInput }) {
  const score = contenderScore(c.axes);
  const isKeeper = c.verdict === "keep";
  return (
    <li
      className={cn(
        "rounded-xl border p-3 transition-colors",
        isKeeper
          ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 via-card to-card ring-1 ring-emerald-500/20"
          : c.verdict === "cull"
            ? "border-border bg-card opacity-70"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{c.name}</span>
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
          {c.aroma.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.aroma.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-300"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">
            Loud score <span className="font-semibold text-foreground">{score}</span>
            <span className="opacity-70"> · shortlist</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-teal-400 to-emerald-400"
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
        <PhenoRadar
          values={c.axes}
          size={64}
          tone={isKeeper ? "keeper" : "muted"}
          className="mt-0.5"
        />
      </div>
    </li>
  );
}

export default function PhenoHuntShowcase() {
  const { id } = useParams<{ id: string }>();
  const { status, source, meta, data, cloneRowsByKeeperId } = usePhenoHuntView(id);

  const board = useMemo(() => buildContenders(data.contenders), [data.contenders]);
  const pedigree = useMemo(
    () => buildPhenoPedigree(data.keepers, data.crosses),
    [data.keepers, data.crosses],
  );
  const timelines = useMemo(
    () =>
      data.cureTimelines
        .map((t) => buildCureTimeline(t))
        .filter((t): t is NonNullable<typeof t> => t != null),
    [data.cureTimelines],
  );
  const pack = board.contenders.length
    ? [...data.contenders].sort((a, b) => contenderScore(b.axes) - contenderScore(a.axes))
    : [];

  const isDemo = source === "demo";

  return (
    <div data-testid="pheno-hunt-showcase-page" className="container mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        title="Pheno Hunt"
        description="A read-only walk of your hunt: triage, compare, decide, and trace lineage — you make every call."
      />

      <p
        data-testid="pheno-hunt-showcase-source"
        className={cn(
          "mb-5 rounded-md border px-3 py-2 text-xs",
          isDemo
            ? "border-border/60 bg-secondary/40 text-muted-foreground"
            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        )}
      >
        {status === "loading"
          ? "Loading your hunt…"
          : isDemo
            ? `Demo — ${meta.name}. Sample data; open one of your own hunts to see it live.`
            : `Live — ${meta.name}${meta.packSize ? ` · ${meta.packSize} candidates` : ""}.`}
      </p>

      {pack.length > 0 && (
        <section aria-label="The pack" className="mb-8">
          <SectionHead title="The pack" />
          <ul className="grid gap-2.5 sm:grid-cols-2" data-testid="pheno-hunt-showcase-pack">
            {pack.map((c) => (
              <LivePackCard key={String(c.id)} c={c} />
            ))}
          </ul>
        </section>
      )}

      {board.contenders.length > 0 && (
        <section aria-label="Contenders" className="mb-8">
          <SectionHead title="Contenders" />
          <PhenoContendersBoard board={board} />
        </section>
      )}

      {data.contenders.length >= 2 && (
        <section aria-label="Fight night" className="mb-8">
          <SectionHead title="Fight night" />
          <PhenoFightNight
            pool={data.contenders}
            defaultAId={(pack[0] ?? data.contenders[0]).id}
            defaultBId={(pack[1] ?? data.contenders[1]).id}
          />
        </section>
      )}

      {timelines.length > 0 && (
        <section aria-label="Earned at the cure" className="mb-8">
          <SectionHead title="Earned at the cure" />
          <div className="space-y-2.5">
            {timelines.map((t) => (
              <PhenoCureTimeline key={t.id} timeline={t} />
            ))}
          </div>
        </section>
      )}

      <section aria-label="Keepers and family tree">
        <SectionHead title="Keepers & family tree" />
        <PhenoFamilyTree pedigree={pedigree} cloneRowsByKeeperId={cloneRowsByKeeperId} />
      </section>
    </div>
  );
}
