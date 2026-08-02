import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const REPOSITORY_ROOT = process.cwd();
const GENERATOR_SCRIPT = resolve(
  REPOSITORY_ROOT,
  "scripts",
  "generate-release-workbook-templates.mjs",
);
const TEMP_WORKSPACE_BASENAME_PREFIX = "verdant-release-workbooks-";
const TEMP_WORKSPACE_PREFIX = join(tmpdir(), TEMP_WORKSPACE_BASENAME_PREFIX);
const DEFAULT_GENERATION_TIMEOUT_MS = 30_000;
const DEFAULT_TERMINATION_GRACE_MS = 100;
const DEFAULT_TERMINATION_CONFIRMATION_TIMEOUT_MS = 1_000;
const TERMINATION_CONFIRMATION_POLL_MS = 25;

declare const releaseWorkbookTestWorkspaceBrand: unique symbol;

export type ReleaseWorkbookTestWorkspace = Readonly<{
  rootDir: string;
  artifactDir: string;
  [releaseWorkbookTestWorkspaceBrand]: true;
}>;

type WorkspaceState = {
  rootDir: string;
  artifactDir: string;
  realRoot: string;
  activeChildren: Set<ChildProcess>;
};

type AsyncGenerationOptions = {
  generatorScript?: string;
  timeoutMs?: number;
  terminationGraceMs?: number;
  terminationConfirmationTimeoutMs?: number;
  terminateChild?: (signal: NodeJS.Signals) => boolean;
};

const workspaceRegistry = new WeakMap<object, WorkspaceState>();

function pathsEqual(left: string, right: string): boolean {
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}

function workspaceSafetyError(): Error {
  return new Error("Release-workbook test workspace failed its safety boundary.");
}

function assertDirectTemporaryWorkspace(rootDir: string, realRoot: string): void {
  const resolvedTempRoot = resolve(tmpdir());
  const resolvedRoot = resolve(rootDir);
  const hasExpectedResolvedShape =
    pathsEqual(dirname(resolvedRoot), resolvedTempRoot) &&
    basename(resolvedRoot).startsWith(TEMP_WORKSPACE_BASENAME_PREFIX);
  if (!hasExpectedResolvedShape) {
    throw workspaceSafetyError();
  }

  let realTempRoot: string;
  try {
    realTempRoot = realpathSync(resolvedTempRoot);
  } catch {
    throw workspaceSafetyError();
  }
  const hasExpectedRealShape =
    pathsEqual(dirname(realRoot), realTempRoot) &&
    basename(realRoot).startsWith(TEMP_WORKSPACE_BASENAME_PREFIX);
  if (!hasExpectedRealShape) {
    throw workspaceSafetyError();
  }
}

function requireRegisteredWorkspace(workspace: ReleaseWorkbookTestWorkspace): WorkspaceState {
  if (typeof workspace !== "object" || workspace === null) {
    throw new Error("Unregistered release-workbook test workspace.");
  }

  const state = workspaceRegistry.get(workspace);
  if (!state) {
    throw new Error("Unregistered release-workbook test workspace.");
  }

  const expectedArtifactDir = join(state.rootDir, "docs", "artifacts");
  if (
    !pathsEqual(workspace.rootDir, state.rootDir) ||
    !pathsEqual(workspace.artifactDir, state.artifactDir) ||
    !pathsEqual(state.artifactDir, expectedArtifactDir) ||
    !existsSync(state.rootDir)
  ) {
    throw workspaceSafetyError();
  }

  let currentRealRoot: string;
  try {
    currentRealRoot = realpathSync(state.rootDir);
  } catch {
    throw workspaceSafetyError();
  }
  if (!pathsEqual(currentRealRoot, state.realRoot)) {
    throw workspaceSafetyError();
  }
  assertDirectTemporaryWorkspace(state.rootDir, currentRealRoot);

  return state;
}

function positiveDuration(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

function isProcessRunning(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

export function createReleaseWorkbookTestWorkspace(): ReleaseWorkbookTestWorkspace {
  const rootDir = mkdtempSync(TEMP_WORKSPACE_PREFIX);
  const artifactDir = join(rootDir, "docs", "artifacts");
  const workspace = Object.freeze({
    rootDir,
    artifactDir,
  }) as ReleaseWorkbookTestWorkspace;
  const realRoot = realpathSync(rootDir);
  assertDirectTemporaryWorkspace(rootDir, realRoot);
  workspaceRegistry.set(workspace, {
    rootDir,
    artifactDir,
    realRoot,
    activeChildren: new Set(),
  });
  return workspace;
}

export function removeReleaseWorkbookTestWorkspace(workspace: ReleaseWorkbookTestWorkspace): void {
  const state = requireRegisteredWorkspace(workspace);
  if (state.activeChildren.size > 0) {
    throw new Error("Cannot remove a release-workbook test workspace while generation is active.");
  }
  rmSync(state.rootDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
  workspaceRegistry.delete(workspace);
}

export async function removeReleaseWorkbookTestWorkspaceAsync(
  workspace: ReleaseWorkbookTestWorkspace,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      removeReleaseWorkbookTestWorkspace(workspace);
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

export function generateReleaseWorkbookTestArtifactsAsync(
  workspace: ReleaseWorkbookTestWorkspace,
  options: AsyncGenerationOptions = {},
): Promise<void> {
  const state = requireRegisteredWorkspace(workspace);
  if (state.activeChildren.size > 0) {
    throw new Error("Release-workbook generation is already active in this workspace.");
  }

  const generatorScript = options.generatorScript ?? GENERATOR_SCRIPT;
  const timeoutMs = positiveDuration(
    options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS,
    "Release-workbook generation timeout",
  );
  const terminationGraceMs = positiveDuration(
    options.terminationGraceMs ?? DEFAULT_TERMINATION_GRACE_MS,
    "Release-workbook termination grace period",
  );
  const terminationConfirmationTimeoutMs = positiveDuration(
    options.terminationConfirmationTimeoutMs ?? DEFAULT_TERMINATION_CONFIRMATION_TIMEOUT_MS,
    "Release-workbook termination confirmation timeout",
  );

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [generatorScript], {
      cwd: state.rootDir,
      stdio: "ignore",
    });
    state.activeChildren.add(child);

    let settled = false;
    let timedOut = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    let confirmationTimer: ReturnType<typeof setTimeout> | undefined;

    const timeoutError = () =>
      new Error(`Isolated release-workbook generation timed out after ${timeoutMs}ms.`);
    const releaseChild = () => {
      state.activeChildren.delete(child);
    };
    const clearLifecycle = () => {
      clearTimeout(timeoutTimer);
      if (terminationTimer) clearTimeout(terminationTimer);
      if (confirmationTimer) clearTimeout(confirmationTimer);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    };
    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearLifecycle();
      releaseChild();
      if (error) rejectPromise(error);
      else resolvePromise();
    };
    const retainReleaseOnClose = () => {
      clearLifecycle();
      const onRetainedError = () => {
        // The process remains registered until close proves its resources are
        // released. This listener only prevents an unhandled error event.
      };
      child.once("error", onRetainedError);
      child.once("close", () => {
        child.removeListener("error", onRetainedError);
        releaseChild();
      });
      child.unref();
    };
    const terminate = (signal: NodeJS.Signals) => {
      try {
        return options.terminateChild ? options.terminateChild(signal) : child.kill(signal);
      } catch {
        return false;
      }
    };
    const rejectWithoutConfirmedTermination = () => {
      if (settled) return;
      if (!isProcessRunning(child.pid)) {
        settle(timeoutError());
        return;
      }
      settled = true;
      retainReleaseOnClose();
      rejectPromise(
        new Error(
          `Isolated release-workbook generation could not confirm child termination within ${terminationConfirmationTimeoutMs}ms.`,
        ),
      );
    };
    const pollForTermination = (deadline: number) => {
      if (settled) return;
      if (!isProcessRunning(child.pid)) {
        settle(timeoutError());
        return;
      }
      if (Date.now() >= deadline) {
        rejectWithoutConfirmedTermination();
        return;
      }
      confirmationTimer = setTimeout(
        () => pollForTermination(deadline),
        TERMINATION_CONFIRMATION_POLL_MS,
      );
    };
    const onError = () => {
      if (timedOut) return;
      settle(new Error("Unable to start isolated release-workbook generation."));
    };
    const onClose = (code: number | null) => {
      if (timedOut) {
        settle(timeoutError());
        return;
      }
      if (code === 0) {
        settle();
        return;
      }
      settle(
        new Error(
          `Isolated release-workbook generation failed with exit code ${
            typeof code === "number" ? code : "unknown"
          }.`,
        ),
      );
    };

    child.once("error", onError);
    child.once("close", onClose);
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      terminate("SIGTERM");
      terminationTimer = setTimeout(() => {
        if (settled) return;
        terminate("SIGKILL");
        pollForTermination(Date.now() + terminationConfirmationTimeoutMs);
      }, terminationGraceMs);
    }, timeoutMs);
  });
}
