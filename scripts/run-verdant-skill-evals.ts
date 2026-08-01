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
import type { VerdantSkillEvaluationFixture } from "@/lib/verdantSkillEvaluationSchemas";

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
  RISK_FLOOR_BY_INTERVENTION_CLASS,
  V1_MAX_ALLOWED_RISK,
} from "@/lib/verdantSkillPolicyGovernor";
import {
  AGGRESSIVE_IRRIGATION_PATTERNS,
  AGGRESSIVE_NUTRIENT_PATTERNS,
  deriveInterventionClass,
  scanProseForPatterns,
} from "@/lib/aiOutputTextSafetyDetectors";
import {
  evaluateSkillPromotionEligibility,
  renderPromotionMarkdown,
} from "@/lib/verdantSkillPromotionRules";
import { SKILL_EVALUATION_BINDING_VERSION } from "@/lib/verdantSkillEvaluationBindings";
import {
  SKILL_RISK_LEVELS,
  parseSkillRunResult,
  serializeSkillContract,
} from "@/lib/verdantSkillSchemas";
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
  /**
   * The PARSED fixture, kept from the single validation in `loadFixtures`.
   *
   * The schema trims, so the raw and parsed identities can differ — and every
   * site that reached for `fixture.fixtureId` directly was reading the raw one
   * while the case results carried the parsed one. Fixing that site by site
   * produced a duplicate guard on parsed ids and a tag map on raw ones, which
   * silently dropped a case from `casesByTag`. Parsing once and carrying the
   * result removes the divergence instead of tracking it.
   */
  parsed: VerdantSkillEvaluationFixture;
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
    // ...and only when the value actually IS a uuid. Blanking whatever sits at
    // `runId` meant a fixture carrying `runId: "sk_live_..."` or a bearer token
    // had that value removed BEFORE the production-data scan ran; the later
    // schema failure reports an invalid run result without naming or removing
    // the secret sitting in a committed file. An exemption conditioned on a
    // field NAME rather than on the value's shape exempts whatever is put
    // there. Sixth iteration on this one scope, and the first that checks what
    // it is exempting.
    const CONTRACT_UUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const redactIfUuid = (v: unknown): unknown =>
      typeof v === "string" && CONTRACT_UUID.test(v) ? null : v;
    const redactContractIds = (value: unknown): unknown => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
      const out = { ...(value as Record<string, unknown>) };
      if ("runId" in out) out.runId = redactIfUuid(out.runId);
      if (Array.isArray(out.followUps)) {
        out.followUps = out.followUps.map((f) => {
          if (f === null || typeof f !== "object" || Array.isArray(f)) return f;
          const copy = { ...(f as Record<string, unknown>) };
          if ("runId" in copy) copy.runId = redactIfUuid(copy.runId);
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
    // The run result names the context version it ran against; the bound
    // context names itself. Checked HERE, in the preflight, because throwing
    // from inside the case-building map escapes `main()` and terminates with
    // the interpreter's status — the exact exit-code collapse the 1/2 split
    // exists to prevent, which I had already fixed once on another path.
    const ctxBound = (record.execution.context as { contextVersion?: unknown })?.contextVersion;
    const ctxOutput = (record.execution.output as { contextVersion?: unknown })?.contextVersion;
    if (typeof ctxOutput === "string" && ctxBound !== ctxOutput) {
      issues.push(
        `${name}: run result names context ${ctxOutput} but was bound to ${String(ctxBound)}`,
      );
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
    // A verdict must be ABOUT a proposal the output actually contains, and
    // every proposal must have been judged. Carrying a proposalId is only half
    // the check — an id nothing correlates is the "declared but never
    // compared" shape this build keeps finding. Membership is verified in both
    // directions because either gap is a decision the governor could not have
    // produced for the recorded output.
    const execPolicy = record.execution.policy as {
      proposalVerdicts: {
        proposalId: string;
        verdict: string;
        effectiveRiskLevel: string;
        executionCapability: string;
      }[];
    };
    const execOutput = record.execution.output as { proposals?: unknown };
    const outputProposalIds = new Set(
      (Array.isArray(execOutput?.proposals) ? execOutput.proposals : [])
        .map((p) => (p as { proposalId?: unknown })?.proposalId)
        .filter((id): id is string => typeof id === "string"),
    );
    // Duplicates FIRST: collapsing to a Set erased them, so an `allow` and a
    // `block` for the same proposal passed membership and still drove the
    // derived eligibility. The governor emits exactly one verdict per
    // proposal.
    const verdictIdList = execPolicy.proposalVerdicts.map((v) => v.proposalId);
    const duplicateVerdictIds = [
      ...new Set(verdictIdList.filter((id, i) => verdictIdList.indexOf(id) !== i)),
    ].sort();
    if (duplicateVerdictIds.length > 0) {
      issues.push(
        `${name}: more than one policy verdict for proposal(s): ${duplicateVerdictIds.join(", ")}`,
      );
      continue;
    }
    // Correlating IDS was only half of it: the VALUES have to agree too. The
    // governor computes `effectiveRiskLevel = max(declared, derivedFloor)`, so
    // an effective risk BELOW the proposal's declared risk is a decision it
    // cannot produce — and the evaluator reads only the recorded effective
    // risk, so a "high" proposal paired with a fabricated "low" allow verdict
    // rode through as a green must_act case that V1 would have blocked.
    const riskRank = (level: unknown): number =>
      (SKILL_RISK_LEVELS as readonly string[]).indexOf(String(level));
    const proposalRisk = new Map(
      (Array.isArray(execOutput?.proposals) ? execOutput.proposals : []).map((p) => [
        (p as { proposalId?: string })?.proposalId,
        (p as { riskLevel?: string })?.riskLevel,
      ]),
    );
    // The DERIVED floor, not only the declared level.
    //
    // Comparing against `proposal.riskLevel` alone checked what the model said
    // about itself. The governor raises that floor from the intervention class
    // it reads out of the proposed action and from floor-raising prose, so an
    // aggressive nutrient proposal declaring `low` with an allow verdict at
    // `low` satisfied both earlier checks while the governor would have
    // derived at least `medium` and V1 would have blocked the action.
    //
    // Reusing the governor's own table and detectors, not a copy. The
    // STAGE-gated part of its floor needs a real PlantContextCompilation,
    // which these fixtures deliberately stub, so this reproduces the
    // context-independent floor and Build 8 — which will have the compilation
    // — can regenerate the decision outright and drop this entirely.
    const derivedFloorFor = (p: Record<string, unknown>): string => {
      const action = typeof p?.proposedAction === "string" ? p.proposedAction : "";
      const reason = typeof p?.reason === "string" ? p.reason : "";
      let floor = RISK_FLOOR_BY_INTERVENTION_CLASS[deriveInterventionClass(action)];
      const prose = `${action} ${reason}`;
      if (
        scanProseForPatterns(prose, AGGRESSIVE_NUTRIENT_PATTERNS) ||
        scanProseForPatterns(prose, AGGRESSIVE_IRRIGATION_PATTERNS)
      ) {
        floor = riskRank(floor) >= riskRank("medium") ? floor : "medium";
      }
      return floor;
    };
    const proposalById = new Map(
      (Array.isArray(execOutput?.proposals) ? execOutput.proposals : []).map((p) => [
        (p as { proposalId?: string })?.proposalId,
        p as Record<string, unknown>,
      ]),
    );
    const belowDerivedFloor = execPolicy.proposalVerdicts
      .filter((v) => {
        const p = proposalById.get(v.proposalId);
        if (p === undefined) return false;
        return riskRank(v.effectiveRiskLevel) < riskRank(derivedFloorFor(p));
      })
      .map((v) => v.proposalId)
      .sort();
    if (belowDerivedFloor.length > 0) {
      issues.push(
        `${name}: verdict effective risk is below the floor the governor derives for: ${belowDerivedFloor.join(", ")}`,
      );
      continue;
    }

    const understatedRisk = execPolicy.proposalVerdicts
      .filter((v) => {
        const declared = proposalRisk.get(v.proposalId);
        if (declared === undefined) return false;
        return (
          riskRank((v as { effectiveRiskLevel?: string }).effectiveRiskLevel) < riskRank(declared)
        );
      })
      .map((v) => v.proposalId)
      .sort();
    if (understatedRisk.length > 0) {
      issues.push(
        `${name}: verdict effective risk is below the proposal's declared risk for: ${understatedRisk.join(", ")}`,
      );
      continue;
    }
    // And the CEILING, not only the floor. Round 17 rejected understatement
    // and left the other end open: a `high` proposal with an ALLOW verdict at
    // `high` satisfied the floor rule, yet V1 permits action only at low risk,
    // so the governor cannot emit it. The floor and the ceiling are different
    // rules — one says a verdict may not understate its proposal, the other
    // says V1 does not act on risk at all above `low` — and fixing one
    // direction is not fixing the invariant.
    //
    // Only ALLOW verdicts are capped. A block verdict at critical risk is the
    // governor working correctly.
    const overCeiling = execPolicy.proposalVerdicts
      .filter(
        (v) =>
          v.verdict === "allow" &&
          riskRank((v as { effectiveRiskLevel?: string }).effectiveRiskLevel) >
            riskRank(V1_MAX_ALLOWED_RISK),
      )
      .map((v) => v.proposalId)
      .sort();
    if (overCeiling.length > 0) {
      issues.push(
        `${name}: allowed verdict above the V1 risk ceiling (${V1_MAX_ALLOWED_RISK}) for: ${overCeiling.join(", ")}`,
      );
      continue;
    }

    // Capability too. The governor COPIES the proposal's executionCapability
    // into its verdict, so a `manual_only` proposal whose allow verdict records
    // `none` is a decision it cannot emit — and the eligibility refinement then
    // derives actionEligibility "none" from the forged verdict, letting a
    // safety-critical must_abstain case pass. Id, risk and capability: the
    // three things the governor carries across, correlated together.
    const proposalCapability = new Map(
      (Array.isArray(execOutput?.proposals) ? execOutput.proposals : []).map((p) => [
        (p as { proposalId?: string })?.proposalId,
        (p as { executionCapability?: string })?.executionCapability,
      ]),
    );
    const capabilityMismatch = execPolicy.proposalVerdicts
      .filter((v) => {
        const declared = proposalCapability.get(v.proposalId);
        return declared !== undefined && declared !== v.executionCapability;
      })
      .map((v) => v.proposalId)
      .sort();
    if (capabilityMismatch.length > 0) {
      issues.push(
        `${name}: verdict execution capability disagrees with the proposal for: ${capabilityMismatch.join(", ")}`,
      );
      continue;
    }

    const verdictIds = new Set(verdictIdList);
    const unattached = [...verdictIds].filter((id) => !outputProposalIds.has(id)).sort();
    const unjudged = [...outputProposalIds].filter((id) => !verdictIds.has(id)).sort();
    if (unattached.length > 0 || unjudged.length > 0) {
      if (unattached.length > 0) {
        issues.push(
          `${name}: policy verdicts for proposals absent from the output: ${unattached.join(", ")}`,
        );
      }
      if (unjudged.length > 0) {
        issues.push(`${name}: output proposals with no policy verdict: ${unjudged.join(", ")}`);
      }
      continue;
    }
    files.push({ ...record, parsed: check.fixture });
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
    .map((f) => f.parsed)
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
    .map((f) => f.parsed.fixtureId)
    .sort();
  if (applicabilityMismatches.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: applicabilityMismatches.map(
        (id) => `Fixture ${id} carries an applicability result for a different skill`,
      ),
    };
  }

  // A manifest naming another skill cannot govern THIS run. Its digest is what
  // the report publishes as `manifestBinding` and what a later caller compares
  // for currency, so a foreign one is not stale evidence — it is evidence
  // about a different skill. Verified end to end before this check existed:
  // swapping every fixture's manifest for a competitor's produced exit 0,
  // 14/14 bindingValid, and the foreign digest rendered as the provenance row
  // under the title "harness-self-test@1.0.0".
  //
  // `skill_id_mismatch` exists in the binding vocabulary and could never fire
  // here, because both sides of that comparison are filled from the same CLI
  // locals — the "declared but never emitted" shape again.
  const manifestMismatches = loaded.files
    .filter((f) => {
      const m = (f.execution as { manifest?: { id?: string; version?: string } }).manifest;
      return m?.id !== skillId || m?.version !== skillVersion;
    })
    .map((f) => f.parsed.fixtureId)
    .sort();
  if (manifestMismatches.length > 0) {
    return {
      code: EXIT_USAGE_OR_IO,
      lines: manifestMismatches.map(
        (id) => `Fixture ${id} records a manifest for a different skill`,
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
    .map((f) => f.parsed.fixtureId)
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
  // The PARSED id, not the raw one. The schema trims, so a raw
  // "hst-003-expected-abstention " with a trailing space is a distinct string
  // here and the same identity everywhere downstream — which defeated this
  // very guard and put two case results under one name.
  const allFixtureIds = loaded.files.map((f) => f.parsed.fixtureId);
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
    const fixture = file.parsed;
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
    tagsByFixtureId[file.parsed.fixtureId] = file.parsed.tags;
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
