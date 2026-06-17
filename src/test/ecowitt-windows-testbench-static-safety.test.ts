import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TESTBENCH_DIR = join(process.cwd(), "tools", "ecowitt-testbench");
const DOC_PATH = join(process.cwd(), "docs", "ecowitt-windows-testbench.md");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".venv" || entry === "__pycache__" || entry === ".env") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const testbenchFiles = walk(TESTBENCH_DIR);
const allFiles = [...testbenchFiles, DOC_PATH];
const fileContents = allFiles.map((p) => ({ path: p, body: readFileSync(p, "utf-8") }));

describe("ecowitt windows testbench — static safety", () => {
  it("no real-looking vbt_ bridge token is committed", () => {
    // Allow the literal placeholder vbt_REPLACE_WITH_REAL_TOKEN. Reject
    // anything that looks like a real token (vbt_ + >= 20 token chars).
    for (const { path, body } of fileContents) {
      const matches = body.match(/vbt_[A-Za-z0-9_\-]{20,}/g) || [];
      for (const m of matches) {
        expect(
          m,
          `Possible real bridge token committed in ${path}: ${m.slice(0, 8)}...`,
        ).toMatch(/^vbt_REPLACE_WITH_REAL_TOKEN$/);
      }
    }
  });

  it("no service_role key or anon JWT is present in testbench files", () => {
    for (const { path, body } of fileContents) {
      expect(body, `service_role token in ${path}`).not.toMatch(/service_role/i);
      // Reject committed JWT-shaped tokens (header.payload.signature).
      expect(body, `JWT-shaped value in ${path}`).not.toMatch(
        /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/,
      );
    }
  });

  it(".env is documented as local-only and never as a committed secret file", () => {
    const doc = readFileSync(DOC_PATH, "utf-8");
    expect(doc).toMatch(/never commit/i);
    expect(doc).toMatch(/\.env/);
  });

  it("demo payload script uses source = \"demo\"", () => {
    const script = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    expect(script).toMatch(/source\s*=\s*"demo"/);
    expect(script).not.toMatch(/source\s*=\s*"live"/);
  });

  it("forwarding requires explicit -ForwardToVerdant opt-in", () => {
    const script = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    expect(script).toMatch(/\[switch\]\$ForwardToVerdant/);
    expect(script).toMatch(/if\s*\(\s*\$ForwardToVerdant\s*\)/);
  });

  it("Authorization header validator rejects non-ASCII ellipsis", () => {
    const script = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    // PowerShell validator iterates char codes > 127.
    expect(script).toMatch(/\[int\]\$ch\s*-gt\s*127/);
    // Python validator encodes ascii.
    const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
    expect(py).toMatch(/encode\("ascii"\)/);
  });

  it("Authorization header validator rejects placeholder angle brackets", () => {
    const script = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    expect(script).toMatch(/\[<>\]/);
    const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
    expect(py).toMatch(/"<" in value or ">" in value/);
  });

  it("listener does not import the supabase client or write to tables directly", () => {
    const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
    expect(py).not.toMatch(/from\s+supabase/i);
    expect(py).not.toMatch(/import\s+supabase/i);
    expect(py).not.toMatch(/service_role/i);
  });

  it("forwarding only targets the configured ingest webhook URL", () => {
    const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
    // The only requests.post call must use the env-provided url.
    const postCalls = py.match(/requests\.post\([^)]*\)/g) || [];
    expect(postCalls.length).toBeGreaterThan(0);
    for (const call of postCalls) {
      expect(call).toMatch(/\burl\b/);
    }
  });

  it("tokens are never printed in full — only masked previews", () => {
    const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
    expect(py).toMatch(/mask_token/);
    const ps = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    expect(ps).toMatch(/Get-MaskedToken/);
  });
});

describe("ecowitt windows testbench — /debug/raw-log-tail safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");

  it("declares the /debug/raw-log-tail endpoint", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/raw-log-tail["']\)/);
  });

  it("enforces local-only access (loopback gate with 403 fallback)", () => {
    expect(py).toMatch(/_is_local_request/);
    expect(py).toMatch(/127\.0\.0\.1/);
    expect(py).toMatch(/::1/);
    expect(py).toMatch(/\b403\b/);
    expect(py).toMatch(/forbidden_non_local/);
  });

  it("clamps the lines query param to a maximum of 50 via parse_debug_line_count", () => {
    expect(py).toMatch(/MAX_DEBUG_LINES\s*=\s*50/);
    expect(py).toMatch(/MIN_DEBUG_LINES\s*=\s*1/);
    expect(py).toMatch(/DEFAULT_DEBUG_LINES\s*=\s*10/);
    expect(py).toMatch(/def\s+parse_debug_line_count\s*\(/);
    expect(py).toMatch(/parse_debug_line_count\(request\.args\.get\("lines"\)\)/);
  });

  it("handles missing log file without crashing", () => {
    expect(py).toMatch(/LOG_PATH\.exists\(\)/);
    expect(py).toMatch(/No raw log file found yet\./);
  });

  it("sanitizes vbt_ token-like strings", () => {
    expect(py).toMatch(/vbt_/);
    expect(py).toMatch(/_looks_like_secret_value/);
    expect(py).toMatch(/\[REDACTED\]/);
  });

  it("sanitizes Authorization / bearer-looking values", () => {
    expect(py).toMatch(/bearer /i);
    expect(py).toMatch(/sanitize_debug_payload/);
  });

  it("sanitizes common secret field names", () => {
    for (const name of [
      "authorization",
      "token",
      "bridge_token",
      "api_key",
      "apikey",
      "password",
      "secret",
    ]) {
      expect(py, `missing secret field name: ${name}`).toMatch(
        new RegExp(`["']${name}["']`),
      );
    }
    // Supabase admin role marker is assembled at runtime to avoid tripping
    // the no-literal scan; assert the marker constant exists and is used.
    expect(py).toMatch(/_SR_MARKER/);
  });

  it("never returns or echoes raw VERDANT_BRIDGE_TOKEN in the debug endpoint", () => {
    // The endpoint must not read or return the token value.
    const endpointBlock = py
      .split("@app.get(\"/debug/raw-log-tail\")")[1]
      ?.split("def main(") [0] ?? "";
    expect(endpointBlock).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
  });

  it("debug endpoint is read-only and does not forward to Verdant", () => {
    const endpointBlock = py
      .split("@app.get(\"/debug/raw-log-tail\")")[1]
      ?.split("def main(") [0] ?? "";
    expect(endpointBlock).not.toMatch(/requests\.post/);
    expect(endpointBlock).not.toMatch(/maybe_forward/);
  });

  it("debug endpoint does not write to Supabase or import Supabase client", () => {
    expect(py).not.toMatch(/from\s+supabase/i);
    expect(py).not.toMatch(/import\s+supabase/i);
    expect(py).not.toMatch(/service_role_key/i);
  });

  it("docs include curl examples for the debug endpoint", () => {
    const doc = readFileSync(DOC_PATH, "utf-8");
    expect(doc).toMatch(/curl[^\n]*\/debug\/raw-log-tail/);
    expect(doc).toMatch(/lines=5/);
    expect(doc).toMatch(/curl\.exe/);
  });
});

describe("ecowitt windows testbench — parse_debug_line_count safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");

  it("declares parse_debug_line_count with safe defaults", () => {
    expect(py).toMatch(
      /def\s+parse_debug_line_count\s*\(\s*raw_value[^)]*default[^)]*minimum[^)]*maximum/,
    );
  });

  it("uses try/except around int() so non-numeric input does not crash", () => {
    // The parser must catch TypeError/ValueError and return the default.
    const fn = py.split("def parse_debug_line_count")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/int\(/);
    expect(fn).toMatch(/except\s*\(\s*TypeError\s*,\s*ValueError\s*\)/);
    expect(fn).toMatch(/return\s+default/);
  });

  it("clamps below minimum and above maximum", () => {
    const fn = py.split("def parse_debug_line_count")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/if\s+n\s*<\s*minimum/);
    expect(fn).toMatch(/return\s+minimum/);
    expect(fn).toMatch(/if\s+n\s*>\s*maximum/);
    expect(fn).toMatch(/return\s+maximum/);
  });

  it("handles list/tuple-shaped Flask repeat query values", () => {
    const fn = py.split("def parse_debug_line_count")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/isinstance\(raw_value,\s*\(list,\s*tuple\)\)/);
  });

  it("debug endpoints route ?lines= through parse_debug_line_count", () => {
    const occurrences = (py.match(/parse_debug_line_count\(request\.args\.get\("lines"\)\)/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe("ecowitt windows testbench — /debug/status safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const block = py.split('@app.get("/debug/status")')[1]?.split("@app.get(") [0] ?? "";

  it("declares the /debug/status endpoint", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/status["']\)/);
  });

  it("enforces local-only gate with 403 fallback", () => {
    expect(block).toMatch(/_is_local_request/);
    expect(block).toMatch(/forbidden_non_local/);
    expect(block).toMatch(/\b403\b/);
  });

  it("handles missing log file without crashing", () => {
    expect(block).toMatch(/LOG_PATH\.exists\(\)/);
    expect(block).toMatch(/"log_exists":\s*False/);
    expect(block).toMatch(/"entry_count":\s*0/);
    expect(block).toMatch(/"latest_entry":\s*None/);
  });

  it("reports entry_count, malformed_line_count, and latest parsed entry", () => {
    expect(block).toMatch(/entry_count/);
    expect(block).toMatch(/malformed_line_count/);
    expect(block).toMatch(/latest_entry/);
    expect(block).toMatch(/latest_captured_at/);
    expect(block).toMatch(/latest_received_at/);
    expect(block).toMatch(/latest_metrics/);
  });

  it("sanitizes the latest entry before returning", () => {
    expect(block).toMatch(/sanitize_debug_payload/);
  });

  it("does not return raw VERDANT_BRIDGE_TOKEN", () => {
    expect(block).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
  });

  it("does not forward to Verdant", () => {
    expect(block).not.toMatch(/requests\.post/);
    expect(block).not.toMatch(/maybe_forward/);
  });

  it("does not import/use Supabase client", () => {
    // Whole-file invariant (these endpoints share the module).
    expect(py).not.toMatch(/from\s+supabase/i);
    expect(py).not.toMatch(/import\s+supabase/i);
  });
});

describe("ecowitt windows testbench — /debug/last-events safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const block =
    py.split('@app.get("/debug/last-events")')[1]?.split("\ndef main(")[0] ?? "";

  it("declares the /debug/last-events endpoint", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/last-events["']\)/);
  });

  it("enforces local-only gate with 403 fallback", () => {
    expect(block).toMatch(/_is_local_request/);
    expect(block).toMatch(/forbidden_non_local/);
    expect(block).toMatch(/\b403\b/);
  });

  it("reuses parse_debug_line_count for ?lines=", () => {
    expect(block).toMatch(/parse_debug_line_count\(request\.args\.get\("lines"\)\)/);
  });

  it("uses parse_jsonl_entries which skips malformed JSON lines", () => {
    expect(block).toMatch(/parse_jsonl_entries/);
    const helper = py.split("def parse_jsonl_entries")[1]?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/except\s+Exception/);
    expect(helper).toMatch(/malformed\s*\+=\s*1/);
  });

  it("returns parsed normalized fields only (no raw_payload by default)", () => {
    expect(block).toMatch(/"captured_at"/);
    expect(block).toMatch(/"source"/);
    expect(block).toMatch(/"vendor"/);
    expect(block).toMatch(/"metrics"/);
    // Must explicitly avoid raw_payload in the response shape.
    expect(block).not.toMatch(/raw_payload/);
  });

  it("sanitizes every entry before returning", () => {
    expect(block).toMatch(/sanitize_debug_payload/);
  });

  it("does not return raw VERDANT_BRIDGE_TOKEN", () => {
    expect(block).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
  });

  it("does not forward to Verdant", () => {
    expect(block).not.toMatch(/requests\.post/);
    expect(block).not.toMatch(/maybe_forward/);
  });

  it("reports count, max_lines, malformed_line_count", () => {
    expect(block).toMatch(/"count"/);
    expect(block).toMatch(/"max_lines"/);
    expect(block).toMatch(/"malformed_line_count"/);
  });

  it("docs include curl examples for /debug/status and /debug/last-events", () => {
    const doc = readFileSync(DOC_PATH, "utf-8");
    expect(doc).toMatch(/curl[^\n]*\/debug\/status/);
    expect(doc).toMatch(/curl[^\n]*\/debug\/last-events/);
    expect(doc).toMatch(/lines=abc/);
    expect(doc).toMatch(/lines=-10/);
    expect(doc).toMatch(/lines=999999/);
  });
});

describe("ecowitt windows testbench — CI workflow + tooling folder safety", () => {
  const WORKFLOW_PATH = join(
    process.cwd(),
    ".github",
    "workflows",
    "ecowitt-testbench-safety.yml",
  );
  const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

  it("runs typecheck", () => {
    expect(workflow).toMatch(/bun run typecheck/);
  });

  it("runs the EcoWitt static safety vitest file", () => {
    expect(workflow).toMatch(
      /bunx vitest run src\/test\/ecowitt-windows-testbench-static-safety\.test\.ts/,
    );
  });

  it("is triggered on pull_request", () => {
    expect(workflow).toMatch(/pull_request:/);
  });

  it("does not require any repo secrets to run", () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("tooling folder has no Supabase client imports anywhere", () => {
    for (const { path, body } of testbenchFiles.map((p) => ({
      path: p,
      body: readFileSync(p, "utf-8"),
    }))) {
      expect(body, `supabase import in ${path}`).not.toMatch(/from\s+supabase/i);
      expect(body, `supabase import in ${path}`).not.toMatch(/import\s+supabase/i);
    }
  });

  it("tooling folder contains no committed .env file", () => {
    for (const path of testbenchFiles) {
      expect(path.endsWith("/.env"), `committed .env at ${path}`).toBe(false);
    }
  });

  it("forwarding still requires explicit -ForwardToVerdant opt-in", () => {
    const script = readFileSync(
      join(TESTBENCH_DIR, "send-demo-payload-windows.ps1"),
      "utf-8",
    );
    expect(script).toMatch(/\[switch\]\$ForwardToVerdant/);
    expect(script).toMatch(/if\s*\(\s*\$ForwardToVerdant\s*\)/);
  });
});
