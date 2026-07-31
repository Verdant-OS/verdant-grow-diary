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
