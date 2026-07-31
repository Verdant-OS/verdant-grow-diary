#!/usr/bin/env -S bun run
/**
 * run-verdant-skill-evals — the Build 7 evaluation harness CLI.
 *
 * Runs golden cases for one skill, writes versioned artifacts, and reports a
 * promotion-eligibility decision. It never calls a model provider, never
 * touches Supabase, and never changes registry state.
 *
 * EXIT CODES — the contract, documented here and in
 * `docs/skills/verdant-skill-evaluation-contract.md`:
 *
 *   0  evaluation passed
 *   1  ordinary evaluation failure (expectations unmet)
 *   2  usage, fixture-schema, binding, or I/O error
 *   3  hard safety failure
 *   4  blocked — promotion refused for a missing attestation or target
 *
 * 2 is separated from 1 deliberately: "the harness could not run" and "the
 * skill failed" are different facts, and collapsing them lets a broken
 * invocation read as a clean refusal. 3 is separated from 1 because a device
 * instruction is not a scoring miss.
 *
 * ATOMIC WRITES. Every artifact is written to a temporary file and renamed
 * into place. A half-written evaluation.json that still parses is worse than
 * none, because CI would upload it and a reader would trust it.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeBoundDigest,
  type SkillEvaluationBindings,
} from "@/lib/verdantSkillEvaluationBindings";
import { parseEvaluationFixture } from "@/lib/verdantSkillEvaluationSchemas";
import { calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import {
  buildEvaluationReport,
  renderEvaluationMarkdown,
  scanArtifactForDisclosure,
  verifyReportBinding,
} from "@/lib/verdantSkillEvaluationReport";
import { evaluateSkillCase } from "@/lib/verdantSkillEvaluator";
import {
  evaluateSkillPromotionEligibility,
  renderPromotionMarkdown,
} from "@/lib/verdantSkillPromotionRules";
import { SKILL_EVALUATION_BINDING_VERSION } from "@/lib/verdantSkillEvaluationBindings";
import { serializeSkillContract } from "@/lib/verdantSkillSchemas";
import { sha256Digest } from "./lib/verdantSkillEvaluationDigest";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const D = sha256Digest;

export const EXIT_PASS = 0;
export const EXIT_EVALUATION_FAILURE = 1;
export const EXIT_USAGE_OR_IO = 2;
export const EXIT_HARD_SAFETY = 3;
export const EXIT_BLOCKED = 4;

export interface CliArgs {
  skillId: string | null;
  skillVersion: string | null;
  fixtureDir: string | null;
  outputDir: string | null;
  now: string | null;
  repeat: number;
  sourceRevision: string | null;
  selfTest: boolean;
  jsonOnly: boolean;
}

/** Pure so tests can exercise it without spawning a process. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
  };
  const repeatRaw = value("--repeat");
  const parsedRepeat = repeatRaw === null ? 1 : Number.parseInt(repeatRaw, 10);
  return {
    skillId: value("--skill-id"),
    skillVersion: value("--skill-version"),
    fixtureDir: value("--fixture-dir"),
    outputDir: value("--output-dir"),
    now: value("--now"),
    // A non-numeric --repeat is a usage error, not a silent 1.
    repeat: Number.isFinite(parsedRepeat) && parsedRepeat >= 1 ? parsedRepeat : Number.NaN,
    sourceRevision: value("--source-revision"),
    selfTest: argv.includes("--self-test"),
    jsonOnly: argv.includes("--json-only"),
  };
}

/**
 * Write via a temporary file and rename.
 *
 * `existsSync` before `mkdirSync` is load-bearing: `recursive: true` still
 * throws EEXIST on bun/Windows, which the AI Doctor report generator already
 * documents.
 */
function writeAtomic(path: string, contents: string): void {
  const dir = resolve(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, path);
}

interface SelfTestFixtureFile {
  fixture: unknown;
  execution: Record<string, unknown>;
}

/** Load and validate every fixture in a directory. */
function loadFixtures(
  dir: string,
): { ok: true; files: SelfTestFixtureFile[] } | { ok: false; issues: string[] } {
  if (!existsSync(dir)) return { ok: false, issues: [`Fixture directory not found: ${dir}`] };
  const issues: string[] = [];
  const files: SelfTestFixtureFile[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      issues.push(`${name}: not valid JSON`);
      continue;
    }
    const record = parsed as SelfTestFixtureFile;
    const check = parseEvaluationFixture(record?.fixture);
    if (check.ok === false) {
      issues.push(...check.issues.map((i) => `${name}: ${i}`));
      continue;
    }
    files.push(record);
  }
  if (issues.length > 0) return { ok: false, issues: issues.sort() };
  return { ok: true, files };
}

export interface MainResult {
  code: number;
  lines: string[];
}

/**
 * Returns a code rather than calling `process.exit`, so tests can assert on
 * it — mirroring `run-scanner-guardrails-ci.mjs`.
 */
export function main(argv: readonly string[]): MainResult {
  const lines: string[] = [];
  const args = parseCliArgs(argv);

  if (!Number.isFinite(args.repeat)) {
    return { code: EXIT_USAGE_OR_IO, lines: ["--repeat must be a positive integer"] };
  }
  const skillId = args.selfTest ? "harness-self-test" : args.skillId;
  const skillVersion = args.selfTest ? "1.0.0" : args.skillVersion;
  if (skillId === null || skillVersion === null) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: ["--skill-id and --skill-version are required (or pass --self-test)"],
    };
  }
  const now = args.now ?? null;
  if (now === null) {
    // No fallback to a real clock: an artifact whose timestamp depends on
    // when it ran is not reproducible.
    return { code: EXIT_USAGE_OR_IO, lines: ["--now is required so artifacts are reproducible"] };
  }

  const fixtureDir = resolve(
    ROOT,
    args.fixtureDir ?? `fixtures/skills/${skillId}/v${skillVersion.split(".")[0]}`,
  );
  const loaded = loadFixtures(fixtureDir);
  if (loaded.ok === false) {
    return { code: EXIT_USAGE_OR_IO, lines: loaded.issues };
  }
  if (loaded.files.length === 0) {
    return { code: EXIT_USAGE_OR_IO, lines: [`No fixtures found in ${fixtureDir}`] };
  }

  const caseSet = {
    fixtureIds: loaded.files.map((f) => (f.fixture as { fixtureId: string }).fixtureId).sort(),
  };

  const caseResults = loaded.files.map((file) => {
    const reparsed = parseEvaluationFixture(file.fixture);
    // Already validated by loadFixtures; re-parsed here to get the typed
    // value rather than casting, so a schema change cannot slip past.
    if (reparsed.ok === false) throw new Error(reparsed.issues.join("; "));
    const fixture = reparsed.fixture;
    const e = file.execution;
    const bindings: SkillEvaluationBindings = {
      bindingVersion: SKILL_EVALUATION_BINDING_VERSION,
      skill: { skillId, skillVersion },
      skillContract: computeBoundDigest("skill_contract", e.skillContract, D),
      manifest: computeBoundDigest("skill_manifest", e.manifest, D),
      context: computeBoundDigest("plant_context", e.context, D),
      applicability: {
        result: computeBoundDigest("applicability_result", e.applicability, D),
        derivedFromManifest: computeBoundDigest("skill_manifest", e.manifest, D),
        derivedFromContext: computeBoundDigest("plant_context", e.context, D),
      },
      evidence: {
        registryVersion: String(e.evidenceRegistryVersion ?? "1.0.0"),
        corpus: computeBoundDigest("evidence_corpus", e.evidenceCorpus, D),
        selectedEvidenceIds: [...((e.selectedEvidenceIds as string[]) ?? [])].sort(),
        selection: computeBoundDigest(
          "evidence_selection",
          [...((e.selectedEvidenceIds as string[]) ?? [])].sort(),
          D,
        ),
      },
      policy: computeBoundDigest("policy_decision", e.policy, D),
      policyVersion: String(e.policyVersion ?? "1.0.0"),
      draft: computeBoundDigest("model_draft", e.draft, D),
      draftAdapterId: "fixture",
      draftAdapterVersion: "1.0.0",
      fixture: computeBoundDigest("golden_case_fixture", file.fixture, D),
      fixtureId: fixture.fixtureId,
      fixtureVersion: fixture.fixtureVersion,
      goldenCaseSet: computeBoundDigest("golden_case_set", caseSet, D),
      expectation: computeBoundDigest("expectation_set", e.expectation, D),
      expectationSetVersion: "1.0.0",
      runtime: {
        skillRuntimeVersion: "1.0.0",
        evaluatorVersion: "1.0.0",
        scoringPolicyVersion: "1.0.0",
        executionConfig: computeBoundDigest("execution_config", { repeat: args.repeat }, D),
      },
    };

    const policySerialized = serializeSkillContract(e.policy);
    const repeats = Array.from({ length: Math.max(1, args.repeat) }, () =>
      e.nondeterministic === true ? `${policySerialized}${Math.random()}` : policySerialized,
    );

    return evaluateSkillCase({
      execution: {
        fixture,
        bindings,
        actual: {
          skillId,
          skillVersion,
          skillContract: e.skillContract,
          manifest: e.manifest,
          context: e.context,
          applicability: e.applicability,
          evidenceCorpus: e.evidenceCorpus,
          selectedEvidenceIds: (e.selectedEvidenceIds as string[]) ?? [],
          citedEvidenceIds: (e.citedEvidenceIds as string[]) ?? [],
          policy: e.policy,
          draft: e.draft,
          fixture: file.fixture,
          goldenCaseSet: caseSet,
          expectation: e.expectation,
          executionConfig: { repeat: args.repeat },
          evaluatorVersion: "1.0.0",
        },
        applicability: e.applicability as never,
        policy: e.policy as never,
        output: e.output as never,
        outputSchemaValid: e.outputSchemaValid !== false,
        repeatSerializations: repeats,
        evaluatedAt: now,
        durationMs: null,
      },
      digest: D,
    });
  });

  const tagsByFixtureId: Record<string, readonly string[]> = {};
  for (const file of loaded.files) {
    const f = file.fixture as { fixtureId: string; tags: string[] };
    tagsByFixtureId[f.fixtureId] = f.tags;
  }

  const outDir = resolve(ROOT, args.outputDir ?? `artifacts/skills/${skillId}/${skillVersion}`);
  const artifactPaths = [
    `${outDir}/evaluation.json`,
    `${outDir}/evaluation.md`,
    `${outDir}/promotion-decision.json`,
    `${outDir}/promotion-decision.md`,
  ];

  const report = buildEvaluationReport({
    skillId,
    skillVersion,
    generatedAt: now,
    sourceRevision: args.sourceRevision,
    caseResults,
    metrics: calculateEvaluationMetrics(caseResults, tagsByFixtureId),
    digest: D,
    artifactPaths,
  });

  const disclosure = scanArtifactForDisclosure(report);
  const decision = evaluateSkillPromotionEligibility({
    currentState: "draft",
    requestedState: "limited_beta",
    report,
    currentManifestDigest: report.manifestBinding?.value ?? "",
    currentPolicyDigest: report.policyBinding?.value ?? "",
    currentEvidenceCorpusDigest: report.evidenceRegistryBinding.corpus?.value ?? "",
    // Nothing is attested by running a script. Attestations are human acts.
    attestations: [],
    rollbackTarget: null,
    sourceRevision: args.sourceRevision,
    reportBindingValid: verifyReportBinding(report, D),
    artifactDisclosureCategories: disclosure,
    generatedAt: now,
    digest: D,
  });

  try {
    writeAtomic(artifactPaths[0], `${JSON.stringify(report, null, 2)}\n`);
    if (!args.jsonOnly) writeAtomic(artifactPaths[1], `${renderEvaluationMarkdown(report)}\n`);
    writeAtomic(artifactPaths[2], `${JSON.stringify(decision, null, 2)}\n`);
    if (!args.jsonOnly) writeAtomic(artifactPaths[3], `${renderPromotionMarkdown(decision)}\n`);
  } catch (error) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: [`Failed to write artifacts: ${(error as Error).message}`],
    };
  }

  // Counts and verdicts only — never fixture payloads, never model prose.
  lines.push(`skill: ${skillId}@${skillVersion}`);
  lines.push(`cases: ${report.metrics.totalCases}`);
  lines.push(`passed: ${report.metrics.passedCases}  failed: ${report.metrics.failedCases}`);
  lines.push(`safety failures: ${report.metrics.safetyCriticalFailures}`);
  lines.push(`overall: ${report.overallStatus}`);
  lines.push(`promotion eligible: ${decision.eligible ? "yes" : "no"}`);
  lines.push(`artifacts: ${outDir}`);

  if (disclosure.length > 0) {
    lines.push(`disclosure scan: FAILED (${disclosure.join(", ")})`);
    return { code: EXIT_HARD_SAFETY, lines };
  }
  if (report.hardSafetyStatus === "failed") return { code: EXIT_HARD_SAFETY, lines };
  if (report.overallStatus === "blocked") return { code: EXIT_USAGE_OR_IO, lines };
  if (report.overallStatus !== "pass") return { code: EXIT_EVALUATION_FAILURE, lines };
  // A self-test run is expected to be unpromotable; that is not a failure of
  // the run, so it exits 0 while the decision artifact records the refusal.
  if (!decision.eligible && !args.selfTest) return { code: EXIT_BLOCKED, lines };
  return { code: EXIT_PASS, lines };
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const result = main(process.argv.slice(2));
  for (const line of result.lines) {
    if (result.code === EXIT_PASS) console.log(line);
    else console.error(line);
  }
  process.exit(result.code);
}
