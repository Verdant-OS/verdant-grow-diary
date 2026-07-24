/**
 * Static-safety scan for the One-Tent Learning Loop V1 source surface:
 *  - no unsupported causal / certainty language in the new learning files;
 *  - the episode service is read-shaped for reads and write-only for the
 *    grower decision — no service_role, no action_queue/alert mutation, no
 *    schema writes, no device control, no raw_payload rendering;
 *  - the decision insert omits user_id.
 *
 * The banned-phrase list unions the three existing post-grow/reports
 * scanners (fixed/guaranteed/healthy/caused/best/worst + cures/autopilot +
 * definitely/…) rather than inventing a fourth vocabulary.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");

// Every NEW learning-loop file whose copy reaches a grower surface.
const LEARNING_LOOP_FILES = [
  "src/lib/plantMemoryEpisodeRules.ts",
  "src/lib/plantMemoryEpisodeAdapter.ts",
  "src/lib/plantMemoryEpisodeViewModel.ts",
  "src/lib/outcomeFollowUpQueueViewModel.ts",
  "src/lib/nextRunPlaybookRules.ts",
  "src/lib/nextRunPlaybookViewModel.ts",
  "src/lib/growLearningReviewViewModel.ts",
  "src/lib/postGrowLearningLoopSummaryRules.ts",
  "src/components/PlantMemoryEpisodeCard.tsx",
  "src/components/PlantMemoryEpisodeEvidence.tsx",
  "src/components/PlantMemoryEpisodeTimeline.tsx",
  "src/components/OutcomeFollowUpQueue.tsx",
  "src/components/OutcomeFollowUpQueueRow.tsx",
  "src/components/LearningDecisionDialog.tsx",
  "src/components/NextRunPlaybook.tsx",
  "src/components/GrowLearningSummary.tsx",
  "src/components/GrowLearningEpisodeList.tsx",
  "src/pages/GrowLearning.tsx",
] as const;

// Unsupported causal / certainty / ranking language (union of the existing
// reportsHubReviewQueue + action-outcome + post-grow scanners). Applied to
// comment-stripped source so an explanatory comment can still name a banned
// word to document why it is avoided.
const BANNED = [
  /\bfixed the plant\b/i,
  /\bcaused (?:the )?(?:recovery|improvement|decline)\b/i,
  /\bproved effective\b/i,
  /\bsuccessful treatment\b/i,
  /\bguaranteed\b/i,
  /\bbest intervention\b/i,
  /\bwinning method\b/i,
  /\bai selected\b/i,
  /\bautomatically (?:repeat|avoid|execute)\b/i,
  /\bcures the\b/i,
  /\bautopilot\b/i,
  /\beffectiveness score\b/i,
  /\bsuccess rate\b/i,
];

describe("learning-loop causal-language static safety", () => {
  it.each(LEARNING_LOOP_FILES)("%s carries no unsupported causal/certainty copy", (rel) => {
    const src = stripSourceComments(readFileSync(resolve(ROOT, rel), "utf8"));
    for (const pattern of BANNED) {
      expect(pattern.test(src), `${rel} must not contain ${pattern}`).toBe(false);
    }
  });

  it("at least one careful, allowed phrase is present across the surface", () => {
    const combined = LEARNING_LOOP_FILES.map((rel) =>
      readFileSync(resolve(ROOT, rel), "utf8"),
    ).join("\n");
    expect(combined).toMatch(
      /grower-recorded|other factors may have contributed|evidence is limited/i,
    );
  });
});

describe("episode service — persistence & query safety static contract", () => {
  const SERVICE = readFileSync(resolve(ROOT, "src/lib/plantMemoryEpisodeService.ts"), "utf8");

  it("never uses service_role or bridge/api tokens", () => {
    expect(SERVICE).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|bridge_token|api_token/i);
  });

  it("never mutates action_queue or alerts (reads only there)", () => {
    expect(SERVICE).not.toMatch(
      /from\(["']action_queue["']\)[\s\S]{0,120}\.(insert|update|delete|upsert)\(/,
    );
    expect(SERVICE).not.toMatch(/from\(["']alerts["']\)/);
  });

  it("never issues DDL / schema writes or rpc", () => {
    expect(SERVICE).not.toMatch(/\balter table\b|\bcreate table\b|\bdrop table\b/i);
    expect(SERVICE).not.toMatch(/\.rpc\(/);
  });

  it("the diary insert/update omits a user_id field (DB ownership is authoritative)", () => {
    // The only writes are to diary_entries for the learning decision.
    expect(SERVICE).not.toMatch(/user_id\s*:/);
  });

  it("selects raw_payload only with sensor rows so provenance can fail closed", () => {
    // The adapter consumes this opaque envelope for classification and does
    // not include it in the episode evidence contract.
    const select = SERVICE.match(/from\(["']sensor_readings["']\)[\s\S]{0,200}/)?.[0] ?? "";
    expect(select).toContain("raw_payload");
  });

  it("uses bounded limits (no unbounded full-table client fetch)", () => {
    expect(SERVICE).toContain("EPISODE_ACTION_LIMIT");
    expect(SERVICE).toContain("EPISODE_DIARY_LIMIT");
    expect(SERVICE).toMatch(/\.limit\(/);
  });

  it("does not contain device-control tokens", () => {
    expect(SERVICE).not.toMatch(
      /mqtt|home[\s_-]?assistant|webhook|\brelay\b|\bactuator\b|dispatchCommand/i,
    );
  });
});
