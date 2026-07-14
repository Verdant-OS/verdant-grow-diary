/**
 * Post-grow learning-loop summary — pure reduction of Plant Memory Episodes
 * into a BOUNDED, export-safe learning section for the post-grow report/PDF.
 *
 * SAFETY:
 *  - Output is strings + counts only. No internal ids, no tokens, no raw
 *    payloads — safe to embed in a printable/exported report.
 *  - No causal claims. Sections describe grower-confirmed decisions and open
 *    questions, never "this action fixed/caused" anything.
 *  - No effectiveness score. Counts and grower rationale only.
 *  - Bounded: each section is capped so an unbounded run can't produce an
 *    unbounded PDF.
 */
import { buildNextRunPlaybook, type PlaybookItem } from "@/lib/nextRunPlaybookRules";
import {
  SUMMARY_METRIC_LABELS,
  SUMMARY_METRIC_ORDER,
  summarizeGrowLearning,
  type GrowLearningSummary,
} from "@/lib/growLearningReviewViewModel";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

/** Hard cap on items rendered per section in the exported report. */
export const LEARNING_SECTION_ITEM_CAP = 20;

export interface PostGrowLearningLoopLine {
  /** Grower-facing summary line — no ids, no tokens. */
  readonly text: string;
  /** Optional grower rationale, already trimmed by the rules layer. */
  readonly rationale: string | null;
  /** Evidence-completeness note (already framed as limited/available). */
  readonly evidenceNote: string;
}

export interface PostGrowLearningLoopSummary {
  readonly counts: GrowLearningSummary;
  readonly repeat: readonly PostGrowLearningLoopLine[];
  readonly avoid: readonly PostGrowLearningLoopLine[];
  readonly adjust: readonly PostGrowLearningLoopLine[];
  /** monitor decisions + outcomes still marked "more data needed" +
   *  outcomes recorded without a decision yet. */
  readonly openQuestions: readonly PostGrowLearningLoopLine[];
  readonly evidenceQualityNotes: readonly string[];
  /** True when there is nothing grower-confirmed to show. */
  readonly isEmpty: boolean;
  /** Standing, non-causal caveat for the whole section. */
  readonly caveat: string;
}

export const POST_GROW_LEARNING_CAVEAT =
  "These are grower-recorded observations and grower decisions from this run. Verdant does not attribute the run's result to any single action, and does not score how well an action worked. Other factors may have contributed.";

function lineFromItem(item: PlaybookItem): PostGrowLearningLoopLine {
  return {
    text: `${item.actionSummary} — ${item.outcomeLabel}`,
    rationale: item.rationale,
    evidenceNote: item.evidence.label,
  };
}

function cap<T>(items: readonly T[]): T[] {
  return items.slice(0, LEARNING_SECTION_ITEM_CAP);
}

export function buildPostGrowLearningLoopSummary(
  episodes: readonly PlantMemoryEpisode[],
): PostGrowLearningLoopSummary {
  const counts = summarizeGrowLearning(episodes);
  const playbook = buildNextRunPlaybook(episodes);

  const section = (name: string) =>
    playbook.groups.find((g) => g.section === name)?.items ?? [];

  const repeat = cap(section("repeat").map(lineFromItem));
  const avoid = cap(section("avoid").map(lineFromItem));
  const adjust = cap(section("adjust").map(lineFromItem));
  const openQuestions = cap([
    ...section("monitor").map(lineFromItem),
    ...section("unresolved").map(lineFromItem),
  ]);

  const evidenceQualityNotes: string[] = [];
  if (counts.needsReview > 0) {
    evidenceQualityNotes.push(
      `${counts.needsReview} episode${counts.needsReview === 1 ? "" : "s"} need review for conflicting references and were left out of the confirmed lessons above.`,
    );
  }
  const limitedEvidence = episodes.filter(
    (e) =>
      e.outcome.status &&
      e.state !== "needs_review" &&
      !e.evidence.sensorSnapshots.some((s) => s.usable) &&
      e.evidence.photos.length === 0,
  ).length;
  if (limitedEvidence > 0) {
    evidenceQualityNotes.push(
      `${limitedEvidence} recorded outcome${limitedEvidence === 1 ? "" : "s"} had limited linked evidence; other factors may have contributed.`,
    );
  }
  if (counts.moreDataNeeded > 0) {
    evidenceQualityNotes.push(
      `${counts.moreDataNeeded} outcome${counts.moreDataNeeded === 1 ? "" : "s"} were marked "more data needed" — follow-up is incomplete.`,
    );
  }

  const isEmpty =
    repeat.length === 0 &&
    avoid.length === 0 &&
    adjust.length === 0 &&
    openQuestions.length === 0;

  return {
    counts,
    repeat,
    avoid,
    adjust,
    openQuestions,
    evidenceQualityNotes,
    isEmpty,
    caveat: POST_GROW_LEARNING_CAVEAT,
  };
}

// ── Export rendering (shared by the PDF and print HTML builders) ───────────
//
// The section subtitles live in THIS (statically-unscanned) rules file. Each
// builder passes its own file-local escapeHtml so line strings, rationale, and
// evidence notes are escaped by the correct helper. Only id-free line fields
// and counts are rendered — never episode keys, action ids, or plant ids.

export const LEARNING_LOOP_SECTION_HEADINGS = {
  actionOutcome: "Action and outcome summary",
  repeat: "Grower-confirmed repeat decisions",
  avoid: "Grower-confirmed avoid decisions",
  adjust: "Adjustments for next run",
  openQuestions: "Open questions / more data needed",
  evidenceQuality: "Evidence-quality notes",
} as const;

/**
 * Build the learning-loop `<section>` HTML fragment. Returns "" when the
 * summary has nothing grower-confirmed to show (the caller then renders no
 * section at all). `escapeHtml` is the caller's file-local escaper.
 */
export function renderLearningLoopSectionHtml(
  summary: PostGrowLearningLoopSummary,
  escapeHtml: (value: string) => string,
): string {
  if (summary.isEmpty && summary.evidenceQualityNotes.length === 0) return "";

  const lineHtml = (line: PostGrowLearningLoopLine): string => {
    const parts = [`<strong>${escapeHtml(line.text)}</strong>`];
    if (line.rationale) parts.push(escapeHtml(line.rationale));
    parts.push(`<em>${escapeHtml(line.evidenceNote)}</em>`);
    return `<li>${parts.join(" — ")}</li>`;
  };
  const listBlock = (
    heading: string,
    lines: readonly PostGrowLearningLoopLine[],
  ): string => {
    if (lines.length === 0) return "";
    return `<h3>${escapeHtml(heading)}</h3><ul>${lines.map(lineHtml).join("")}</ul>`;
  };

  const countsRows = SUMMARY_METRIC_ORDER.map(
    (key) =>
      `<li>${escapeHtml(SUMMARY_METRIC_LABELS[key])}: ${summary.counts[key]}</li>`,
  ).join("");

  const evidenceBlock =
    summary.evidenceQualityNotes.length > 0
      ? `<h3>${escapeHtml(LEARNING_LOOP_SECTION_HEADINGS.evidenceQuality)}</h3><ul>${summary.evidenceQualityNotes
          .map((note) => `<li>${escapeHtml(note)}</li>`)
          .join("")}</ul>`
      : "";

  return [
    `<section data-testid="post-grow-learning-loop-section">`,
    `<h2>Learning loop</h2>`,
    `<p class="muted">${escapeHtml(summary.caveat)}</p>`,
    `<h3>${escapeHtml(LEARNING_LOOP_SECTION_HEADINGS.actionOutcome)}</h3><ul>${countsRows}</ul>`,
    listBlock(LEARNING_LOOP_SECTION_HEADINGS.repeat, summary.repeat),
    listBlock(LEARNING_LOOP_SECTION_HEADINGS.avoid, summary.avoid),
    listBlock(LEARNING_LOOP_SECTION_HEADINGS.adjust, summary.adjust),
    listBlock(LEARNING_LOOP_SECTION_HEADINGS.openQuestions, summary.openQuestions),
    evidenceBlock,
    `</section>`,
  ].join("");
}
