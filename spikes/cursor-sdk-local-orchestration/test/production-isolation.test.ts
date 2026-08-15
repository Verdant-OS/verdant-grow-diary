import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SDK_PACKAGE, SDK_PINNED_VERSION } from "../src/constants.ts";
import { readSpikeManifest } from "./resolvedConfig.ts";

const SPIKE_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));

function listTs(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("nested package isolation", () => {
  it("pins @cursor/sdk only in this nested package.json", () => {
    const manifest = readSpikeManifest() as {
      dependencies?: Record<string, string>;
      name: string;
    };
    expect(manifest.name).toBe("@verdant/spike-cursor-sdk-local-orchestration");
    expect(manifest.dependencies?.[SDK_PACKAGE]).toBe(SDK_PINNED_VERSION);
  });

  it("does not import the live adapter from unit tests", () => {
    for (const file of listTs(join(SPIKE_ROOT, "test"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']\.\.\/src\/liveSdkAdapter\.ts["']/);
    }
  });

  it("keeps forbidden SDK surfaces out of the host pipeline modules", () => {
    const forbiddenCalls = ["Agent.resume(", "Cursor.auth.login("];
    const hostFiles = [
      "runCoordinator.ts",
      "agentFactory.ts",
      "sdkAdapter.ts",
      "receipt.ts",
      "liveProofStatus.ts",
      "fixtureBuilder.ts",
      "runManualProof.ts",
    ];
    for (const name of hostFiles) {
      const source = readFileSync(join(SPIKE_ROOT, "src", name), "utf8");
      for (const token of forbiddenCalls) {
        expect(source, `${name} ${token}`).not.toContain(token);
      }
      expect(source, `${name} cloud.repos`).not.toContain("cloud.repos");
      expect(source, `${name} cloud.envVars`).not.toContain("cloud.envVars");
    }
    const live = readFileSync(join(SPIKE_ROOT, "src", "liveSdkAdapter.ts"), "utf8");
    expect(live).not.toContain("Agent.resume(");
    expect(live).not.toContain("Cursor.auth.login(");
    expect(live).not.toContain("autoCreatePR:");
    expect(live).not.toContain("workOnCurrentBranch:");
  });
});
