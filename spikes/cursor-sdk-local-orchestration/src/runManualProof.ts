import { execFileSync } from "node:child_process";

import { FIXED_CATALOG_MODEL_ID } from "./constants.ts";
import { assertSupportedNodeVersion } from "./nodeVersion.ts";
import { runOrchestration } from "./runCoordinator.ts";

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

async function main(): Promise<void> {
  assertSupportedNodeVersion(process.versions.node);
  const authorized = process.argv.includes("--authorize-live-proof");
  if (!process.env.CURSOR_API_KEY) {
    process.stdout.write("SDK LIVE PROOF: BLOCKED — CURSOR_API_KEY NOT PROVIDED\n");
    process.exitCode = 2;
    return;
  }
  if (!authorized) {
    process.stdout.write(
      "SDK LIVE PROOF: BLOCKED — pass --authorize-live-proof after reviewing that only synthetic fixtures will be sent\n",
    );
    process.exitCode = 2;
    return;
  }

  const { confirmFixedModelAvailable, LiveSdkAdapter } = await import("./liveSdkAdapter.ts");
  const adapter = new LiveSdkAdapter();
  await confirmFixedModelAvailable(adapter);
  const result = await runOrchestration({
    adapter,
    repoRoot: repoRoot(),
    liveProof: true,
  });
  process.stdout.write(`${JSON.stringify(result.receipt, null, 2)}\n`);
  process.stdout.write(`fixedModelId=${FIXED_CATALOG_MODEL_ID}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "live proof failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
