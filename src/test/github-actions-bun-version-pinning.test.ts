import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS_DIR = join(process.cwd(), ".github", "workflows");
const SETUP_BUN_STEP = /uses:\s*oven-sh\/setup-bun@/;
const EXACT_BUN_VERSION = /bun-version:\s*["']?\d+\.\d+\.\d+["']?\s*(?:#.*)?$/m;
const SHA_PINNED_WORKFLOWS = ["deployment-preview.yml", "prefix-diff-sarif.yml"] as const;
const EXTERNAL_ACTION_REF = /uses:\s*(?!\.\/)([^@\s]+)@([^\s#]+)/;

describe("GitHub Actions Bun version pinning", () => {
  it("pins every setup-bun step to an exact release", () => {
    const workflowFiles = readdirSync(WORKFLOWS_DIR)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort();

    const unpinned: string[] = [];

    for (const file of workflowFiles) {
      const lines = readFileSync(join(WORKFLOWS_DIR, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!SETUP_BUN_STEP.test(line)) return;
        const stepWindow = lines.slice(index, index + 8).join("\n");
        if (!EXACT_BUN_VERSION.test(stepWindow)) {
          unpinned.push(`${file}:${index + 1}`);
        }
      });
    }

    expect(workflowFiles.length).toBeGreaterThan(0);
    expect(unpinned).toEqual([]);
  });

  it("does not restore floating Bun release aliases", () => {
    const floating: string[] = [];

    for (const file of readdirSync(WORKFLOWS_DIR).sort()) {
      if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
      const source = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
      if (/bun-version:\s*["']?(?:latest|canary|action)["']?\s*(?:#.*)?$/m.test(source)) {
        floating.push(file);
      }
    }

    expect(floating).toEqual([]);
  });

  it("pins every external action in the touched deployment workflows to a full commit SHA", () => {
    const unpinned: string[] = [];

    for (const file of SHA_PINNED_WORKFLOWS) {
      const lines = readFileSync(join(WORKFLOWS_DIR, file), "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        const match = line.match(EXTERNAL_ACTION_REF);
        if (match && !/^[0-9a-f]{40}$/i.test(match[2])) {
          unpinned.push(`${file}:${index + 1}:${match[1]}@${match[2]}`);
        }
      });
    }

    expect(unpinned).toEqual([]);
  });
});
