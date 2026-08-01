/**
 * Evaluation harness CLI (Build 7, commit 3).
 *
 * Exit codes are a contract other tools depend on, so they are pinned here.
 * The important distinction: a broken invocation (2) must never read as a
 * clean refusal (1 or 4), and a hard safety failure (3) must never read as an
 * ordinary scoring miss.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { computeBoundDigest } from "@/lib/verdantSkillEvaluationBindings";
import {
  EXIT_BLOCKED,
  EXIT_EVALUATION_FAILURE,
  EXIT_HARD_SAFETY,
  EXIT_PASS,
  EXIT_USAGE_OR_IO,
  main,
  parseCliArgs,
} from "../../scripts/run-verdant-skill-evals";
import { verifyReportBinding } from "@/lib/verdantSkillEvaluationReport";
import { sha256Digest } from "../../scripts/lib/verdantSkillEvaluationDigest";

const NOW = "2026-08-01T00:00:00.000Z";

function outDir(): string {
  return mkdtempSync(join(tmpdir(), "verdant-eval-"));
}

function selfTest(extra: string[] = [], out = outDir()) {
  const result = main(["--self-test", "--now", NOW, "--output-dir", out, ...extra]);
  return { result, out };
}

describe("cli — argument contract", () => {
  it("parses flags without a parser dependency", () => {
    const args = parseCliArgs(["--skill-id", "x", "--repeat", "3", "--self-test"]);
    expect(args.skillId).toBe("x");
    expect(args.repeat).toBe(3);
    expect(args.selfTest).toBe(true);
    expect(args.jsonOnly).toBe(false);
  });

  it("rejects a non-numeric repeat rather than silently defaulting", () => {
    expect(main(["--self-test", "--now", NOW, "--repeat", "many"]).code).toBe(EXIT_USAGE_OR_IO);
  });

  it("rejects a numeric PREFIX, not just a wholly non-numeric value", () => {
    // parseInt reads "2.9" and "2junk" as 2, so the harness silently ran AND
    // BOUND two repetitions for an argument it should have refused — and this
    // flag controls the repeatability measurement, so a silently
    // reinterpreted value misstates what was measured.
    for (const bad of ["2.9", "2junk", " 2 x", "0x3", "1e2", "-1", "0", ""]) {
      expect(parseCliArgs(["--repeat", bad]).repeat, bad).toBeNaN();
    }
  });

  it("still accepts a plain positive integer", () => {
    for (const good of ["1", "3", "16"]) {
      expect(parseCliArgs(["--repeat", good]).repeat, good).toBe(Number(good));
    }
    // Absent means one run.
    expect(parseCliArgs([]).repeat).toBe(1);
  });

  it("requires a skill identity when not self-testing", () => {
    expect(main(["--now", NOW]).code).toBe(EXIT_USAGE_OR_IO);
  });

  it("requires an injected clock so artifacts are reproducible", () => {
    // No fallback to a real clock: an artifact whose timestamp depends on
    // when it ran cannot be compared across runs.
    expect(main(["--self-test"]).code).toBe(EXIT_USAGE_OR_IO);
  });

  it("reports a missing fixture directory as a usage error, not a failure", () => {
    const r = main(["--skill-id", "ghost", "--skill-version", "1.0.0", "--now", NOW]);
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("not found");
  });

  it("reports an unreadable fixture directory as a usage error, not a crash", () => {
    // existsSync also succeeds for a regular FILE, and the directory listing
    // threw outside any catch. An uncaught exception is not an exit-code
    // contract: it surfaced as the interpreter's exit 1, the code reserved for
    // "the skill failed its expectations", so a broken invocation read as a
    // clean refusal.
    const r = main([
      "--skill-id",
      "harness-self-test",
      "--skill-version",
      "1.0.0",
      "--now",
      NOW,
      "--fixture-dir",
      resolve(__dirname, "../../fixtures/skills/harness-self-test/v1/hst-001-happy-path.json"),
    ]);
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("Cannot read fixture directory");
  });
});

describe("cli — untrusted fixture input", () => {
  const SOURCE = resolve(
    __dirname,
    "../../fixtures/skills/harness-self-test/v1/hst-001-happy-path.json",
  );

  /** Writes one mutated fixture into a throwaway directory and runs the CLI. */
  function runWithMutated(mutate: (record: Record<string, unknown>) => void) {
    const dir = mkdtempSync(join(tmpdir(), "verdant-eval-fx-"));
    const out = outDir();
    try {
      const record = JSON.parse(readFileSync(SOURCE, "utf8")) as Record<string, unknown>;
      mutate(record);
      writeFileSync(join(dir, "case.json"), JSON.stringify(record), "utf8");
      return main([
        "--skill-id",
        "harness-self-test",
        "--skill-version",
        "1.0.0",
        "--now",
        NOW,
        "--fixture-dir",
        dir,
        "--output-dir",
        out,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  }

  // The fixture inside the envelope is schema-checked; the envelope AROUND it
  // was not. A malformed one used to reach property access and throw, which
  // surfaces as a crash rather than the documented usage exit code — and this
  // is precisely the file that carries untrusted model output.
  it("rejects a missing execution envelope as a usage error, not a crash", () => {
    const r = runWithMutated((record) => {
      delete record.execution;
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("execution");
  });

  it("rejects a non-object execution envelope", () => {
    for (const value of ["not-an-object", 7, null, [], true]) {
      const r = runWithMutated((record) => {
        record.execution = value;
      });
      expect(r.code, JSON.stringify(value)).toBe(EXIT_USAGE_OR_IO);
    }
  });

  // `output` is typed SkillRunResult but reaches the evaluator through a cast:
  // schema validity is REPORTED, not enforced. A wrong-typed collection is
  // present rather than nullish, so `?? []` does not catch it, and the
  // evaluator used to reach `.flatMap` on an object and throw — a crash
  // instead of the documented output_schema_invalid result it already knows
  // how to produce.
  it("survives a wrong-typed collection in an untrusted run output", () => {
    for (const shape of [{}, "proposals", 42, true]) {
      const r = runWithMutated((record) => {
        (record.execution as { output: Record<string, unknown> }).output.proposals = shape;
      });
      // Not a throw, and not exit 2 either: the file is well-formed, the
      // OUTPUT is not. That is an evaluation result, not a usage error.
      expect(r.code, JSON.stringify(shape)).not.toBe(EXIT_USAGE_OR_IO);
      expect([EXIT_EVALUATION_FAILURE, EXIT_HARD_SAFETY], JSON.stringify(shape)).toContain(r.code);
    }
  });

  // Proving `execution` is an object was never enough. A wrong-typed inner
  // field still reached a spread and threw, so a malformed fixture surfaced as
  // a crash with the interpreter's exit 1 — the code reserved for "the skill
  // failed its expectations" — instead of the documented exit 2.
  it("rejects wrong-typed inner execution fields by name", () => {
    const cases: [string, unknown][] = [
      ["selectedEvidenceIds", 42],
      ["selectedEvidenceIds", {}],
      ["evidenceRegistryVersion", 7],
      ["policyVersion", null],
      ["context", "not-an-object"],
    ];
    for (const [key, value] of cases) {
      const r = runWithMutated((record) => {
        (record.execution as Record<string, unknown>)[key] = value;
      });
      expect(r.code, key).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), key).toContain(key);
    }
  });

  // The safety-relevant case, and the reason these collections are REQUIRED
  // rather than defaulted: every downstream read was `?? []`, so an ABSENT key
  // was indistinguishable from an empty one. The only equipment-control check
  // in the build reads policy.firedRules, which meant a policy object missing
  // that key read as "the governor fired nothing".
  it("refuses a policy whose safety-relevant collection is absent, not empty", () => {
    for (const key of ["firedRules", "outcomes", "actionEligibility"]) {
      const r = runWithMutated((record) => {
        const execution = record.execution as { policy: Record<string, unknown> };
        delete execution.policy[key];
      });
      expect(r.code, key).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), key).toContain(key);
    }
  });

  it("refuses an unrecognised execution key rather than ignoring it", () => {
    const r = runWithMutated((record) => {
      (record.execution as Record<string, unknown>).sneakyExtra = true;
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
  });

  // The production-data scan ran over the fixture block only, while the
  // execution block beside it is where the run payloads live.
  it("scans the execution half for production-shaped data, not just the fixture half", () => {
    const r = runWithMutated((record) => {
      (record.execution as { context: Record<string, unknown> }).context.owner =
        "grower@example.com";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    const printed = r.lines.join(" ");
    expect(printed).toContain("email_address");
    // The CATEGORY, never the matched value — reporting it would re-leak it.
    expect(printed).not.toContain("grower@example.com");
  });

  // Requiring firedRules to BE an array stopped an absent collection reading
  // as an empty one, but left every element `unknown`, so [null] was still
  // accepted — and the equipment-control filter dereferences r.code, throwing
  // on a null element instead of returning the documented exit 2. A collection
  // is only validated when its contents are.
  it("rejects malformed entries inside a fired-rule list", () => {
    for (const rules of [[null], [42], ["device_control_instruction"], [{}], [{ code: "" }]]) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy.firedRules = rules;
      });
      expect(r.code, JSON.stringify(rules)).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), JSON.stringify(rules)).toContain("firedRules");
    }
  });

  it("rejects malformed entries inside a proposal-verdict list", () => {
    for (const verdicts of [[null], [42], ["allow"], [{}], {}]) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy.proposalVerdicts =
          verdicts;
      });
      expect(r.code, JSON.stringify(verdicts)).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), JSON.stringify(verdicts)).toContain("proposalVerdicts");
    }
  });

  // The UUID exemption belongs to the validated run result alone. Exempting
  // the category file-wide meant one legitimate runId disarmed the check for
  // the whole file, so a real grower id in execution.context passed unremarked.
  it("flags a production uuid in the execution record but not in the run result", () => {
    const leaked = runWithMutated((record) => {
      (record.execution as { context: Record<string, unknown> }).context.plantId =
        "7f3d9a2b-1c4e-4f8a-9b2d-5e6f7a8b9c0d";
    });
    expect(leaked.code).toBe(EXIT_USAGE_OR_IO);
    expect(leaked.lines.join(" ")).toContain("real_uuid");

    // The unmodified fixture's own output carries contract uuids and must
    // still load — otherwise the check would reject every valid run.
    const clean = runWithMutated(() => {});
    expect(clean.code).not.toBe(EXIT_USAGE_OR_IO);
  });

  // Validating `verdict` alone let [{verdict:"allow"}] load, put undefined
  // into actualRiskLevels/actualCapabilities, and stay green wherever the
  // matching fixture expectation happened to be null — an expectation
  // silently unchecked rather than loudly unmet.
  it("requires every verdict field the evaluator reads", () => {
    for (const verdict of [
      { verdict: "allow" },
      { verdict: "allow", effectiveRiskLevel: "low" },
      { verdict: "allow", executionCapability: "none" },
      { verdict: "allow", effectiveRiskLevel: "nonsense", executionCapability: "none" },
    ]) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy.proposalVerdicts = [
          verdict,
        ];
      });
      expect(r.code, JSON.stringify(verdict)).toBe(EXIT_USAGE_OR_IO);
    }
  });

  // The exemption belongs to the contract's OWN identity fields. Passing all
  // of `output` through the run-level list dropped every uuid match in it, so
  // a grower id in evidence prose was accepted exactly like the runId.
  it("flags a production uuid in run-result prose but not in a contract id field", () => {
    const inProse = runWithMutated((record) => {
      const output = (record.execution as { output: Record<string, unknown> }).output;
      (output.evidence as Record<string, unknown>[])[0].summary =
        "Matches grow 7f3d9a2b-1c4e-4f8a-9b2d-5e6f7a8b9c0d.";
    });
    expect(inProse.code).toBe(EXIT_USAGE_OR_IO);
    expect(inProse.lines.join(" ")).toContain("real_uuid");

    // The contract types runId as a uuid, so the untouched fixture must load.
    expect(runWithMutated(() => {}).code).not.toBe(EXIT_USAGE_OR_IO);
  });

  // The exemption is exactly the fields the CONTRACT types as uuid, which is
  // runId alone. The wider allowlist named fields the run result does not own,
  // and because the run-result object is non-strict an extra plantId still
  // parsed — so redacting that key deleted a real grower id before inspection.
  it("does not exempt an id-shaped key the run-result contract does not own", () => {
    for (const field of ["plantId", "entityId", "growId"]) {
      const r = runWithMutated((record) => {
        (record.execution as { output: Record<string, unknown> }).output[field] =
          "7f3d9a2b-1c4e-4f8a-9b2d-5e6f7a8b9c0d";
      });
      expect(r.code, field).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), field).toContain("real_uuid");
    }
  });

  it("rejects policy values outside the contract vocabularies", () => {
    const cases: [string, unknown][] = [
      ["outcomes", ["bogus"]],
      ["actionEligibility", "manual"],
      ["actionEligibility", ""],
    ];
    for (const [key, value] of cases) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy[key] = value;
      });
      expect(r.code, `${key}=${JSON.stringify(value)}`).toBe(EXIT_USAGE_OR_IO);
    }
  });

  it("rejects an applicability verdict outside the contract vocabulary", () => {
    const r = runWithMutated((record) => {
      (record.execution as { applicability: Record<string, unknown> }).applicability.verdict =
        "definitely-applicable";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
  });

  // A verdict copied from another skill binds cleanly: derivedFromManifest is
  // computed from THIS fixture's manifest, so the borrowed record looks
  // correctly provenanced. Carrying the identity is what makes it checkable.
  it("rejects an applicability result belonging to a different skill", () => {
    for (const patch of [{ skillId: "other-skill" }, { skillVersion: "2.0.0" }]) {
      const r = runWithMutated((record) => {
        Object.assign(
          (record.execution as { applicability: Record<string, unknown> }).applicability,
          patch,
        );
      });
      expect(r.code, JSON.stringify(patch)).toBe(EXIT_USAGE_OR_IO);
    }
  });

  it("requires the applicability record to say whose verdict it is", () => {
    for (const field of ["skillId", "skillVersion"]) {
      const r = runWithMutated((record) => {
        delete (record.execution as { applicability: Record<string, unknown> }).applicability[
          field
        ];
      });
      expect(r.code, field).toBe(EXIT_USAGE_OR_IO);
    }
  });

  it("rejects a proposal verdict outside the governor vocabulary", () => {
    for (const verdict of ["bogus", "ALLOW", "permit"]) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy.proposalVerdicts = [
          { verdict, effectiveRiskLevel: "low", executionCapability: "none" },
        ];
      });
      expect(r.code, verdict).toBe(EXIT_USAGE_OR_IO);
    }
  });

  // The contract defines exactly two uuid positions in a run result. An extra
  // `runId` buried in evidence or a proposal is not a contract field, and
  // redacting every key of that NAME stripped it before it could be scanned —
  // the exemption doing the hiding, one nesting level down.
  it("does not exempt a runId nested outside the contract's own paths", () => {
    const r = runWithMutated((record) => {
      const output = (record.execution as { output: Record<string, unknown> }).output;
      (output.evidence as Record<string, unknown>[])[0].runId =
        "7f3d9a2b-1c4e-4f8a-9b2d-5e6f7a8b9c0d";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("real_uuid");
  });

  it("still exempts the two runId paths the contract defines", () => {
    // Guards the guard: the top-level runId is a real contract uuid, and a
    // followUps[*].runId is too. Neither may trip the scan.
    const r = runWithMutated((record) => {
      const output = (record.execution as { output: Record<string, unknown> }).output;
      output.followUps = [
        {
          followUpId: "fu-1",
          runId: "00000000-0000-4000-8000-000000000099",
          proposalId: null,
          checkAfterHours: 24,
          question: "Check runoff tomorrow?",
          expectedObservation: "runoff EC",
        },
      ];
    });
    expect(r.code).not.toBe(EXIT_USAGE_OR_IO);
  });

  // Two files declaring one id are two cases wearing a single identity: counts
  // double, tags keep whichever was written last, and promotion's
  // required-golden-case check only ever asks whether an id is PRESENT.
  it("rejects two fixture files declaring the same id", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdant-eval-dup-"));
    const out = outDir();
    try {
      const record = readFileSync(SOURCE, "utf8");
      writeFileSync(join(dir, "a.json"), record, "utf8");
      writeFileSync(join(dir, "b.json"), record, "utf8");
      const r = main([
        "--skill-id",
        "harness-self-test",
        "--skill-version",
        "1.0.0",
        "--now",
        NOW,
        "--fixture-dir",
        dir,
        "--output-dir",
        out,
      ]);
      expect(r.code).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" ")).toContain("Duplicate fixtureId");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  // A schema-valid proposal, so a verdict can be ABOUT something. The
  // correlation check requires every verdict to name a proposal the output
  // contains and every proposal to have been judged.
  const PROPOSAL = {
    proposalId: "p-1",
    proposedAction: "Take a runoff reading before the next irrigation.",
    reason: "Substrate moisture is drifting downward.",
    riskLevel: "low",
    supportingEvidenceIds: ["ev-1"],
    missingInformation: [],
    expectedResponse: "Runoff EC stabilises.",
    followUpIntervalHours: 24,
    cancellationConditions: ["Runoff EC rises above target."],
    approvalRequirement: "approval_required",
    executionCapability: "manual_only",
  };
  const verdictFor = (executionCapability: string) => ({
    proposalId: "p-1",
    verdict: "allow",
    effectiveRiskLevel: "low",
    executionCapability,
  });

  // The governor derives eligibility FROM the verdicts, so the two cannot
  // disagree in anything it emits. It mattered because the evaluator reads
  // abstention from actionEligibility alone.
  it("rejects an action eligibility that contradicts its own verdicts", () => {
    // A verdict allowing manual_only while eligibility says "none".
    const contradicting = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      const policy = execution.policy as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      policy.proposalVerdicts = [verdictFor("manual_only")];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "none";
    });
    expect(contradicting.code).toBe(EXIT_USAGE_OR_IO);
    expect(contradicting.lines.join(" ")).toContain("actionEligibility");

    // And the other direction: eligibility claims action with no allowed
    // manual_only verdict to justify it.
    const overclaiming = runWithMutated((record) => {
      const policy = (record.execution as { policy: Record<string, unknown> }).policy;
      policy.proposalVerdicts = [];
      policy.actionEligibility = "low_risk_manual_only";
    });
    expect(overclaiming.code).toBe(EXIT_USAGE_OR_IO);
    expect(overclaiming.lines.join(" ")).toContain("actionEligibility");
  });

  it("accepts the two consistent eligibility pairings", () => {
    // Guards the guard: an invariant rejecting both directions would pass the
    // test above while breaking every real run.
    const abstaining = runWithMutated((record) => {
      const policy = (record.execution as { policy: Record<string, unknown> }).policy;
      policy.proposalVerdicts = [];
      policy.actionEligibility = "none";
    });
    expect(abstaining.code).not.toBe(EXIT_USAGE_OR_IO);

    const acting = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      const policy = execution.policy as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      policy.proposalVerdicts = [verdictFor("manual_only")];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "low_risk_manual_only";
    });
    expect(acting.code).not.toBe(EXIT_USAGE_OR_IO);
  });

  // Carrying a proposalId is only half the check — an id nothing correlates is
  // the "declared but never compared" shape this build keeps finding.
  it("rejects a verdict for a proposal the output does not contain", () => {
    const r = runWithMutated((record) => {
      const policy = (record.execution as { policy: Record<string, unknown> }).policy;
      policy.proposalVerdicts = [verdictFor("none")];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "none";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("absent from the output");
  });

  it("rejects an output proposal that no verdict judged", () => {
    const r = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      (execution.policy as Record<string, unknown>).proposalVerdicts = [];
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("no policy verdict");
  });

  // Verified end to end before this check existed: swapping every fixture's
  // manifest for a competitor's produced exit 0, 14/14 bindingValid, and the
  // FOREIGN digest rendered as the provenance row under the title
  // "harness-self-test@1.0.0". `skill_id_mismatch` existed in the binding
  // vocabulary and could never fire, because both sides of that comparison
  // come from the same CLI locals.
  it("rejects a manifest belonging to a different skill", () => {
    for (const patch of [{ id: "competitor-skill" }, { version: "9.9.9" }]) {
      const r = runWithMutated((record) => {
        Object.assign((record.execution as { manifest: Record<string, unknown> }).manifest, patch);
      });
      expect(r.code, JSON.stringify(patch)).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), JSON.stringify(patch)).toContain("different skill");
    }
  });

  it("requires the manifest to carry an identity at all", () => {
    for (const field of ["id", "version"]) {
      const r = runWithMutated((record) => {
        delete (record.execution as { manifest: Record<string, unknown> }).manifest[field];
      });
      expect(r.code, field).toBe(EXIT_USAGE_OR_IO);
    }
  });

  // The schema trims, so a raw id with a trailing space is a distinct string
  // in the duplicate guard and the SAME identity everywhere downstream — which
  // defeated the guard and put two case results under one name.
  it("catches a duplicate id that differs only by untrimmed whitespace", () => {
    const dir = mkdtempSync(join(tmpdir(), "verdant-eval-ws-"));
    const out = outDir();
    try {
      const raw = readFileSync(SOURCE, "utf8");
      writeFileSync(join(dir, "a.json"), raw, "utf8");
      const spaced = JSON.parse(raw) as { fixture: { fixtureId: string } };
      spaced.fixture.fixtureId = `${spaced.fixture.fixtureId} `;
      writeFileSync(join(dir, "b.json"), JSON.stringify(spaced), "utf8");
      const r = main([
        "--skill-id",
        "harness-self-test",
        "--skill-version",
        "1.0.0",
        "--now",
        NOW,
        "--fixture-dir",
        dir,
        "--output-dir",
        out,
      ]);
      expect(r.code).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" ")).toContain("Duplicate fixtureId");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("rejects two verdicts for the same proposal", () => {
    // Collapsing to a Set erased duplicates before the membership check, so an
    // allow and a block for one proposal both passed and still drove the
    // derived eligibility.
    const r = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      const policy = execution.policy as Record<string, unknown>;
      policy.proposalVerdicts = [
        verdictFor("manual_only"),
        { ...verdictFor("none"), verdict: "block" },
      ];
      policy.actionEligibility = "low_risk_manual_only";
      policy.outcomes = ["allow_low_risk_manual_action"];
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("more than one policy verdict");
  });

  // A safety check keyed on an open vocabulary is a safety check with an
  // opt-out: the evaluator recognises equipment-control findings by exact
  // code, so a plausible typo avoided device_control_emitted entirely.
  it("rejects a fired-rule code outside the governor vocabulary", () => {
    for (const code of ["device_control_instructions", "made_up_rule", "DEVICE_CONTROL"]) {
      const r = runWithMutated((record) => {
        (record.execution as { policy: Record<string, unknown> }).policy.firedRules = [
          { code, basis: "linguistic", subject: "run", proposalId: null, detail: "x" },
        ];
      });
      expect(r.code, code).toBe(EXIT_USAGE_OR_IO);
    }
  });

  it("requires the bound context to say which context it is", () => {
    const r = runWithMutated((record) => {
      delete (record.execution as { context: Record<string, unknown> }).context.contextVersion;
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
  });

  it("returns a usage error, not a crash, when the run result names another context", () => {
    // This mismatch used to throw from inside the case-building map, escaping
    // main() and terminating with the interpreter's status — the exact
    // exit-code collapse the 1/2 split exists to prevent.
    const r = runWithMutated((record) => {
      (record.execution as { output: Record<string, unknown> }).output.contextVersion =
        "ctx-somewhere-else";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("but was bound to");
  });

  // Correlating IDS was only half of it: the VALUES have to agree too. The
  // governor computes effectiveRiskLevel = max(declared, derivedFloor), so an
  // effective risk BELOW the proposal's declared risk is a decision it cannot
  // produce — and the evaluator reads only the recorded effective risk.
  it("rejects a verdict whose effective risk is below the proposal's declared risk", () => {
    for (const [declared, effective] of [
      ["high", "low"],
      ["critical", "medium"],
      ["medium", "low"],
    ]) {
      const r = runWithMutated((record) => {
        const execution = record.execution as Record<string, unknown>;
        (execution.output as Record<string, unknown>).proposals = [
          { ...PROPOSAL, riskLevel: declared },
        ];
        const policy = execution.policy as Record<string, unknown>;
        policy.proposalVerdicts = [{ ...verdictFor("manual_only"), effectiveRiskLevel: effective }];
        policy.outcomes = ["allow_low_risk_manual_action"];
        policy.actionEligibility = "low_risk_manual_only";
      });
      expect(r.code, `${declared}->${effective}`).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), `${declared}->${effective}`).toContain("below the proposal");
    }
  });

  it("accepts an allowed verdict at the V1 ceiling, and a raised risk when BLOCKED", () => {
    // Guards the guard, corrected. My first version of this test asserted that
    // any risk at or above the declared one loads, which encoded only the
    // floor rule — the governor RAISES risk — and missed that V1 permits
    // action solely at low risk. Raising risk is legitimate; raising it and
    // still ALLOWING is not.
    const allowedAtCeiling = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [{ ...PROPOSAL, riskLevel: "low" }];
      const policy = execution.policy as Record<string, unknown>;
      policy.proposalVerdicts = [{ ...verdictFor("manual_only"), effectiveRiskLevel: "low" }];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "low_risk_manual_only";
    });
    expect(allowedAtCeiling.code).not.toBe(EXIT_USAGE_OR_IO);

    for (const [declared, effective] of [
      ["low", "high"],
      ["medium", "critical"],
    ]) {
      const blockedAndRaised = runWithMutated((record) => {
        const execution = record.execution as Record<string, unknown>;
        (execution.output as Record<string, unknown>).proposals = [
          { ...PROPOSAL, riskLevel: declared },
        ];
        const policy = execution.policy as Record<string, unknown>;
        policy.proposalVerdicts = [
          { ...verdictFor("manual_only"), verdict: "block", effectiveRiskLevel: effective },
        ];
        policy.actionEligibility = "none";
      });
      expect(blockedAndRaised.code, `${declared}->${effective}`).not.toBe(EXIT_USAGE_OR_IO);
    }
  });

  it("rejects an allowed verdict above the V1 risk ceiling", () => {
    // Round 17 rejected understatement and left the other end open: a `high`
    // proposal with an ALLOW verdict at `high` satisfied the floor rule, yet
    // V1 permits action only at low risk.
    for (const level of ["medium", "high", "critical"]) {
      const r = runWithMutated((record) => {
        const execution = record.execution as Record<string, unknown>;
        (execution.output as Record<string, unknown>).proposals = [
          { ...PROPOSAL, riskLevel: level },
        ];
        const policy = execution.policy as Record<string, unknown>;
        policy.proposalVerdicts = [{ ...verdictFor("manual_only"), effectiveRiskLevel: level }];
        policy.outcomes = ["allow_low_risk_manual_action"];
        policy.actionEligibility = "low_risk_manual_only";
      });
      expect(r.code, level).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), level).toContain("V1 risk ceiling");
    }
  });

  // The governor COPIES the proposal's executionCapability into its verdict,
  // so a manual_only proposal whose allow verdict records "none" is a decision
  // it cannot emit — and the eligibility refinement then derives "none" from
  // the forged verdict, letting a safety-critical must_abstain case pass.
  it("rejects a verdict whose capability disagrees with its proposal", () => {
    const r = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      const policy = execution.policy as Record<string, unknown>;
      policy.proposalVerdicts = [verdictFor("none")];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "none";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("capability disagrees");
  });

  // Two fields in one schema object, one closed and one open: the identical
  // fabrication in `verdict` was rejected by its enum, while a made-up context
  // slot was published as a "measured" 100% missing-context detection rate for
  // gaps the applicability engine cannot emit.
  it("rejects a context slot outside the closed vocabulary", () => {
    const r = runWithMutated((record) => {
      (
        record.execution as { applicability: Record<string, unknown> }
      ).applicability.missingRequiredContext = ["substrate_moisture"];
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
  });

  // A forbidden record attached to the output reaches the grower exactly as a
  // cited one does. Third channel of the same hard-safety hole: proposals,
  // then hypotheses, now the evidence list itself.
  it("catches forbidden evidence riding in the output evidence list", () => {
    const r = runWithMutated((record) => {
      const output = (record.execution as { output: Record<string, unknown> }).output;
      (output.evidence as Record<string, unknown>[]).push({
        evidenceId: "ev-forbidden",
        kind: "sensor_reading",
        observedAt: "2026-07-31T23:00:00.000Z",
        source: "live",
        confidence: 0.9,
        summary: "Unselected record.",
        detail: null,
        metric: null,
        entityRef: null,
      });
    });
    // Not a usage error — the file is well formed; the RUN disclosed evidence
    // it was never approved to use.
    expect(r.code).toBe(EXIT_HARD_SAFETY);
  });

  // An exemption conditioned on a field NAME rather than the value's shape
  // exempts whatever is put there: a secret at `runId` was blanked BEFORE the
  // production-data scan, and the later schema failure names an invalid run
  // result without naming or removing the secret in a committed file.
  it("exempts runId only when the value is actually a uuid", () => {
    for (const secret of ["sk_live_abcdefghijklmnop", "bearer aaaaaaaaaaaaaaaa"]) {
      const r = runWithMutated((record) => {
        (record.execution as { output: Record<string, unknown> }).output.runId = secret;
      });
      expect(r.code, secret).toBe(EXIT_USAGE_OR_IO);
      expect(r.lines.join(" "), secret).toContain("production-shaped data");
    }

    // A merely non-uuid runId is a SCHEMA failure, not a disclosure — a
    // different exit code, and worth pinning so the two are not conflated.
    const invalid = runWithMutated((record) => {
      (record.execution as { output: Record<string, unknown> }).output.runId = "not-a-uuid";
    });
    expect(invalid.code).toBe(EXIT_HARD_SAFETY);
  });

  // Comparing against the proposal's declared riskLevel checked what the model
  // said about itself. The governor raises that floor from the intervention
  // class it reads out of the proposed action and from floor-raising prose.
  it("rejects a verdict below the floor the governor derives from the prose", () => {
    const r = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [
        {
          ...PROPOSAL,
          riskLevel: "low",
          proposedAction: "Double the nutrient strength to 2400 PPM immediately.",
          reason: "Growth has stalled.",
        },
      ];
      const policy = execution.policy as Record<string, unknown>;
      policy.proposalVerdicts = [{ ...verdictFor("manual_only"), effectiveRiskLevel: "low" }];
      policy.outcomes = ["allow_low_risk_manual_action"];
      policy.actionEligibility = "low_risk_manual_only";
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("below the floor the governor derives");
  });

  // The governor adds this outcome for ANY allowed verdict, so a decision that
  // allows an action while declaring only observation_only is one it cannot
  // emit — and the evaluator reads `outcomes` independently, so a must_act
  // fixture expecting observation_only passed on it.
  it("rejects outcomes that omit the allowance their own verdict implies", () => {
    const r = runWithMutated((record) => {
      const execution = record.execution as Record<string, unknown>;
      (execution.output as Record<string, unknown>).proposals = [PROPOSAL];
      const policy = execution.policy as Record<string, unknown>;
      policy.proposalVerdicts = [verdictFor("manual_only")];
      policy.actionEligibility = "low_risk_manual_only";
      policy.outcomes = ["observation_only"];
    });
    expect(r.code).toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join(" ")).toContain("outcomes");
  });

  it("still accepts a well-formed envelope from the same path", () => {
    // Guards the guard: a check that rejected everything would pass the two
    // tests above while breaking the harness.
    const r = runWithMutated(() => {});
    expect(r.code).not.toBe(EXIT_USAGE_OR_IO);
    expect(r.lines.join("\n")).toContain("passed: 1  failed: 0");
    // Exit 4, not 0: these are self-test fixtures run under an ordinary skill
    // identity, so promotion is refused and the run blocks. That refusal is
    // the point — it must not be mistaken for a rejected fixture file.
    expect(r.code).toBe(EXIT_BLOCKED);
  });
});

describe("cli — self-test run", () => {
  it("passes and writes all four artifacts", () => {
    const { result, out } = selfTest(["--repeat", "2"]);
    try {
      expect(result.code).toBe(EXIT_PASS);
      for (const name of [
        "evaluation.json",
        "evaluation.md",
        "promotion-decision.json",
        "promotion-decision.md",
      ]) {
        expect(existsSync(join(out, name)), name).toBe(true);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("writes JSON that parses and self-verifies", () => {
    const { out } = selfTest();
    try {
      const report = JSON.parse(readFileSync(join(out, "evaluation.json"), "utf8"));
      expect(report.reportVersion).toBe("1.0.0");
      expect(verifyReportBinding(report, sha256Digest)).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("keeps JSON and Markdown counts in agreement", () => {
    const { out } = selfTest();
    try {
      const report = JSON.parse(readFileSync(join(out, "evaluation.json"), "utf8"));
      const md = readFileSync(join(out, "evaluation.md"), "utf8");
      expect(md).toContain(`Cases: ${report.metrics.totalCases}`);
      expect(md).toContain(
        `${report.metrics.passedCases} passed, ${report.metrics.failedCases} failed`,
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("cannot self-certify that its own bindings are current", () => {
    // The CLI used to fill the promotion engine's "bindings in force RIGHT
    // NOW" from `report.manifestBinding?.value` — the artifact being judged —
    // so all three staleness comparisons reduced to `x === x`. The reasons
    // existed, were reachable in principle, and could never fire on this path.
    // Build 7 has no registry to read the live manifest from, so the honest
    // answer is that currency is unsubstantiated.
    const { out } = selfTest();
    try {
      const decision = JSON.parse(readFileSync(join(out, "promotion-decision.json"), "utf8"));
      expect(decision.blockingReasons).toContain("manifest_binding_stale");
      expect(decision.blockingReasons).toContain("policy_binding_stale");
      expect(decision.blockingReasons).toContain("evidence_registry_binding_stale");
      expect(decision.unsatisfiedGates).toContain("current_bindings");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("refuses to promote the self-test target", () => {
    const { out } = selfTest();
    try {
      const decision = JSON.parse(readFileSync(join(out, "promotion-decision.json"), "utf8"));
      expect(decision.eligible).toBe(false);
      expect(decision.blockingReasons).toContain("self_test_target_is_never_promotable");
      expect(decision.authorizedManifestLifecycle).toBeNull();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("produces byte-identical artifacts under a fixed clock", () => {
    const shared = outDir();
    try {
      selfTest([], shared);
      const first = readFileSync(join(shared, "evaluation.json"), "utf8");
      selfTest([], shared);
      const second = readFileSync(join(shared, "evaluation.json"), "utf8");
      expect(second).toBe(first);
    } finally {
      rmSync(shared, { recursive: true, force: true });
    }
  });

  it("produces byte-identical artifacts from different output directories", () => {
    // The stronger claim, and the one that matters: reproducibility must not
    // depend on where the checkout lives. An artifact that records its own
    // absolute path folds the working directory into its own digest, so the
    // same fixtures and arguments yield a different report and a different
    // binding on a developer machine than in CI — and the two can never be
    // compared or cross-verified.
    const a = outDir();
    const b = outDir();
    try {
      selfTest([], a);
      selfTest([], b);
      expect(readFileSync(join(b, "evaluation.json"), "utf8")).toBe(
        readFileSync(join(a, "evaluation.json"), "utf8"),
      );
      expect(readFileSync(join(b, "promotion-decision.json"), "utf8")).toBe(
        readFileSync(join(a, "promotion-decision.json"), "utf8"),
      );
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("records logical artifact names, never a filesystem location", () => {
    // Absolute paths also carry the filesystem layout — on Windows, the
    // operating-system username — into an artifact CI uploads, and the run
    // disclosure scanner has no pattern for that shape.
    const { out } = selfTest();
    try {
      const report = JSON.parse(readFileSync(join(out, "evaluation.json"), "utf8"));
      expect(report.artifactPaths).toEqual([
        "evaluation.json",
        "evaluation.md",
        "promotion-decision.json",
        "promotion-decision.md",
      ]);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain(out);
      expect(serialized).not.toMatch(/[A-Za-z]:[\\/]/);
      expect(serialized).not.toContain("/Users/");
      expect(serialized).not.toContain("/home/");
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("leaves no temporary file behind after an atomic write", () => {
    const { out } = selfTest();
    try {
      for (const name of ["evaluation.json", "promotion-decision.json"]) {
        expect(existsSync(join(out, `${name}.tmp`)), name).toBe(false);
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("binds the effective repetition count, not the requested one", () => {
    // A fixture may demand more repetitions than --repeat asks for. If the
    // binding recorded the REQUESTED count, a case could run three times
    // while its provenance attested to one — provenance describing an
    // execution that never happened.
    const { out } = selfTest(["--repeat", "1"]);
    try {
      const report = JSON.parse(readFileSync(join(out, "evaluation.json"), "utf8"));
      const byId = (id: string) =>
        report.caseResults.find((c: { fixtureId: string }) => c.fixtureId === id);
      const repeated = byId("hst-014-deterministic-repeat");
      const single = byId("hst-001-happy-path");
      expect(repeated.bindings.runtime.executionConfig.value).toBe(
        computeBoundDigest("execution_config", { repeat: 3 }, sha256Digest).value,
      );
      expect(single.bindings.runtime.executionConfig.value).toBe(
        computeBoundDigest("execution_config", { repeat: 1 }, sha256Digest).value,
      );
      expect(repeated.bindings.runtime.executionConfig.value).not.toBe(
        single.bindings.runtime.executionConfig.value,
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("prints counts and verdicts, never payloads or secrets", () => {
    const { result, out } = selfTest();
    try {
      const printed = result.lines.join("\n");
      expect(printed).toContain("cases:");
      expect(printed).toContain("overall:");
      // No fixture payload, no model prose, no credential shapes.
      expect(printed).not.toContain("synthetic draft");
      expect(printed).not.toContain("modelDraft");
      expect(printed).not.toMatch(/eyJ|service_role|bearer /i);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("cli — exit-code contract", () => {
  it("uses distinct codes for distinct kinds of failure", () => {
    // Collapsing these would let a broken invocation read as a clean refusal.
    expect(
      new Set([
        EXIT_PASS,
        EXIT_EVALUATION_FAILURE,
        EXIT_USAGE_OR_IO,
        EXIT_HARD_SAFETY,
        EXIT_BLOCKED,
      ]).size,
    ).toBe(5);
    expect(EXIT_PASS).toBe(0);
    expect(EXIT_EVALUATION_FAILURE).toBe(1);
    expect(EXIT_USAGE_OR_IO).toBe(2);
    expect(EXIT_HARD_SAFETY).toBe(3);
    expect(EXIT_BLOCKED).toBe(4);
  });

  it("documents the same contract it implements", () => {
    const source = readFileSync(
      resolve(__dirname, "../../scripts/run-verdant-skill-evals.ts"),
      "utf8",
    );
    for (const line of [
      "0  evaluation passed",
      "1  ordinary evaluation failure",
      "2  usage, fixture-schema, binding, or I/O error",
      "3  hard safety failure",
      "4  blocked",
    ]) {
      expect(source).toContain(line);
    }
  });

  it("never forces a process exit or suppresses a failure", () => {
    const source = readFileSync(
      resolve(__dirname, "../../scripts/run-verdant-skill-evals.ts"),
      "utf8",
    );
    expect(source).not.toContain("forceExit");
    expect(source).not.toContain("|| true");
    expect(source).not.toContain("process.exit(0)");
    // main() returns a code; only the direct-invocation guard may exit.
    expect(source.split("process.exit(").length - 1).toBe(1);
  });
});
