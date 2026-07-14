/**
<<<<<<< HEAD
 * PhenoComparison — read-only Pheno Comparison PREVIEW page (/pheno-comparison).
 *
 * Demo-fixture only. No fetch, no Supabase, no AI, no Action Queue, no writes.
 * Renders the shared presentational PhenoComparisonView in "demo" mode. The
 * live per-hunt comparison lives in PhenoHuntCompare (/pheno-hunts/:id/compare).
 */
import PhenoComparisonView from "@/components/PhenoComparisonView";
import { PHENO_COMPARISON_DEMO_CANDIDATES } from "@/lib/phenoComparisonFixtures";

export default function PhenoComparison() {
  return <PhenoComparisonView inputs={PHENO_COMPARISON_DEMO_CANDIDATES} mode="demo" />;
=======
 * Pheno Comparison — read-only, selection-grade evidence preview.
 *
 * Compares candidate phenos on what a breeder actually selects on: phenotype
 * traits, timepoint alignment, replication, and post-cure follow-through —
 * plus an overall judgment of whether the candidates are even comparable.
 * Environment telemetry is shown as CONTEXT ONLY and never drives selection.
 *
 * Presenter only. All comparison / grading / missing-data logic lives in
 * `src/lib/phenoSelectionRules.ts` + `src/lib/phenoComparisonViewModel.ts`
 * (+ `phenoComparisonRules.ts` for the demoted telemetry honesty flags).
 *
 * Safety posture (see AGENTS.md):
 *   - Read-only. No Supabase, no writes, no create/import/save.
 *   - No Edge Functions, AI, automation, or device control.
 *   - No fake live data: sample fixtures carry non-live provenance and the
 *     whole surface is stamped SAMPLE.
 *   - Never overstates: a thin/incomplete record is never a "keeper", and
 *     bad/stale/invalid telemetry is never shown as healthy.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canonicalBadgeToneClass } from "@/lib/canonicalSourceBadgeViewModel";
import { CANONICAL_SOURCE_LEGEND_ENTRIES } from "@/components/CanonicalSourceLegend";
import {
  CORE_SENSOR_METRIC_KEYS,
  emptyStateCopy,
  PHENO_COMPARISON_CONFIDENCE_CAVEAT,
} from "@/lib/phenoComparisonRules";
import type { SelectionTone } from "@/lib/phenoSelectionRules";
import { PHENO_COMPARISON_DEMO_INPUT } from "@/lib/phenoComparisonFixtures";
import {
  buildPhenoComparisonViewModel,
  type PhenoCandidateView,
  type PhenoComparisonInput,
  type PhenoComparisonViewModel,
  type PhenoMissingFlagView,
} from "@/lib/phenoComparisonViewModel";

export interface PhenoComparisonProps {
  /**
   * Optional pre-built input. Defaults to the labeled demo/sample dataset.
   * Injected only by tests / future live wiring — the route uses the demo.
   */
  input?: PhenoComparisonInput;
}

/** Cautious tone classes. `neutral` is muted — never a green success badge. */
function toneClass(tone: SelectionTone): string {
  switch (tone) {
    case "danger":
      return "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300";
    case "caution":
      return "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    case "neutral":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}

export default function PhenoComparison({
  input = PHENO_COMPARISON_DEMO_INPUT,
}: PhenoComparisonProps): JSX.Element {
  const vm: PhenoComparisonViewModel = buildPhenoComparisonViewModel(input);

  return (
    <div
      data-testid="pheno-comparison-page"
      className="mx-auto max-w-6xl space-y-5 p-4"
    >
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-display font-bold">Pheno Comparison</h1>
          <Badge
            variant="outline"
            data-testid="pheno-comparison-readonly-badge"
            className="border-border"
          >
            Read-only
          </Badge>
          {vm.isDemo ? (
            <Badge variant="secondary" data-testid="pheno-comparison-sample-badge">
              Sample data
            </Badge>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Compare candidate phenos on selection evidence — phenotype, timepoint,
          replication, and post-cure. Sensors are context, not a selection
          signal.
        </p>

        {vm.isDemo ? (
          <div
            data-testid="pheno-comparison-demo-banner"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
          >
            Sample / demo data — not real telemetry. This is a read-only
            preview. No readings, entries, or actions can be created, imported,
            or saved here.
          </div>
        ) : null}

        <p
          data-testid="pheno-comparison-safety-note"
          className="text-xs text-muted-foreground"
        >
          Read-only preview · No writes · No equipment commands · No AI calls.
          This surface only displays saved data and runs nothing on its own.
          Verdant surfaces evidence; the grower decides.
        </p>

        <p
          data-testid="pheno-comparison-confidence-caveat"
          className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground"
        >
          {PHENO_COMPARISON_CONFIDENCE_CAVEAT}
        </p>

        <SourceLegend />
      </header>

      <ComparabilityPanel vm={vm} />

      <div
        data-testid="pheno-comparison-grid"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {vm.candidates.map((candidate) => (
          <CandidateCard key={candidate.id} candidate={candidate} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparability panel — grades the comparison itself.
// ---------------------------------------------------------------------------

function ComparabilityPanel({ vm }: { vm: PhenoComparisonViewModel }) {
  const c = vm.comparability;
  return (
    <section
      data-testid="pheno-comparability-panel"
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Comparability
        </span>
        <span
          data-testid="pheno-comparability-verdict"
          data-verdict={c.verdict}
          data-tone={c.tone}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClass(
            c.tone,
          )}`}
        >
          {c.label}
        </span>
      </div>
      <ul data-testid="pheno-comparability-reasons" className="space-y-1">
        {c.reasons.map((reason, i) => (
          <li
            key={i}
            data-testid={`pheno-comparability-reason-${i}`}
            className="text-xs text-muted-foreground"
          >
            {reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Source legend — shows all six canonical source labels (context only).
// ---------------------------------------------------------------------------

function SourceLegend(): JSX.Element {
  return (
    <div
      data-testid="pheno-comparison-source-legend"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 p-2"
    >
      <span className="text-[11px] font-medium text-muted-foreground">
        Sensor sources (context):
      </span>
      {CANONICAL_SOURCE_LEGEND_ENTRIES.map((entry) => (
        <span
          key={entry.key}
          data-testid={`pheno-source-legend-${entry.key}`}
          title={entry.description}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${canonicalBadgeToneClass(
            entry.key,
          )}`}
        >
          {entry.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate card
// ---------------------------------------------------------------------------

function CandidateCard({
  candidate,
}: {
  candidate: PhenoCandidateView;
}): JSX.Element {
  return (
    <Card
      data-testid={`pheno-comparison-candidate-${candidate.id}`}
      className="flex flex-col"
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="secondary"
            data-testid={`pheno-candidate-label-${candidate.id}`}
          >
            {candidate.candidateLabel}
          </Badge>
          <CardTitle className="text-base">{candidate.plantName}</CardTitle>
          <span
            data-testid={`pheno-selection-strength-${candidate.id}`}
            data-strength={candidate.selectionEvidence.strength}
            data-tone={candidate.selectionEvidence.tone}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${toneClass(
              candidate.selectionEvidence.tone,
            )}`}
          >
            {candidate.selectionEvidence.label}
          </span>
        </div>
        <p
          data-testid={`pheno-candidate-context-${candidate.id}`}
          className="text-xs text-muted-foreground"
        >
          {candidate.contextLine}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <PhenotypeSection candidate={candidate} />
        <TimepointReplicationRow candidate={candidate} />
        <PostCureSection candidate={candidate} />
        <PhotoSection candidate={candidate} />
        <QuickLogSection candidate={candidate} />
        <TimelineSection candidate={candidate} />
        <CaveatsSection candidate={candidate} />
        <EnvironmentContextSection candidate={candidate} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function PhenotypeSection({ candidate }: { candidate: PhenoCandidateView }) {
  return (
    <section className="space-y-1">
      <SectionHeading>Selection evidence (phenotype)</SectionHeading>
      <dl
        data-testid={`pheno-phenotype-${candidate.id}`}
        className="space-y-1"
      >
        {candidate.phenotypeTraits.map((trait) => (
          <div
            key={trait.key}
            data-testid={`pheno-trait-${candidate.id}-${trait.key}`}
            data-recorded={trait.recorded ? "true" : "false"}
            className="flex items-baseline justify-between gap-2"
          >
            <dt className="text-xs text-muted-foreground">
              {trait.label}
              {trait.core ? "" : " ·"}
            </dt>
            <dd
              className={
                trait.recorded
                  ? "text-right text-xs font-medium text-foreground"
                  : "text-right text-xs font-medium text-amber-700 dark:text-amber-300"
              }
            >
              {trait.recorded ? (
                <>
                  {trait.valueLabel ?? ""}
                  {trait.note ? (
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      {trait.note}
                    </span>
                  ) : null}
                </>
              ) : (
                "Not recorded"
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TimepointReplicationRow({
  candidate,
}: {
  candidate: PhenoCandidateView;
}) {
  return (
    <section className="grid grid-cols-2 gap-2">
      <div>
        <SectionHeading>Timepoint</SectionHeading>
        <p
          data-testid={`pheno-timepoint-${candidate.id}`}
          data-known={candidate.timepoint.known ? "true" : "false"}
          className={
            candidate.timepoint.known
              ? "text-xs text-foreground"
              : "text-xs text-amber-700 dark:text-amber-300"
          }
        >
          {candidate.timepoint.label}
        </p>
      </div>
      <div>
        <SectionHeading>Replication</SectionHeading>
        <p
          data-testid={`pheno-replication-${candidate.id}`}
          data-replicated={candidate.replication.replicated ? "true" : "false"}
          className={
            candidate.replication.replicated
              ? "text-xs text-foreground"
              : "text-xs text-amber-700 dark:text-amber-300"
          }
        >
          {candidate.replication.label}
        </p>
      </div>
    </section>
  );
}

function PostCureSection({ candidate }: { candidate: PhenoCandidateView }) {
  const pc = candidate.postCure;
  return (
    <section className="space-y-1">
      <SectionHeading>Post-cure follow-up</SectionHeading>
      <p
        data-testid={`pheno-postcure-${candidate.id}`}
        data-cured={pc.cured ? "true" : "false"}
        className={
          pc.cured
            ? "text-xs text-foreground"
            : "text-xs text-amber-700 dark:text-amber-300"
        }
      >
        {pc.label}
      </p>
      {pc.cured ? (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {pc.noseAfterCure ? <li>Nose: {pc.noseAfterCure}</li> : null}
          {pc.quality ? <li>Quality: {pc.quality}</li> : null}
          {pc.keeperImpression ? (
            <li data-testid={`pheno-postcure-impression-${candidate.id}`}>
              Grower's read: {pc.keeperImpression}
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

function PhotoSection({ candidate }: { candidate: PhenoCandidateView }) {
  return (
    <section className="space-y-1">
      <SectionHeading>Photo</SectionHeading>
      {candidate.hasPhoto && candidate.photoUrl ? (
        <img
          src={candidate.photoUrl}
          alt={`${candidate.plantName} candidate`}
          loading="lazy"
          data-testid={`pheno-photo-${candidate.id}`}
          className="h-24 w-full rounded-md object-cover"
        />
      ) : (
        <div
          data-testid={`pheno-photo-missing-${candidate.id}`}
          className="flex h-14 items-center justify-center rounded-md border border-dashed px-2 text-center text-xs text-muted-foreground"
        >
          {emptyStateCopy("no_photo")}
        </div>
      )}
    </section>
  );
}

function QuickLogSection({ candidate }: { candidate: PhenoCandidateView }) {
  return (
    <section className="space-y-1">
      <SectionHeading>Recent Quick Log</SectionHeading>
      {candidate.quickLogs.length > 0 ? (
        <ul data-testid={`pheno-quicklog-${candidate.id}`} className="space-y-1">
          {candidate.quickLogs.map((log) => (
            <li key={log.id} className="text-xs">
              <span className="font-medium">{log.kindLabel}</span>
              <span className="text-muted-foreground"> · {log.atLabel}</span>
              {log.note ? (
                <span className="block text-muted-foreground">{log.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`pheno-quicklog-empty-${candidate.id}`}
          className="text-xs text-muted-foreground"
        >
          No Quick Log entries
        </p>
      )}
    </section>
  );
}

function TimelineSection({ candidate }: { candidate: PhenoCandidateView }) {
  return (
    <section className="space-y-1">
      <SectionHeading>Timeline</SectionHeading>
      {candidate.timelineEvents.length > 0 ? (
        <ul data-testid={`pheno-timeline-${candidate.id}`} className="space-y-1">
          {candidate.timelineEvents.map((event) => (
            <li key={event.id} className="text-xs">
              <span className="font-medium">{event.kindLabel}</span>
              <span className="text-muted-foreground"> · {event.atLabel}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`pheno-timeline-empty-${candidate.id}`}
          className="text-xs text-muted-foreground"
        >
          No timeline events
        </p>
      )}
    </section>
  );
}

function CaveatsSection({ candidate }: { candidate: PhenoCandidateView }) {
  if (candidate.selectionCaveats.length === 0) {
    return (
      <section className="space-y-1">
        <SectionHeading>Evidence gaps</SectionHeading>
        <p
          data-testid={`pheno-caveats-none-${candidate.id}`}
          className="text-xs text-muted-foreground"
        >
          No selection-evidence gaps flagged
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-1">
      <SectionHeading>Evidence gaps</SectionHeading>
      <div
        data-testid={`pheno-caveats-${candidate.id}`}
        className="flex flex-wrap gap-1.5"
      >
        {candidate.selectionCaveats.map((caveat) => (
          <Badge
            key={caveat.code}
            variant="outline"
            data-testid={`pheno-flag-${candidate.id}-${caveat.code}`}
            className={
              caveat.code === "thin_phenotype"
                ? "border-red-500/50 text-red-700 dark:text-red-300"
                : "border-amber-500/50 text-amber-800 dark:text-amber-300"
            }
          >
            {caveat.label}
          </Badge>
        ))}
      </div>
      <ul className="space-y-1">
        {candidate.selectionCaveats.map((caveat) => (
          <li
            key={caveat.code}
            data-testid={`pheno-caveat-${candidate.id}-${caveat.code}`}
            className="text-xs text-muted-foreground"
          >
            {caveat.copy}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EnvironmentContextSection({
  candidate,
}: {
  candidate: PhenoCandidateView;
}) {
  const env = candidate.environmentContext;
  const snapshot = env.snapshot;
  const coreKeys = CORE_SENSOR_METRIC_KEYS as readonly string[];
  // Show present core metrics plus any present metric that is relevant for
  // this context (e.g. EC/pH on a hydro run, PPFD under lights).
  const shownMetrics = snapshot
    ? snapshot.metrics.filter(
        (m) => m.present && (coreKeys.includes(m.key) || m.relevant),
      )
    : [];
  return (
    <section className="space-y-1 border-t border-border/50 pt-2">
      <SectionHeading>{env.label}</SectionHeading>
      {snapshot ? (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid={`pheno-source-badge-${candidate.id}`}
              data-source={snapshot.badge.normalizedSource}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${canonicalBadgeToneClass(
                snapshot.badge.tone,
              )}`}
            >
              {snapshot.badge.label}
            </span>
            {snapshot.isStale ? (
              <Badge
                variant="outline"
                data-testid={`pheno-envcontext-stale-${candidate.id}`}
                className="border-amber-500/50 text-amber-800 dark:text-amber-300"
              >
                Stale
              </Badge>
            ) : null}
            {snapshot.isInvalid ? (
              <Badge
                variant="destructive"
                data-testid={`pheno-envcontext-invalid-${candidate.id}`}
              >
                Invalid
              </Badge>
            ) : null}
          </div>
          <p
            data-testid={`pheno-envmetrics-${candidate.id}`}
            className="text-[11px] text-muted-foreground"
          >
            {shownMetrics.length > 0
              ? shownMetrics
                  .map((m) => `${m.label} ${m.value}${m.unit ? m.unit : ""}`)
                  .join(" · ")
              : "No usable environment metrics"}
          </p>
          <EnvironmentFlags candidateId={candidate.id} flags={env.flags} />
        </div>
      ) : (
        <p
          data-testid={`pheno-envcontext-missing-${candidate.id}`}
          className="text-xs text-muted-foreground"
        >
          {emptyStateCopy("no_sensor_snapshot")}
        </p>
      )}
    </section>
  );
}

/**
 * Missing-metric telemetry flags for the environment context. Stale/invalid
 * are already shown as prominent badges above, so only the missing-metric
 * flags surface here — incomplete telemetry must never be silently dropped.
 */
function EnvironmentFlags({
  candidateId,
  flags,
}: {
  candidateId: string;
  flags: PhenoMissingFlagView[];
}) {
  const missing = flags.filter(
    (f) => f.code !== "stale_reading" && f.code !== "invalid_reading",
  );
  if (missing.length === 0) return null;
  return (
    <div
      data-testid={`pheno-envcontext-flags-${candidateId}`}
      className="flex flex-wrap gap-1"
    >
      {missing.map((f) => (
        <Badge
          key={f.code}
          variant="outline"
          data-testid={`pheno-envflag-${candidateId}-${f.code}`}
          className="border-amber-500/50 text-amber-800 dark:text-amber-300"
        >
          {f.label}
        </Badge>
      ))}
    </div>
  );
>>>>>>> origin/main
}
