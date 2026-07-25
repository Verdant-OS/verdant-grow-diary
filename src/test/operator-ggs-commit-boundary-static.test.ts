import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const EDGE_DIR = "supabase/functions/operator-ggs-real-payload-commit";

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walkRuntimeTs(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = resolve(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "test") continue;
      out.push(...walkRuntimeTs(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("browser private-RPC fence", () => {
  it("forbids every runtime src module from calling pi_ingest_commit_batch", () => {
    const offenders = walkRuntimeTs(resolve(ROOT, "src")).filter((file) =>
      /\.rpc\(\s*["']pi_ingest_commit_batch["']/.test(stripComments(readFileSync(file, "utf8"))),
    );
    expect(offenders).toEqual([]);
  });

  it("routes the browser helper through the dedicated function invocation", () => {
    const source = stripComments(read("src/lib/ggsRealPayloadCommit.ts"));
    expect(source).toContain('"operator-ggs-real-payload-commit"');
    expect(source).toMatch(/supabase\.functions\.invoke/);
    expect(source).not.toMatch(/supabase\.rpc/);
    expect(source).not.toMatch(/service[_-]?role/i);
  });
});

describe("operator GGS Edge boundary static fence", () => {
  const index = stripComments(read(`${EDGE_DIR}/index.ts`));
  const handler = stripComments(read(`${EDGE_DIR}/handler.ts`));
  const deps = stripComments(read(`${EDGE_DIR}/productionDeps.ts`));
  const all = `${index}\n${handler}\n${deps}`;

  it("pins platform JWT verification and re-verifies auth.getUser", () => {
    expect(read("supabase/config.toml")).toMatch(
      /\[functions\.operator-ggs-real-payload-commit\][\s\S]*?verify_jwt\s*=\s*true/,
    );
    expect(deps).toMatch(/auth\.getUser\(\)/);
    expect(deps).toMatch(/admin\.rpc\("has_role"/);
  });

  it("uses only tent and bridge metadata reads plus the private commit RPC", () => {
    expect(deps.match(/\.from\("([^"]+)"\)/g) ?? []).toEqual([
      '.from("tents")',
      '.from("bridge_tokens")',
    ]);
    expect(deps.match(/\.rpc\("([^"]+)"/g) ?? []).toEqual([
      '.rpc("has_role"',
      '.rpc("pi_ingest_commit_batch"',
    ]);
  });

  it("never writes alerts, Action Queue, AI, or device-control state", () => {
    for (const token of [
      'from("sensor_readings")',
      'from("alerts")',
      'from("action_queue")',
      "ai-doctor-review",
      "ai-coach",
      "device_command",
      "mqtt",
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
    ]) {
      expect(all).not.toContain(token);
    }
  });

  it("ignores caller-provided userId and rows", () => {
    expect(handler).not.toMatch(/body\.userId/);
    expect(handler).not.toMatch(/body\.user_id/);
    expect(handler).not.toMatch(/body\.rows/);
  });
});
