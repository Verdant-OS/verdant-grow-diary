import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const HARNESS = readFileSync(
  resolve(ROOT, "scripts/run-sensor-readings-source-rls-harness.ts"),
  "utf8",
);
const WITH_TRANSPORT_RETRY = HARNESS.slice(
  HARNESS.indexOf("async function withTransportRetry"),
  HARNESS.indexOf("\nasync function createUser"),
);

describe("sensor provenance RLS harness fixture safety", () => {
  it("creates owner-scoped tents through signed-in clients", () => {
    expect(HARNESS).toContain(
      "const ownerClient = await signIn(ownerFixture.email, ownerFixture.password);",
    );
    expect(HARNESS).toContain(
      "const otherClient = await signIn(otherFixture.email, otherFixture.password);",
    );
    expect(HARNESS).toMatch(
      /ownerClient\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(\{\s*user_id:\s*ownerFixture\.id/,
    );
    expect(HARNESS).toMatch(
      /otherClient\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(\{\s*user_id:\s*otherFixture\.id/,
    );
    expect(HARNESS).not.toMatch(/admin\s*[\r\n]+\s*\.from\("tents"\)\s*[\r\n]+\s*\.insert\(/);
  });

  it("retains the explicit service-role trusted-source assertion", () => {
    expect(HARNESS).toContain('"service-role RLS bypass can INSERT trusted live provenance"');
    expect(HARNESS).toMatch(
      /withTransportRetry\(\s*"service-role live INSERT",\s*\(\) => admin\.from\("sensor_readings"\)\.insert\(serviceRoleRow\)/,
    );
  });

  it("retries only code-less transport failures, loudly and bounded", () => {
    // A retry may never re-litigate a database verdict: PostgREST and
    // SQLSTATE rejections always carry an error code and must not retry.
    expect(HARNESS).toMatch(/return !!error && !error\.code;/);
    expect(HARNESS).toMatch(/const FIXTURE_TRANSPORT_ATTEMPTS = 3;/);
    // Pins are scoped to the function body so a purely additive edit
    // elsewhere cannot smuggle in an extra retry of coded errors: the body
    // must contain exactly the initial attempt plus the guarded loop retry.
    expect(WITH_TRANSPORT_RETRY).toMatch(
      /attempt <= FIXTURE_TRANSPORT_ATTEMPTS && isTransportError\(result\.error\)/,
    );
    expect(WITH_TRANSPORT_RETRY).toMatch(
      /console\.error\(\s*` {2}! transport error on "\$\{label\}"/,
    );
    expect(WITH_TRANSPORT_RETRY.split("await run()").length - 1).toBe(2);
    expect(WITH_TRANSPORT_RETRY.split("isTransportError").length - 1).toBe(1);
    // A deny check may not report "denied" when the client attempt itself
    // died at the transport layer: the attempt error must be part of each
    // ok-condition, not only the detail string.
    for (const attemptGuard of [
      "!isTransportError(error) &&",
      "!isTransportError(crossError) &&",
      "!isTransportError(forgedError) &&",
      "!isTransportError(anonError) &&",
    ]) {
      expect(HARNESS).toContain(attemptGuard);
    }
  });

  it("replays an identical idempotent payload when the ingest RPC retries", () => {
    // The bridge id and idempotency key are hoisted out of the retried
    // closure, so a committed-but-lost first attempt dedupes on retry
    // (inserted=0 fails the check) instead of double-inserting.
    const rpcCallIndex = HARNESS.search(
      /withTransportRetry\(\s*"service-role pi_ingest_commit_batch"/,
    );
    const idempotencyKeyIndex = HARNESS.indexOf("const rpcIdempotencyKey");
    const bridgeIdIndex = HARNESS.indexOf("const rpcBridgeId = crypto.randomUUID();");
    expect(rpcCallIndex).toBeGreaterThan(-1);
    expect(idempotencyKeyIndex).toBeGreaterThan(-1);
    expect(bridgeIdIndex).toBeGreaterThan(-1);
    expect(idempotencyKeyIndex).toBeLessThan(rpcCallIndex);
    expect(bridgeIdIndex).toBeLessThan(rpcCallIndex);
    expect(HARNESS).toMatch(/idempotency_key:\s*rpcIdempotencyKey,/);
    expect(HARNESS).toMatch(/p_bridge_id:\s*rpcBridgeId,/);
    expect(HARNESS).not.toMatch(/idempotency_key:\s*[^,\r\n]*randomUUID/);
    expect(HARNESS).not.toMatch(/p_bridge_id:\s*[^,\r\n]*randomUUID/);
  });

  it("preserves full error evidence in fixture failures", () => {
    expect(HARNESS).toMatch(/function errorDetail\(/);
    expect(HARNESS).toMatch(/`code=\$\{error\.code \?\? "none"\}`/);
    // The old pattern discarded message/details/hint and made transport
    // failures indistinguishable from database rejections.
    expect(HARNESS).not.toContain('?.code ?? "failed"');
  });

  it("proves both reserved markers are client-denied and the service-role RPC remains valid", () => {
    expect(HARNESS).toContain('"operator_attested_real_payload"');
    expect(HARNESS).toContain('"operator-ggs-real-payload-commit"');
    expect(HARNESS).toContain("authenticated client cannot forge reserved");
    expect(HARNESS).toMatch(/admin\.rpc\("pi_ingest_commit_batch",\s*\{[\s\S]*p_rows:/);
    expect(HARNESS).toContain(
      "service-role pi_ingest_commit_batch preserves reserved operator attestation",
    );
  });

  it("keeps the remote-database opt-in guard and never prints credentials", () => {
    expect(HARNESS).toContain("SENSOR_READINGS_SOURCE_RLS_HARNESS_ALLOW_REMOTE");
    expect(HARNESS).toContain("refusing remote database");
    expect(HARNESS).not.toMatch(
      /console\.(?:log|error)\([^)]*(?:serviceRoleKey|anonKey|SUPABASE_SERVICE_ROLE_KEY)/,
    );
  });
});
