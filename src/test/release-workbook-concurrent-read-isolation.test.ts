import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  reviewStatusFormula,
  viabilityFormula,
} from "../../scripts/generate-release-workbook-templates.mjs";
import {
  createReleaseWorkbookTestWorkspace,
  generateReleaseWorkbookTestArtifactsAsync,
  removeReleaseWorkbookTestWorkspace,
  removeReleaseWorkbookTestWorkspaceAsync,
  type ReleaseWorkbookTestWorkspace,
} from "./utils/releaseWorkbookTestArtifacts";

const REPOSITORY_ARTIFACT_DIR = join(process.cwd(), "docs", "artifacts");
const SEED_FILENAME = "seed-production-tracking-v1.3-template.xlsx";
const REVIEW_FILENAME = "commercial-release-review-traceability-v1.3-template.xlsx";
const HANGING_GENERATOR_SCRIPT = join(
  process.cwd(),
  "src",
  "test",
  "fixtures",
  "hanging-release-workbook-generator.mjs",
);
const TEST_ROOT = join(process.cwd(), "src", "test");
const CHILD_PROCESS_MODULE = ["child", "process"].join("_");
const WORKBOOK_SOURCE_MARKERS = [
  "release-workbook",
  "generate-release-workbook-templates",
  "seed-production-tracking-v1.3-template",
  "commercial-release-review-traceability-v1.3-template",
];

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  return cell.f ? `=${cell.f}` : String(cell.v ?? "");
}

function collectTestFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(path));
    } else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function workbookTestSources(): Array<{ path: string; source: string }> {
  return collectTestFiles(TEST_ROOT)
    .map((path) => ({ path, source: readFileSync(path, "utf8") }))
    .filter(
      ({ path, source }) =>
        relative(TEST_ROOT, path).toLowerCase().includes("workbook") ||
        WORKBOOK_SOURCE_MARKERS.some((marker) => source.includes(marker)),
    );
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

async function waitForProcessToStop(pid: number, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (isProcessRunning(pid)) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the fixture process to stop.");
    }
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 25));
  }
}

function expectTrackedWorkbooksReadable(): void {
  const seed = XLSX.read(readFileSync(join(REPOSITORY_ARTIFACT_DIR, SEED_FILENAME)));
  const seedSheetName = seed.SheetNames.find((name) => name.startsWith("Seed_Production"));
  expect(seedSheetName).toBeTruthy();
  expect(cellText(seed.Sheets[seedSheetName!]?.L2)).toBe(viabilityFormula(2));

  const review = XLSX.read(readFileSync(join(REPOSITORY_ARTIFACT_DIR, REVIEW_FILENAME)));
  const reviewSheetName = review.SheetNames.find((name) =>
    name.startsWith("Commercial_Release_Review"),
  );
  expect(reviewSheetName).toBeTruthy();
  expect(cellText(review.Sheets[reviewSheetName!]?.AC2)).toBe(reviewStatusFormula(2));
}

describe("release workbook concurrent-reader isolation", () => {
  it("all current and future workbook test suites are fenced from direct child processes", () => {
    const workbookSuites = workbookTestSources();
    expect(workbookSuites.length).toBeGreaterThanOrEqual(5);
    for (const { path, source } of workbookSuites) {
      expect(source, `${path} imports a direct child-process escape hatch`).not.toContain(
        CHILD_PROCESS_MODULE,
      );
    }
  }, 30_000);

  it("keeps tracked XLSX readable and byte-stable during concurrent isolated generation", async () => {
    const seedPath = join(REPOSITORY_ARTIFACT_DIR, SEED_FILENAME);
    const reviewPath = join(REPOSITORY_ARTIFACT_DIR, REVIEW_FILENAME);
    const hashesBefore = {
      seed: sha256(seedPath),
      review: sha256(reviewPath),
    };
    const workspaces = [createReleaseWorkbookTestWorkspace(), createReleaseWorkbookTestWorkspace()];
    const generations = workspaces.map((workspace) =>
      generateReleaseWorkbookTestArtifactsAsync(workspace),
    );

    try {
      const concurrentReads = (async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          expectTrackedWorkbooksReadable();
          await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 0));
        }
      })();

      await Promise.all([Promise.all(generations), concurrentReads]);

      expect(sha256(seedPath)).toBe(hashesBefore.seed);
      expect(sha256(reviewPath)).toBe(hashesBefore.review);
      for (const workspace of workspaces) {
        expect(existsSync(join(workspace.artifactDir, SEED_FILENAME))).toBe(true);
        expect(existsSync(join(workspace.artifactDir, REVIEW_FILENAME))).toBe(true);
      }
    } finally {
      await Promise.allSettled(generations);
      for (const workspace of workspaces) {
        await removeReleaseWorkbookTestWorkspaceAsync(workspace);
      }
    }
  });

  it("terminates a stuck generator on deadline and releases its temporary workspace", async () => {
    const workspace = createReleaseWorkbookTestWorkspace();
    const rootDir = workspace.rootDir;
    const startedAt = Date.now();

    try {
      await expect(
        generateReleaseWorkbookTestArtifactsAsync(workspace, {
          generatorScript: HANGING_GENERATOR_SCRIPT,
          timeoutMs: 500,
        }),
      ).rejects.toThrow("Isolated release-workbook generation timed out after 500ms.");
      const childPid = Number(readFileSync(join(rootDir, "child.pid"), "utf8"));
      expect(Number.isSafeInteger(childPid)).toBe(true);
      expect(isProcessRunning(childPid)).toBe(false);
      expect(Date.now() - startedAt).toBeLessThan(2_000);
    } finally {
      await removeReleaseWorkbookTestWorkspaceAsync(workspace);
    }

    expect(existsSync(rootDir)).toBe(false);
  });

  it("rejects boundedly without cleaning up when child termination cannot be confirmed", async () => {
    const workspace = createReleaseWorkbookTestWorkspace();
    const rootDir = workspace.rootDir;
    const pidPath = join(rootDir, "child.pid");
    const startedAt = Date.now();
    let childPid: number | undefined;

    try {
      await expect(
        generateReleaseWorkbookTestArtifactsAsync(workspace, {
          generatorScript: HANGING_GENERATOR_SCRIPT,
          timeoutMs: 500,
          terminationGraceMs: 50,
          terminationConfirmationTimeoutMs: 200,
          terminateChild: () => false,
        }),
      ).rejects.toThrow(
        "Isolated release-workbook generation could not confirm child termination within 200ms.",
      );
      expect(Date.now() - startedAt).toBeLessThan(2_000);

      childPid = Number(readFileSync(pidPath, "utf8"));
      expect(Number.isSafeInteger(childPid)).toBe(true);
      expect(isProcessRunning(childPid)).toBe(true);
      expect(() => removeReleaseWorkbookTestWorkspace(workspace)).toThrow(
        "Cannot remove a release-workbook test workspace while generation is active.",
      );
      expect(existsSync(rootDir)).toBe(true);

      process.kill(childPid, "SIGKILL");
      await waitForProcessToStop(childPid);
      await removeReleaseWorkbookTestWorkspaceAsync(workspace);
      expect(existsSync(rootDir)).toBe(false);
    } finally {
      if (!childPid && existsSync(pidPath)) {
        childPid = Number(readFileSync(pidPath, "utf8"));
      }
      if (childPid && isProcessRunning(childPid)) {
        process.kill(childPid, "SIGKILL");
        await waitForProcessToStop(childPid);
      }
      if (existsSync(rootDir)) {
        await removeReleaseWorkbookTestWorkspaceAsync(workspace);
      }
    }
  });

  it("rejects forged repository-root handles before generation or cleanup", () => {
    const seedPath = join(REPOSITORY_ARTIFACT_DIR, SEED_FILENAME);
    const reviewPath = join(REPOSITORY_ARTIFACT_DIR, REVIEW_FILENAME);
    const hashesBefore = {
      seed: sha256(seedPath),
      review: sha256(reviewPath),
    };
    const forgedWorkspace = {
      rootDir: process.cwd(),
      artifactDir: REPOSITORY_ARTIFACT_DIR,
    } as unknown as ReleaseWorkbookTestWorkspace;

    expect(() => generateReleaseWorkbookTestArtifactsAsync(forgedWorkspace)).toThrow(
      "Unregistered release-workbook test workspace.",
    );
    expect(() => removeReleaseWorkbookTestWorkspace(forgedWorkspace)).toThrow(
      "Unregistered release-workbook test workspace.",
    );
    expect(sha256(seedPath)).toBe(hashesBefore.seed);
    expect(sha256(reviewPath)).toBe(hashesBefore.review);
  });

  it("rejects unregistered prefix-collision handles without touching their files", () => {
    const collisionRoot = mkdtempSync(join(tmpdir(), "verdant-release-workbooks-"));
    const collisionArtifactDir = join(collisionRoot, "docs", "artifacts");
    const sentinelPath = join(collisionRoot, "sentinel.txt");
    const forgedWorkspace = {
      rootDir: collisionRoot,
      artifactDir: collisionArtifactDir,
    } as unknown as ReleaseWorkbookTestWorkspace;
    writeFileSync(sentinelPath, "keep");

    try {
      expect(() => generateReleaseWorkbookTestArtifactsAsync(forgedWorkspace)).toThrow(
        "Unregistered release-workbook test workspace.",
      );
      expect(() => removeReleaseWorkbookTestWorkspace(forgedWorkspace)).toThrow(
        "Unregistered release-workbook test workspace.",
      );
      expect(readFileSync(sentinelPath, "utf8")).toBe("keep");
    } finally {
      rmSync(collisionRoot, { recursive: true, force: true });
    }
  });

  it("refuses a traversal-shaped cleanup target outside the temporary workspace", () => {
    const workspace = createReleaseWorkbookTestWorkspace();
    const escapedWorkspace = {
      ...workspace,
      rootDir: `${workspace.rootDir}${sep}..${sep}..`,
    } as unknown as ReleaseWorkbookTestWorkspace;

    try {
      expect(() => removeReleaseWorkbookTestWorkspace(escapedWorkspace)).toThrow(
        "Unregistered release-workbook test workspace.",
      );
      expect(existsSync(workspace.rootDir)).toBe(true);
    } finally {
      removeReleaseWorkbookTestWorkspace(workspace);
    }
  });
});
