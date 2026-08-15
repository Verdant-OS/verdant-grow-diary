import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { EXPLICIT_FIXTURE_FILES, EXTERNAL_CANARY_FILENAME } from "../src/constants.ts";
import {
  createSyntheticWorkspace,
  removeSyntheticWorkspace,
  templateRoot,
} from "../src/fixtureBuilder.ts";
import { hashDirectory } from "../src/hash.ts";
import { attemptReadWithinCwd } from "../src/sdkAdapter.ts";

const SPIKE_ROOT = join(fileURLToPath(new URL("..", import.meta.url)));

describe("synthetic fixture boundary", () => {
  it("labels every committed template as synthetic", () => {
    const root = templateRoot();
    const names = readdirSync(root).sort();
    expect(names).toEqual([...EXPLICIT_FIXTURE_FILES].sort());
    for (const name of names) {
      const body = readFileSync(join(root, name), "utf8");
      expect(body.toUpperCase()).toContain("SYNTHETIC");
    }
  });

  it("copies only explicitly named files into the disposable cwd", () => {
    const workspace = createSyntheticWorkspace();
    try {
      const copied = readdirSync(workspace.cwd).sort();
      expect(copied).toEqual([...EXPLICIT_FIXTURE_FILES].sort());
      expect(copied).not.toContain(EXTERNAL_CANARY_FILENAME);
      expect(existsSync(workspace.externalCanaryPath)).toBe(true);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("refuses to read the external canary from the fixture cwd", () => {
    const workspace = createSyntheticWorkspace();
    try {
      expect(attemptReadWithinCwd(workspace.cwd, EXTERNAL_CANARY_FILENAME)).toBe(false);
      expect(attemptReadWithinCwd(workspace.cwd, workspace.externalCanaryPath)).toBe(false);
      expect(attemptReadWithinCwd(workspace.cwd, join("..", EXTERNAL_CANARY_FILENAME))).toBe(
        false,
      );
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("keeps the immutable fixture byte-identical across a copy", () => {
    const workspace = createSyntheticWorkspace();
    try {
      const after = hashDirectory(workspace.cwd);
      expect(after).toBe(workspace.fixtureHashBefore);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });

  it("does not copy production repository files into the fixture cwd", () => {
    const workspace = createSyntheticWorkspace();
    try {
      const copied = readdirSync(workspace.cwd).join("\n");
      expect(copied).not.toContain("package.json");
      expect(copied).not.toMatch(/App\.tsx|router\.tsx/);
      expect(workspace.cwd.startsWith(SPIKE_ROOT)).toBe(false);
    } finally {
      removeSyntheticWorkspace(workspace);
    }
  });
});
