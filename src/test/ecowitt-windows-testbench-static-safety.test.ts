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

  it("clamps the lines query param to a maximum of 50", () => {
    // Look for the clamp logic explicitly.
    expect(py).toMatch(/max_lines\s*=\s*50/);
    expect(py).toMatch(/if\s+n\s*>\s*max_lines/);
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
      "service_role",
    ]) {
      expect(py, `missing secret field name: ${name}`).toMatch(
        new RegExp(`["']${name}["']`),
      );
    }
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
