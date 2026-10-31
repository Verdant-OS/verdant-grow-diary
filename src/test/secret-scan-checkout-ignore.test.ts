import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

type Step = { name?: string; run?: string };
const wf = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/secret-scan.yml"), "utf8"),
) as { jobs: { "secret-scan": { steps: Step[] } } };

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const scanRun = () => {
  const step = wf.jobs["secret-scan"].steps.find((s) => s.name === "Scan commits");
  if (!step?.run) throw new Error("missing Scan commits step");
  return step.run;
};

describe("secret scan checkout ignore file", () => {
  it("drops a checkout .gitleaksignore before the scanner starts", () => {
    // gitleaks v8.30.1 loads <repo>/.gitleaksignore even when --gitleaks-ignore-path is set.
    const dir = mkdtempSync(join(tmpdir(), "secret-scan-ignore-"));
    dirs.push(dir);
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, ".gitleaksignore"), "deadbeef:leaked.txt:generic-api-key:1\n");

    const bin = mkdtempSync(join(tmpdir(), "gitleaks-stub-"));
    dirs.push(bin);
    const marker = join(dir, "stub-saw.txt");
    writeFileSync(
      join(bin, "gitleaks"),
      `#!/bin/sh\nif [ -e .gitleaksignore ]; then echo present > '${marker}'; else echo absent > '${marker}'; fi\nexit 0\n`,
      { mode: 0o755 },
    );

    const policy = mkdtempSync(join(tmpdir(), "gitleaks-policy-"));
    dirs.push(policy);
    execFileSync("bash", ["-c", scanRun()], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        RANGE: "HEAD",
        POLICY_DIR: policy,
      },
    });

    expect(readFileSync(marker, "utf8").trim()).toBe("absent");
  });
});
