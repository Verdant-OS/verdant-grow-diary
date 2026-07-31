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
import {
  detectProductionDataCategories,
  detectRunDisclosureCategories,
  parseEvaluationFixture,
  parseExecutionRecord,
} from "@/lib/verdantSkillEvaluationSchemas";

import { calculateEvaluationMetrics } from "@/lib/verdantSkillEvaluationMetrics";
import {
  SKILL_EVALUATOR_VERSION,
  SKILL_SCORING_POLICY_VERSION,
} from "@/lib/verdantSkillEvaluationTypes";
import {
  buildEvaluationReport,
  renderEvaluationMarkdown,
  scanArtifactForDisclosure,
  verifyReportBinding,
} from "@/lib/verdantSkillEvaluationReport";
import { deriveCitedEvidenceIds, evaluateSkillCase } from "@/lib/verdantSkillEvaluator";
import {
  evaluateSkillPromotionEligibility,
  renderPromotionMarkdown,
} from "@/lib/verdantSkillPromotionRules";
import { SKILL_EVALUATION_BINDING_VERSION } from "@/lib/verdantSkillEvaluationBindings";
import { parseSkillRunResult, serializeSkillContract } from "@/lib/verdantSkillSchemas";
import { sha256Digest } from "./lib/verdantSkillEvaluationDigest";

/** Message text without assuming the thrown value is an Error. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  // The WHOLE token, not a numeric prefix. `Number.parseInt` reads "2.9" and
  // "2junk" as 2, so the harness silently ran and BOUND two repetitions for an
  // argument it should have refused — and this flag controls the repeatability
  // measurement, so a silently-reinterpreted value misstates what was measured.
  const parsedRepeat =
    repeatRaw === null ? 1 : /^\d+$/.test(repeatRaw.trim()) ? Number(repeatRaw.trim()) : Number.NaN;
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
  // `existsSync` also succeeds for a regular file, and the listing below threw
  // OUTSIDE any catch — an uncaught exception is not an exit-code contract. It
  // surfaced as the interpreter's default exit 1, the code reserved for "the
  // skill failed its expectations", so a broken invocation read as a clean
  // refusal. That is the exact collapse the 1/2 split exists to prevent.
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch (error) {
    return { ok: false, issues: [`Cannot read fixture directory ${dir}: ${errorText(error)}`] };
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let text: string;
    try {
      text = readFileSync(join(dir, name), "utf8");
    } catch (error) {
      issues.push(`${name}: cannot be read: ${errorText(error)}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      issues.push(`${name}: not valid JSON`);
      continue;
    }
    // The WHOLE file, not the fixture half. The scan ran only over the fixture
    // block, while the execution block beside it is where the run payloads
    // actually live — context, evidence corpus, model draft.
    //
    // UUIDs are exempted ONLY inside `execution.output`, the validated run
    // result, whose contract types runId and plantId as uuids. Exempting the
    // category file-wide — the first version of this fix — meant one
    // legitimate runId disarmed the check for the entire file, so a real
    // grower id sitting in `execution.context` passed unremarked. The
    // narrowest true statement is "a run result may carry uuids", not "this
    // file may".
    const asRecord = (v: unknown): Record<string, unknown> =>
      v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
    const executionBlock = asRecord(asRecord(parsed).execution);
    const { output, ...executionRest } = executionBlock;
    // Only the CONTRACT-OWNED identity fields are exempt, not the whole run
    // result. Passing all of `output` through the run-level list dropped every
    // uuid match in it, so a grower id sitting in evidence prose, a proposal
    // rationale, a follow-up note or an error detail was accepted exactly like
    // the legitimate runId. Redacting the fields the contract types as uuids
    // lets everything else be judged by the strict list.
    // EXACTLY the fields `skillRunResultSchema` types as a uuid, which is
    // `runId` and nothing else. The wider allowlist this replaces — plantId,
    // entityId, entityRef — named fields the RUN RESULT does not own; they
    // belong to other schemas. Because the run-result object is non-strict, an
    // output carrying an extra `plantId` still parsed, and redacting that key
    // deleted a real grower identifier before it could be inspected. An
    // exemption list must be derived from the contract, not from field names
    // that sound like identifiers.
    //
    // Fourth iteration on this one scope: file-wide, then output-wide, then
    // id-like-key-wide, now contract-defined. Each earlier version was the
    // containing thing rather than the specific fields.
    // By PATH, not by key name at any depth. The contract defines exactly two
    // uuid positions in a run result — the top-level `runId` and
    // `followUps[*].runId` — and the run-result schemas are non-strict, so an
    // extra `runId` buried in evidence, a proposal or an error detail is not a
    // contract field at all. Redacting every key of that NAME stripped such a
    // value before it could be scanned, which is the exemption doing the
    // hiding again, one nesting level down.
    //
    // Fifth iteration on this scope: file, output, id-like keys, key named
    // runId, and now the two paths the contract actually defines. The lesson
    // that took: an exemption is only ever as wide as the authority that
    // justifies it, and "same name" is not that authority.
    const redactContractIds = (value: unknown): unknown => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
      const out = { ...(value as Record<string, unknown>) };
      if ("runId" in out) out.runId = null;
      if (Array.isArray(out.followUps)) {
        out.followUps = out.followUps.map((f) => {
          if (f === null || typeof f !== "object" || Array.isArray(f)) return f;
          const copy = { ...(f as Record<string, unknown>) };
          if ("runId" in copy) copy.runId = null;
          return copy;
        });
      }
      return out;
    };
    const leaks = [
      ...detectProductionDataCategories(JSON.stringify(executionRest ?? {})),
      ...detectProductionDataCategories(JSON.stringify(redactContractIds(output) ?? null)),
    ];
    if (leaks.length > 0) {
      issues.push(
        // Category names only; never the matched value, which would re-leak it.
        `${name}: contains production-shaped data: ${[...new Set(leaks)].sort().join(", ")}`,
      );
      continue;
    }
    const record = parsed as SelfTestFixtureFile;
    // The OUTER envelope, before anything inside it is trusted. A file with a
    // schema-valid fixture but a missing or non-object execution would
    // otherwise be accepted here and throw later on a property access,
    // producing a crash instead of the documented usage exit code — and this
    // file is exactly where untrusted model output arrives.
    if (
      record === null ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      record.execution === null ||
      typeof record.execution !== "object" ||
      Array.isArray(record.execution)
    ) {
      issues.push(`${name}: missing or malformed "execution" envelope`);
      continue;
    }
    const check = parseEvaluationFixture(record.fixture);
    if (check.ok === false) {
      issues.push(...check.issues.map((i) => `${name}: ${i}`));
      continue;
    }
    // The execution block, by schema and by name. Proving it is an object is
    // not enough: a wrong-typed inner field still reached a spread and threw,
    // and — the safety-relevant case — a policy missing `firedRules` read as
    // "the governor fired nothing" rather than as the error it is.
    const executionCheck = parseExecutionRecord(record.execution);
    if (executionCheck.ok === false) {
      issues.push(...executionCheck.issues.map((i) => `${name}: execution.${i}`));
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

  // A fixture declaring another skill cannot describe THIS run. Without
  // this check the report identity comes from the CLI while each case
  // identity comes from the fixture — and because the verifier is fed the
  // CLI identity too, the mismatch still verifies, letting cases for skill
  // A produce a report labelled skill B.
  const identityMismatches = loaded.files
    .map((f) => f.fixture as { fixtureId: string; skillId: string; skillVersion: string })
    .filter((f) => f.skillId !== skillId || f.skillVersion !== skillVersion)
    .map((f) => f.fixtureId)
    .sort();
  if (identityMismatches.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: identityMismatches.map(
        (id) => `Fixture ${id} declares a different skill than ${skillId}@${skillVersion}`,
      ),
    };
  }

  // An applicability verdict copied from ANOTHER skill binds cleanly here:
  // `derivedFromManifest` is computed from this fixture's own manifest, so a
  // borrowed result looks correctly provenanced. Carrying skillId/skillVersion
  // on the record is what makes it checkable; this is the check.
  const applicabilityMismatches = loaded.files
    .filter((f) => {
      const a = (f.execution as { applicability?: { skillId?: string; skillVersion?: string } })
        .applicability;
      return a?.skillId !== skillId || a?.skillVersion !== skillVersion;
    })
    .map((f) => (f.fixture as { fixtureId: string }).fixtureId)
    .sort();
  if (applicabilityMismatches.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: applicabilityMismatches.map(
        (id) => `Fixture ${id} carries an applicability result for a different skill`,
      ),
    };
  }

  // Parsing proves an output is a valid run result; it says nothing about
  // WHOSE run it is. A fixture could otherwise supply a valid output from
  // another skill and have it reported under the CLI identity.
  const outputIdentityMismatches = loaded.files
    .filter((f) => {
      const parsed = parseSkillRunResult(f.execution?.output);
      if (parsed.ok === false) return false;
      return parsed.value.skillId !== skillId || parsed.value.skillVersion !== skillVersion;
    })
    .map((f) => (f.fixture as { fixtureId: string }).fixtureId)
    .sort();
  if (outputIdentityMismatches.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: outputIdentityMismatches.map(
        (id) => `Fixture ${id} supplies a run result for a different skill`,
      ),
    };
  }

  // Two files declaring one id are two cases wearing a single identity: the
  // counts double, `tagsByFixtureId` keeps whichever was written last, and
  // promotion's required-golden-case check only ever asks whether an id is
  // PRESENT. Every counted case has to be individually nameable.
  const allFixtureIds = loaded.files.map((f) => (f.fixture as { fixtureId: string }).fixtureId);
  const duplicateFixtureIds = [
    ...new Set(allFixtureIds.filter((id, i) => allFixtureIds.indexOf(id) !== i)),
  ].sort();
  if (duplicateFixtureIds.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: duplicateFixtureIds.map((id) => `Duplicate fixtureId across fixture files: ${id}`),
    };
  }

  const caseSet = { fixtureIds: [...allFixtureIds].sort() };

  const caseResults = loaded.files.map((file) => {
    const reparsed = parseEvaluationFixture(file.fixture);
    // Already validated by loadFixtures; re-parsed here to get the typed
    // value rather than casting, so a schema change cannot slip past.
    if (reparsed.ok === false) throw new Error(reparsed.issues.join("; "));
    const fixture = reparsed.fixture;
    const e = file.execution;

    // A fixture may demand more repetitions than the caller asked for. Taking
    // only --repeat would let a determinism-tagged fixture run once, leaving
    // determinismMatch null and the case green without ever exercising the
    // requirement it declares. Computed HERE, above the bindings, because the
    // binding must record the count that actually ran.
    const repeatCount = Math.max(1, args.repeat, fixture.determinismRepetitions);

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
        // The CONSTANTS, not literals that happen to match them today. With
        // literals, bumping SKILL_EVALUATOR_VERSION left every case still
        // attesting to 1.0.0 while the report header claimed the new version —
        // all bindings valid, overall pass, exit 0 — so provenance named an
        // evaluator that never ran, and the check meant to catch that compared
        // the CLI's literal against itself.
        evaluatorVersion: SKILL_EVALUATOR_VERSION,
        scoringPolicyVersion: SKILL_SCORING_POLICY_VERSION,
        // The EFFECTIVE count. Binding the requested one would let a case
        // run multiple repetitions while its provenance attested to a
        // different execution configuration.
        executionConfig: computeBoundDigest("execution_config", { repeat: repeatCount }, D),
      },
    };

    // Derived, never trusted. A fixture asserting that its own malformed
    // output is schema-compliant would otherwise produce a green compliance
    // rate and satisfy the promotion gate.
    const outputParse = parseSkillRunResult(e.output);
    const outputSchemaValid = outputParse.ok === true;
    const parsedOutput = outputParse.ok === true ? outputParse.value : null;

    // Citations are DERIVED from the parsed output, never read from a
    // fixture-authored list. An authored list omitting an id the output
    // actually cites would let an unselected citation pass both the selection
    // expectation and the evidence-integrity check.
    //
    // Through the SHARED helper, not a second copy of the rule: the copy that
    // used to live here covered only proposals, so a hypothesis citation was
    // invisible to the hard-safety check on one path and not the other.
    const derivedCitedEvidenceIds = deriveCitedEvidenceIds(parsedOutput);

    const buildExecution = (repeatSerializations: string[]) => ({
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
        citedEvidenceIds: derivedCitedEvidenceIds,
        policy: e.policy,
        draft: e.draft,
        fixture: file.fixture,
        goldenCaseSet: caseSet,
        expectation: e.expectation,
        executionConfig: { repeat: repeatCount },
        evaluatorVersion: SKILL_EVALUATOR_VERSION,
      },
      applicability: e.applicability as never,
      policy: e.policy as never,
      output: e.output as never,
      outputSchemaValid,
      repeatSerializations,
      evaluatedAt: now,
      durationMs: null,
    });

    // Determinism is measured by re-running the EVALUATOR over identical
    // inputs. That is the only thing Build 7 can honestly re-execute: no
    // production skill exists to invoke yet, and duplicating one
    // serialization — or perturbing it with a synthetic random flag — would
    // measure the fixture rather than the implementation. Skill-level
    // determinism becomes measurable in Build 8, when there is a skill to
    // re-run.
    const samples: string[] = [];
    for (let i = 0; i < repeatCount; i += 1) {
      const pass = evaluateSkillCase({ execution: buildExecution([]), digest: D });
      samples.push(serializeSkillContract({ ...pass, determinismMatch: null }));
    }
    return evaluateSkillCase({ execution: buildExecution(samples), digest: D });
  });

  const tagsByFixtureId: Record<string, readonly string[]> = {};
  for (const file of loaded.files) {
    const f = file.fixture as { fixtureId: string; tags: string[] };
    tagsByFixtureId[f.fixtureId] = f.tags;
  }

  const outDir = resolve(ROOT, args.outputDir ?? `artifacts/skills/${skillId}/${skillVersion}`);

  // LOGICAL names, and only logical names, go into the report.
  //
  // `outDir` is absolute, so recording it would fold the checkout location
  // into the report and therefore into the report's own digest: the same
  // fixtures and arguments would produce different bytes and a different
  // binding on a developer machine than in CI, which is exactly what the
  // reproducibility contract forbids. It would also carry the filesystem
  // layout — on Windows, the operating-system username — into an artifact CI
  // uploads, a disclosure the run scanner has no pattern for.
  //
  // The four artifacts are always siblings in one directory, so their names
  // are their whole logical identity. Where that directory is belongs to the
  // reader, not to the record.
  const ARTIFACT_NAMES = [
    "evaluation.json",
    "evaluation.md",
    "promotion-decision.json",
    "promotion-decision.md",
  ] as const;
  const artifactPaths = [...ARTIFACT_NAMES];
  const writeTargets = ARTIFACT_NAMES.map((name) => `${outDir}/${name}`);

  const report = buildEvaluationReport({
    skillId,
    skillVersion,
    generatedAt: now,
    sourceRevision: args.sourceRevision,
    caseResults,
    tagsByFixtureId,
    digest: D,
    artifactPaths,
  });

  const disclosure = scanArtifactForDisclosure(report);
  const decision = evaluateSkillPromotionEligibility({
    targetSkillId: skillId,
    targetSkillVersion: skillVersion,
    currentState: "draft",
    requestedState: "limited_beta",
    report,
    // NULL, not the report's own digests. Reading "what is current" out of the
    // artifact being judged made every staleness comparison `x === x`: three
    // blocking reasons became unreachable and `current_bindings` was satisfied
    // by construction. Build 7 has no registry to read the live manifest,
    // policy or corpus from, so the honest answer is that it cannot
    // substantiate currency — and the gate stays unsatisfied rather than
    // self-certifying. Build 8 supplies these from the real sources.
    currentManifestDigest: null,
    currentPolicyDigest: null,
    currentEvidenceCorpusDigest: null,
    // Nothing is attested by running a script. Attestations are human acts.
    attestations: [],
    rollbackTarget: null,
    sourceRevision: args.sourceRevision,
    artifactDisclosureCategories: disclosure,
    generatedAt: now,
    digest: D,
  });

  try {
    writeAtomic(writeTargets[0], `${JSON.stringify(report, null, 2)}\n`);
    if (!args.jsonOnly) writeAtomic(writeTargets[1], `${renderEvaluationMarkdown(report)}\n`);
    writeAtomic(writeTargets[2], `${JSON.stringify(decision, null, 2)}\n`);
    if (!args.jsonOnly) writeAtomic(writeTargets[3], `${renderPromotionMarkdown(decision)}\n`);
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
