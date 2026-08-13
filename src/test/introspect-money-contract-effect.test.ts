/**
 * Contract for scripts/introspect-money-contract-effect.mjs.
 *
 * The load-bearing property this file exists to pin is NOT "does it print a
 * report" — it is that this tool NEVER fails a build merely because it found
 * a mismatch. It is an introspection, not a gate: asserting an exact expected
 * shape before anyone has seen production would encode a guess as a gate, and
 * a money gate that is confidently wrong is worse than no gate. It exits
 * non-zero ONLY when it could not look at all.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const SCRIPT = "scripts/introspect-money-contract-effect.mjs";
const SRC = readFileSync(resolve(ROOT, SCRIPT), "utf8");

function run(args: string[], env: Record<string, string | undefined> = {}) {
  const clean = { ...process.env, ...env };
  delete clean.SUPABASE_DB_URL;
  delete clean.SUPABASE_DB_URL_LIVE;
  delete clean.DATABASE_URL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: clean,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("introspect-money-contract-effect — cannot silently pass", () => {
  it("exits 2 when no database URL is available", () => {
    const { code, stderr } = run([]);
    expect(code).toBe(2);
    expect(stderr).toContain("COULD NOT INTROSPECT");
    expect(stderr).toContain("Nothing was observed");
  });

  it("reports could_not_introspect in --json mode rather than a success status", () => {
    const { stdout } = run(["--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("could_not_introspect");
    expect(parsed.status).not.toBe("introspected");
  });

  it("never exits 0 on a failure to look", () => {
    expect(run([]).code).not.toBe(0);
    expect(run(["--json"]).code).not.toBe(0);
  });
});

const SECRET_PASSWORD = "s3cret-pa55word-long-enough";
const SECRET_URL = `postgresql://u:${SECRET_PASSWORD}@127.0.0.1:1/nope`;

describe("introspect-money-contract-effect — never publishes credentials", () => {
  it("emits no credential material on stdout or stderr for an unreachable target", () => {
    const { stdout, stderr, code } = run(["--url", SECRET_URL]);
    expect(code).toBe(2);
    expect(`${stdout}\n${stderr}`).not.toContain(SECRET_PASSWORD);
  });

  it("emits no credential material in --json mode either", () => {
    const { stdout, stderr } = run(["--json", "--url", SECRET_URL]);
    expect(`${stdout}\n${stderr}`).not.toContain(SECRET_PASSWORD);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });
});

describe("introspect-money-contract-effect — is bounded, so a stall cannot silence it", () => {
  it("sets an explicit timeout on the psql call", () => {
    // The checker this tool was built alongside had NO timeout on its psql
    // call, and a stalled connection could block a job until the runner's own
    // default killed it — cancelling any always() reporting step with it.
    expect(SRC).toContain("timeout: 120_000");
  });

  it("distinguishes a timeout from an ordinary query failure in its diagnostic", () => {
    expect(SRC).toContain("error.signal");
    expect(SRC).toContain("psql timed out");
  });
});

describe("introspect-money-contract-effect — this is an introspection, never a gate", () => {
  it("reaches process.exit(0) unconditionally once the payload is built — no comparison-gated exit", () => {
    // The single most important behavioural property of this tool, pinned at
    // the SOURCE level so it is verifiable on every platform, not only in the
    // POSIX-gated end-to-end suite below. Everything after the payload is
    // constructed must exit 0 unconditionally: a conditional process.exit
    // keyed on what compare() found would turn this introspection into
    // exactly the gate it was built not to be.
    // Scoped to main()'s BODY specifically, not the first textual occurrence
    // of "const payload = {" — bail() declares its own local `payload` too
    // (with a different shape, for the could_not_introspect status), and it
    // is defined earlier in the file. Slicing from a bare string match would
    // capture bail()'s own process.exit(2), which is legitimate and unrelated
    // to this invariant.
    const mainStart = SRC.indexOf("function main() {");
    const mainEnd = SRC.indexOf("try {\n  main();");
    expect(mainStart).toBeGreaterThan(-1);
    expect(mainEnd).toBeGreaterThan(mainStart);
    const mainBody = SRC.slice(mainStart, mainEnd);
    expect(mainBody).toContain("const payload = {");
    const exitCalls = [...mainBody.matchAll(/process\.exit\((\d+)\)/g)].map((m) => m[1]);
    expect(exitCalls.length).toBeGreaterThan(0);
    expect(exitCalls.every((code) => code === "0")).toBe(true);
  });
});

describe("introspect-money-contract-effect — derives its manifest, never restates it", () => {
  it("names the migration file as the single source of the contract", () => {
    expect(SRC).toContain("20260727050000_ai_credit_service_contract_forward_reassert.sql");
  });

  it("hard-codes no function or table name of its own outside that reference", () => {
    // The manifest must come from parseContractSql(), not from a second,
    // hand-maintained list that could drift from the migration it verifies.
    expect(SRC).not.toMatch(/["']ai_credit_spend["']/);
    expect(SRC).not.toMatch(/["']ai_credit_spend_results["']/);
  });

  it("imports the parsing and query-building logic rather than reimplementing it", () => {
    expect(SRC).toContain("moneyContractEffectManifest.mjs");
    expect(SRC).toContain("parseContractSql");
    expect(SRC).toContain("buildIntrospectionSql");
    expect(SRC).toContain("compare");
  });
});

// End-to-end against a REAL psql binary. POSIX-only by necessity: since
// CVE-2024-27980 Node's execFileSync refuses to resolve a .cmd/.bat shim and
// reports ENOENT, so a shim that returns actual output is unreachable on
// Windows. CI runs the probe on ubuntu, which is the platform that matters.
describe.skipIf(process.platform === "win32")(
  "introspect-money-contract-effect — end to end against a real (fake) psql",
  () => {
    const shimDir = mkdtempSync(join(tmpdir(), "introspect-psql-shim-"));
    afterAll(() => rmSync(shimDir, { recursive: true, force: true }));

    function psqlReturning(json: string) {
      // -tAc output: exactly the query result, one line, no header/footer —
      // matches how the real -tAc invocation behaves.
      writeFileSync(
        join(shimDir, "psql"),
        `#!/bin/sh\nprintf '%s' '${json.replace(/'/g, "'\\''")}'\n`,
        { mode: 0o755 },
      );
    }

    const CLEAN_OBSERVED = JSON.stringify({
      functions: [
        {
          signature: "public.ai_credit_spend(uuid,text,text,uuid,text,text,jsonb)",
          name: "ai_credit_spend",
          security_definer: true,
          config: ["search_path=public,pg_temp"],
          owner: "postgres",
          body_sha: "deadbeef",
          body_len: 4000,
          definition: "CREATE OR REPLACE FUNCTION ...",
          acl: [{ grantee: "service_role", privilege: "EXECUTE" }],
        },
        {
          signature: "public.ai_credit_refund(uuid,uuid,text,text)",
          name: "ai_credit_refund",
          security_definer: true,
          config: ["search_path=public,pg_temp"],
          owner: "postgres",
          body_sha: "cafef00d",
          body_len: 2000,
          definition: "CREATE OR REPLACE FUNCTION ...",
          acl: [{ grantee: "service_role", privilege: "EXECUTE" }],
        },
      ],
      tables: [
        {
          name: "ai_credit_spend_results",
          owner: "postgres",
          rls: false,
          acl: [{ grantee: "service_role", privilege: "SELECT" }],
        },
      ],
    });

    // A stale extra overload plus a PUBLIC grant — exactly the shape the
    // forward-reassert migration exists to prevent.
    const REGRESSED_OBSERVED = JSON.stringify({
      functions: [
        JSON.parse(CLEAN_OBSERVED).functions[0],
        {
          signature: "public.ai_credit_spend(uuid,text)",
          name: "ai_credit_spend",
          security_definer: false,
          config: [],
          owner: "postgres",
          body_sha: "stale0000",
          body_len: 500,
          definition: "CREATE OR REPLACE FUNCTION ... (stale overload)",
          acl: [{ grantee: "PUBLIC", privilege: "EXECUTE" }],
        },
        JSON.parse(CLEAN_OBSERVED).functions[1],
      ],
      tables: JSON.parse(CLEAN_OBSERVED).tables,
    });

    function runWithShim(args: string[]) {
      return run(args, { PATH: `${shimDir}:${process.env.PATH}` });
    }

    it("reports a clean introspection and exits 0", () => {
      psqlReturning(CLEAN_OBSERVED);
      const { code, stdout } = runWithShim(["--json", "--url", SECRET_URL]);
      expect(code).toBe(0);
      const payload = JSON.parse(stdout);
      expect(payload.status).toBe("introspected");
      expect(payload.observed.functions).toHaveLength(2);
      expect(payload.comparison.length).toBeGreaterThan(0);
      expect(payload.caveat).toMatch(/does not decide pass\/fail/);
    });

    it("STILL EXITS 0 when it finds a regressed contract — this is an introspection, not a gate", () => {
      // This is the single most important behavioural property of this tool.
      // If this test is ever weakened to expect a non-zero exit, the tool has
      // become the gate it was explicitly designed not to be, and a future CI
      // wiring could start failing merge on an unverified guess.
      psqlReturning(REGRESSED_OBSERVED);
      const { code, stdout } = runWithShim(["--json", "--url", SECRET_URL]);
      expect(code).toBe(0);
      const payload = JSON.parse(stdout);
      expect(payload.status).toBe("introspected");
      const overloadNote = payload.comparison.find(
        (n: { observation: string }) => n.observation === "multiple_overloads",
      );
      expect(overloadNote).toBeTruthy();
      expect(overloadNote.signatures).toHaveLength(2);
      // The stale overload's PUBLIC grant is surfaced as an observation...
      const publicGrant = payload.comparison.find(
        (n: { detail?: string }) => n.detail === "PUBLIC",
      );
      expect(publicGrant).toBeTruthy();
      // ...but nothing in the payload calls it a failure.
      expect(JSON.stringify(payload)).not.toMatch(/"(ok|pass|fail(ed)?)"\s*:/i);
    });

    it("never leaks the credential even on a fully successful run", () => {
      psqlReturning(CLEAN_OBSERVED);
      const { stdout, stderr } = runWithShim(["--json", "--url", SECRET_URL]);
      expect(`${stdout}\n${stderr}`).not.toContain(SECRET_PASSWORD);
    });

    it("writes the full report to INTROSPECTION_PATH when set", () => {
      psqlReturning(CLEAN_OBSERVED);
      const outFile = join(shimDir, "out.json");
      const { code } = run(["--json", "--url", SECRET_URL], {
        PATH: `${shimDir}:${process.env.PATH}`,
        INTROSPECTION_PATH: outFile,
      });
      expect(code).toBe(0);
      const written = JSON.parse(readFileSync(outFile, "utf8"));
      expect(written.status).toBe("introspected");
      expect(written.contract.function_names).toContain("ai_credit_spend");
    });

    it("bails cleanly on malformed JSON from psql, rather than crashing raw", () => {
      writeFileSync(join(shimDir, "psql"), `#!/bin/sh\nprintf 'not json'\n`, { mode: 0o755 });
      const { code, stdout } = runWithShim(["--json", "--url", SECRET_URL]);
      expect(code).toBe(2);
      const payload = JSON.parse(stdout);
      expect(payload.status).toBe("could_not_introspect");
      expect(payload.message).toContain("could not parse");
    });
  },
);
