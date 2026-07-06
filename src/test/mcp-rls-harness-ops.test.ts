/**
 * Always-run unit tests for the MCP local RLS harness ops layer:
 *
 * 1. Artifact sanitizer — token/secret-like values never survive into
 *    artifact text or structured payloads.
 * 2. Failure-artifact writer — files written under the artifact dir are
 *    sanitized and accompanied by an explanatory README.txt.
 * 3. Manifest-driven case derivation — pagination/filter params come only
 *    from the advertised manifest schemas; no params are ever invented;
 *    tools without pagination/filter params yield N/A (a single baseline
 *    case with no args), not a failure.
 * 4. Ops surface — the `test:mcp:rls:local` package script exists without
 *    hardcoded keys, and the README documents the required env vars,
 *    command, and artifact sanitization guarantees.
 *
 * No local Supabase required: everything here is pure or filesystem-only.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import manifest from "../../.lovable/mcp/manifest.json";
import {
  REDACTED,
  derivePaginationFilterParams,
  generateRlsCasesFromManifest,
  hasPaginationOrFilterAxes,
  sanitizeArtifactText,
  sanitizeArtifactValue,
  writeSanitizedArtifact,
} from "./helpers/mcpRlsHarnessOps";

// A structurally JWT-like value that is obviously fake.
const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiZmFrZS1sb2NhbC10ZXN0In0.aGFybmVzcy1vcHMtdGVzdC1zaWduYXR1cmU";

describe("MCP RLS harness ops — artifact sanitizer", () => {
  it("redacts JWT-like strings from free text", () => {
    const out = sanitizeArtifactText(`token was ${FAKE_JWT} in the log`);
    expect(out).not.toContain(FAKE_JWT);
    expect(out).toContain(REDACTED);
  });

  it("redacts Bearer tokens from free text", () => {
    const out = sanitizeArtifactText("Authorization: Bearer abcdef1234567890abcdef");
    expect(out).not.toMatch(/bearer\s+[A-Za-z0-9._~+/=-]{12,}/i);
    expect(out).toContain(REDACTED);
  });

  it("redacts Supabase sb_secret_/sb_publishable_ key formats", () => {
    const out = sanitizeArtifactText(
      "key=sb_secret_0123456789abcdefXYZ and sb_publishable_abcdef123456",
    );
    expect(out).not.toContain("sb_secret_0123456789abcdefXYZ");
    expect(out).not.toContain("sb_publishable_abcdef123456");
  });

  it("strips live sensitive env values from text", () => {
    const prior = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
    process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY = "local-harness-fake-key-value-123";
    try {
      const out = sanitizeArtifactText("connecting with local-harness-fake-key-value-123 now");
      expect(out).not.toContain("local-harness-fake-key-value-123");
      expect(out).toContain(REDACTED);
    } finally {
      if (prior === undefined) delete process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
      else process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY = prior;
    }
  });

  it("structurally redacts secret-named keys in objects", () => {
    const value = {
      access_token: "aaaa",
      refresh_token: "bbbb",
      bridge_token: "cccc",
      client_secret: "dddd",
      service_role: "eeee",
      apikey: "ffff",
      authorization: "gggg",
      raw_payload: { device: "secret-stuff" },
      headers: { Authorization: "Bearer zzz" },
      password: "hhhh",
      note: "safe value stays",
      nested: [{ sessionToken: "iiii", name: "kept" }],
    };
    const out = sanitizeArtifactValue(value) as Record<string, unknown>;
    expect(out.access_token).toBe(REDACTED);
    expect(out.refresh_token).toBe(REDACTED);
    expect(out.bridge_token).toBe(REDACTED);
    expect(out.client_secret).toBe(REDACTED);
    expect(out.service_role).toBe(REDACTED);
    expect(out.apikey).toBe(REDACTED);
    expect(out.authorization).toBe(REDACTED);
    expect(out.raw_payload).toBe(REDACTED);
    expect(out.headers).toBe(REDACTED);
    expect(out.password).toBe(REDACTED);
    expect(out.note).toBe("safe value stays");
    const nested = (out.nested as Array<Record<string, unknown>>)[0];
    expect(nested.sessionToken).toBe(REDACTED);
    expect(nested.name).toBe("kept");
  });

  it("catches JWTs hiding inside non-secret-named fields", () => {
    const out = sanitizeArtifactValue({ detail: `failed with ${FAKE_JWT}` }) as Record<
      string,
      unknown
    >;
    expect(JSON.stringify(out)).not.toContain(FAKE_JWT);
  });
});

describe("MCP RLS harness ops — failure-artifact writer", () => {
  let dir: string;
  let priorDirEnv: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mcp-rls-artifacts-"));
    priorDirEnv = process.env.MCP_RLS_ARTIFACT_DIR;
    process.env.MCP_RLS_ARTIFACT_DIR = dir;
  });

  afterEach(() => {
    if (priorDirEnv === undefined) delete process.env.MCP_RLS_ARTIFACT_DIR;
    else process.env.MCP_RLS_ARTIFACT_DIR = priorDirEnv;
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes sanitized JSON artifacts plus a README.txt", () => {
    const written = writeSanitizedArtifact("test-payload.json", {
      access_token: FAKE_JWT,
      calls: [{ tool: "list_grows", authorization: "Bearer abcdef1234567890" }],
      note: "kept",
    });
    expect(written).toBeTruthy();
    const files = readdirSync(dir);
    expect(files).toContain("test-payload.json");
    expect(files).toContain("README.txt");

    const body = readFileSync(join(dir, "test-payload.json"), "utf8");
    expect(body).not.toContain(FAKE_JWT);
    expect(body).not.toMatch(/bearer\s+[A-Za-z0-9._~+/=-]{12,}/i);
    expect(body).toContain("kept");

    const readme = readFileSync(join(dir, "README.txt"), "utf8");
    expect(readme.toLowerCase()).toContain("sanitized");
  });

  it("artifact payloads never include raw secret-like values, even in strings", () => {
    writeSanitizedArtifact(
      "log.log",
      `vitest failed\nAuthorization: Bearer ${FAKE_JWT}\nsb_secret_abcdefgh12345678`,
    );
    const body = readFileSync(join(dir, "log.log"), "utf8");
    expect(body).not.toContain(FAKE_JWT);
    expect(body).not.toContain("sb_secret_abcdefgh12345678");
  });

  it("never throws when the artifact dir is unwritable", () => {
    process.env.MCP_RLS_ARTIFACT_DIR = join(dir, "file-not-dir", "\0invalid");
    expect(() => writeSanitizedArtifact("x.json", { a: 1 })).not.toThrow();
  });
});

describe("MCP RLS harness ops — manifest-driven param derivation", () => {
  const byName = (name: string) => manifest.mcp.tools.find((t) => t.name === name)!;

  it("list_grows derives exactly includeArchived (boolean-filter) + limit (pagination-limit)", () => {
    const params = derivePaginationFilterParams(byName("list_grows"));
    const kinds = Object.fromEntries(params.map((p) => [p.name, p.kind]));
    expect(kinds).toEqual({
      includeArchived: "boolean-filter",
      limit: "pagination-limit",
    });
    expect(hasPaginationOrFilterAxes(byName("list_grows"))).toBe(true);
  });

  it("list_recent_diary_entries derives growId (scope-filter) + limit (pagination-limit)", () => {
    const params = derivePaginationFilterParams(byName("list_recent_diary_entries"));
    const kinds = Object.fromEntries(params.map((p) => [p.name, p.kind]));
    expect(kinds).toEqual({
      growId: "scope-filter",
      limit: "pagination-limit",
    });
  });

  it("get_latest_sensor_snapshot derives only tentId (scope-filter) — pagination/filter is N/A", () => {
    const params = derivePaginationFilterParams(byName("get_latest_sensor_snapshot"));
    const kinds = Object.fromEntries(params.map((p) => [p.name, p.kind]));
    expect(kinds).toEqual({ tentId: "scope-filter" });
    expect(hasPaginationOrFilterAxes(byName("get_latest_sensor_snapshot"))).toBe(false);
  });

  it("generated cases honor advertised limit bounds (min/max from schema)", () => {
    const cases = generateRlsCasesFromManifest(byName("list_grows"));
    const limits = new Set(cases.map((c) => c.args.limit));
    expect(limits.has(1)).toBe(true); // schema minimum
    expect(limits.has(100)).toBe(true); // schema maximum
    for (const l of limits) {
      expect(typeof l).toBe("number");
      expect(l as number).toBeGreaterThanOrEqual(1);
      expect(l as number).toBeLessThanOrEqual(100);
    }
    // includeArchived axis doubles the limit variants.
    const archivedValues = new Set(cases.map((c) => c.args.includeArchived));
    expect(archivedValues).toEqual(new Set([true, false]));
  });

  it("never generates params that are not advertised in the manifest (all tools)", () => {
    for (const tool of manifest.mcp.tools) {
      const advertised = new Set(Object.keys(tool.inputSchema.properties ?? {}));
      for (const c of generateRlsCasesFromManifest(tool)) {
        for (const key of [...Object.keys(c.args), ...c.scopeParams]) {
          expect(advertised.has(key), `${tool.name}: generated fake param ${key}`).toBe(true);
        }
      }
    }
  });

  it("does not invent values for hypothetical cursor/date params", () => {
    // A synthetic tool advertising cursor/date params: they are recognized
    // but no fabricated values may appear in generated args.
    const synthetic = {
      name: "synthetic_tool",
      inputSchema: {
        properties: {
          cursor: { type: "string" },
          since: { type: "string", format: "date-time" },
          limit: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: [],
      },
    };
    const params = derivePaginationFilterParams(synthetic);
    expect(params.map((p) => p.kind).sort()).toEqual(
      ["date-filter", "pagination-cursor", "pagination-limit"].sort(),
    );
    for (const c of generateRlsCasesFromManifest(synthetic)) {
      expect("cursor" in c.args).toBe(false);
      expect("since" in c.args).toBe(false);
    }
  });

  it("a tool with no pagination/filter/scope params yields one baseline case, not a failure", () => {
    const bare = { name: "bare_tool", inputSchema: { properties: {}, required: [] } };
    const cases = generateRlsCasesFromManifest(bare);
    expect(cases.length).toBe(1);
    expect(cases[0].args).toEqual({});
    expect(cases[0].scopeParams).toEqual([]);
    expect(hasPaginationOrFilterAxes(bare)).toBe(false);
  });
});

describe("MCP RLS harness ops — package script + README surface", () => {
  const repoRoot = process.cwd();

  it("package.json exposes test:mcp:rls:local without hardcoded keys", () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const script = pkg.scripts?.["test:mcp:rls:local"];
    expect(script).toBe("bunx vitest run src/test/mcp-local-rls-integration.test.ts");
    // No embedded secrets or env value assignments in the script itself.
    expect(script).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}/);
    expect(script).not.toMatch(/sb_(secret|publishable)_/);
    expect(script).not.toMatch(/LOCAL_SUPABASE_(ANON|SERVICE_ROLE)_KEY\s*=/);
  });

  it("README documents required env vars, the package script, and artifact sanitization", () => {
    const readme = readFileSync(resolve(repoRoot, "README.md"), "utf8");
    for (const required of [
      "MCP_LOCAL_RLS_HARNESS=1",
      "LOCAL_SUPABASE_URL",
      "LOCAL_SUPABASE_ANON_KEY",
      "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
      "bun run test:mcp:rls:local",
    ]) {
      expect(readme, `README must document ${required}`).toContain(required);
    }
    expect(readme).toMatch(/sanitized/i);
    expect(readme).toMatch(/only\s+when\s+the\s+job\s+fails/i);
    expect(readme).toMatch(/never\s+commit\s+any\s+service\s+role\s+key/i);
  });

  it("CI workflow uploads artifacts only on failure and never uploads env files", () => {
    const wf = readFileSync(
      resolve(repoRoot, ".github/workflows/mcp-local-rls-integration.yml"),
      "utf8",
    );
    // Failure-only artifact handling.
    expect(wf).toMatch(/if:\s*failure\(\)/);
    expect(wf).toContain("actions/upload-artifact");
    expect(wf).toContain("artifacts/mcp-local-rls");
    // Hard lines: no hosted Supabase, no repo secrets in the harness job.
    // (Scan only non-comment lines — the workflow's own "hard lines" header
    // deliberately names the forbidden commands.)
    const wfCode = wf
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(wfCode).not.toMatch(/supabase\s+link/);
    expect(wfCode).not.toMatch(/db\s+push/);
    expect(wfCode).not.toMatch(/secrets\./);
    // Keys are masked before any later step can print them.
    expect(wf).toContain("::add-mask::");
    // Migrations are applied locally before the harness runs.
    expect(wf).toContain("supabase db reset --local");
    // Uploaded paths never include env files or Supabase config.
    const uploadPath = wf.match(/path:\s*\|([\s\S]*?)if-no-files-found/);
    expect(uploadPath).toBeTruthy();
    expect(uploadPath![1]).not.toMatch(/\.env/);
    expect(uploadPath![1]).not.toMatch(/supabase\/config/);
  });

  it("artifact directory is gitignored or absent from version control", () => {
    // The harness writes under artifacts/mcp-local-rls at repo root; that
    // path must never be committed. Either the tree lacks it or gitignore
    // covers artifacts/.
    const gitignore = readFileSync(resolve(repoRoot, ".gitignore"), "utf8");
    const covered = /(^|\n)\s*\/?artifacts\/?/.test(gitignore);
    const exists = existsSync(resolve(repoRoot, "artifacts/mcp-local-rls"));
    expect(covered || !exists).toBe(true);
  });
});
