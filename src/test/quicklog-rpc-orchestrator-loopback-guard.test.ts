/**
 * The QuickLog RPC runtime orchestrator must refuse a hosted SUPABASE_URL
 * before it spawns any harness. save-event and save-manual create users and
 * write rows with the service-role key and have no host check of their own
 * (Codex review on #3025).
 *
 * Runs the real script with credentials present and a non-loopback host.
 * example.invalid is reserved and never resolves, so even an unguarded run
 * reaches no real database.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(__dirname, "../../scripts/run-quicklog-rpc-rls-harnesses.ts");

function runWithHost(url: string) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
    SUPABASE_ANON_KEY: "not-a-real-key",
  };
  return spawnSync("bun", ["run", SCRIPT], { env, encoding: "utf8", timeout: 60_000 });
}

describe("QuickLog RPC orchestrator — loopback guard", () => {
  it("refuses a hosted URL before spawning any harness", () => {
    const res = runWithHost("https://example.invalid");
    const output = `${res.stdout}${res.stderr}`;
    expect(res.status).toBe(0);
    expect(output).toContain("local-only harness refused API host example.invalid");
    expect(output).not.toContain("[quicklog-rpc] → scripts/");
  });
});
