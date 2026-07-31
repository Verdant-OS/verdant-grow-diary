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
});

describe("cli — fixture envelope validation", () => {
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
    // Same output directory on purpose: the artifact records its own paths,
    // so a different directory is a different input and SHOULD differ.
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
