#!/usr/bin/env node
// Waits until production serves the pinned commit before a production probe starts.
// A merge is not a deployment: publishing can finish minutes after the push that
// triggers a probe, and a probe that runs early only measures the previous build.
// Reads public build metadata only (/version.json). No credentials, no writes.
// Exit 0 when the pinned SHA is live and clean; exit 1 with BLOCKED otherwise.
import { pathToFileURL } from "node:url";

export const DEPLOY_WAIT_ORIGIN = "https://verdantgrowdiary.com";
const SHA = /^[0-9a-f]{40}$/;

export async function readDeployedCommit(response) {
  if (!response || response.type === "opaqueredirect" || response.status !== 200) return null;
  try {
    const body = await response.json();
    if (!body || typeof body !== "object") return null;
    if (body.dirty !== false || typeof body.commit !== "string" || !SHA.test(body.commit))
      return null;
    return body.commit;
  } catch {
    return null;
  }
}

export async function waitForDeployedSha({
  expectedSha,
  fetchImpl = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 20 * 60_000,
  intervalMs = 30_000,
}) {
  if (typeof expectedSha !== "string" || !SHA.test(expectedSha))
    return { status: "BLOCKED", observedCommit: null, attempts: 0 };
  const deadline = now() + timeoutMs;
  let attempts = 0;
  let observedCommit = null;
  for (;;) {
    attempts += 1;
    try {
      const response = await fetchImpl(`${DEPLOY_WAIT_ORIGIN}/version.json`, {
        redirect: "manual",
        cache: "no-store",
      });
      observedCommit = await readDeployedCommit(response);
    } catch {
      observedCommit = null;
    }
    if (observedCommit === expectedSha) return { status: "PASS", observedCommit, attempts };
    if (now() >= deadline) return { status: "BLOCKED", observedCommit, attempts };
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const expectedSha = process.env.E2E_EXPECTED_SHA ?? "";
  const timeoutSeconds = Number(process.env.DEPLOY_WAIT_TIMEOUT_SECONDS ?? 1200);
  const result = await waitForDeployedSha({
    expectedSha,
    timeoutMs: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0,
  });
  if (result.status === "PASS") {
    console.log(`Pinned SHA ${expectedSha} is live after ${result.attempts} check(s).`);
  } else {
    console.error(
      `BLOCKED: ${DEPLOY_WAIT_ORIGIN} does not serve pinned SHA ${expectedSha || "(unset)"} ` +
        `after ${result.attempts} check(s); last clean commit seen: ${result.observedCommit ?? "none"}. ` +
        "No production measurement was taken.",
    );
    process.exitCode = 1;
  }
}
