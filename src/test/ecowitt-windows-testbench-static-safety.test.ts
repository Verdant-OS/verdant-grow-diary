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

describe("ecowitt windows testbench — source labeling rules", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");

  it("defines the canonical ALLOWED_SOURCES set", () => {
    expect(py).toMatch(
      /ALLOWED_SOURCES\s*=\s*\{[^}]*"live"[^}]*"manual"[^}]*"csv"[^}]*"demo"[^}]*"stale"[^}]*"invalid"[^}]*\}/,
    );
  });

  it("declares EcoWitt gateway marker fields used to detect real uploads", () => {
    expect(py).toMatch(/ECOWITT_GATEWAY_MARKERS/);
    for (const marker of ["passkey", "stationtype", "model", "dateutc"]) {
      expect(py).toMatch(new RegExp(`"${marker}"`));
    }
  });

  it("resolve_source accepts payload + remote_addr (not just headers)", () => {
    expect(py).toMatch(
      /def\s+resolve_source\s*\([\s\S]*?payload[\s\S]*?remote_addr[\s\S]*?\)\s*->\s*str/,
    );
    expect(py).toMatch(
      /resolve_source\(payload=raw,\s*remote_addr=request\.remote_addr\)/,
    );
  });

  it("non-loopback gateway uploads are normalized to live", () => {
    expect(py).toMatch(/is_lan[\s\S]{0,120}looks_gateway/);
    expect(py).toMatch(/return\s+"live"/);
  });

  it("unknown payload source labels normalize to invalid, never live", () => {
    expect(py).toMatch(/return\s+"invalid"/);
    expect(py).toMatch(/explicit\s*==\s*"live"/);
  });

  it("loopback callers without explicit live opt-in stay demo", () => {
    expect(py).toMatch(/_is_loopback_source_addr/);
    expect(py).toMatch(/return\s+"demo"/);
  });

  it("debug status / events endpoints sanitize payloads (no token leaks)", () => {
    expect(py).toMatch(/sanitize_debug_payload/);
  });

  it("ships a Python unit test file for resolve_source", () => {
    const t = readFileSync(
      join(TESTBENCH_DIR, "test_source_labeling.py"),
      "utf-8",
    );
    expect(t).toMatch(/test_lan_ecowitt_gateway_is_live/);
    expect(t).toMatch(/test_loopback_browser_demo_is_demo/);
    expect(t).toMatch(/test_unknown_source_label_is_invalid_not_live/);
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
      ?.split("@app.get(") [0] ?? "";
    expect(endpointBlock).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
  });

  it("debug endpoint is read-only and does not forward to Verdant", () => {
    const endpointBlock = py
      .split("@app.get(\"/debug/raw-log-tail\")")[1]
      ?.split("@app.get(") [0] ?? "";
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

describe("ecowitt windows testbench — /debug/status extended fields", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const block =
    py.split('@app.get("/debug/status")')[1]?.split("@app.get(")[0] ?? "";

  it("includes parsed_line_count, skipped_line_count, last_parse_error", () => {
    expect(block).toMatch(/parsed_line_count/);
    expect(block).toMatch(/skipped_line_count/);
    expect(block).toMatch(/last_parse_error/);
  });

  it("missing log file returns zero counts and null last_parse_error", () => {
    const missing = block.split("LOG_PATH.exists()")[1]?.split("try:")[0] ?? "";
    expect(missing).toMatch(/"parsed_line_count":\s*0/);
    expect(missing).toMatch(/"skipped_line_count":\s*0/);
    expect(missing).toMatch(/"last_parse_error":\s*None/);
  });

  it("parse_jsonl_entries returns sanitized last error and never raw line text", () => {
    const helper = py.split("def parse_jsonl_entries")[1]?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/sanitize_debug_payload/);
    // Must use exception class+message, NOT the raw line `text` variable.
    expect(helper).toMatch(/type\(exc\)\.__name__/);
    expect(helper).not.toMatch(/last_err\s*=\s*text/);
  });

  it("latest_metrics is taken from sanitized entry", () => {
    expect(block).toMatch(/latest_metrics/);
    expect(block).toMatch(/sanitize_debug_payload/);
  });

  it("status endpoint does not forward or import supabase", () => {
    expect(block).not.toMatch(/requests\.post/);
    expect(block).not.toMatch(/maybe_forward/);
    expect(py).not.toMatch(/from\s+supabase/i);
  });

  it("status endpoint is loopback-only", () => {
    expect(block).toMatch(/_is_local_request/);
    expect(block).toMatch(/forbidden_non_local/);
  });
});

describe("ecowitt windows testbench — /debug/forwarding-status safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const block =
    py.split('@app.get("/debug/forwarding-status")')[1]?.split("@app.get(")[0]
    ?? py.split('@app.get("/debug/forwarding-status")')[1]?.split("\ndef main(")[0]
    ?? "";

  it("declares the /debug/forwarding-status endpoint", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/forwarding-status["']\)/);
  });

  it("enforces loopback-only with 403", () => {
    expect(block).toMatch(/_is_local_request/);
    expect(block).toMatch(/forbidden_non_local/);
    expect(block).toMatch(/\b403\b/);
  });

  it("returns forwarding configuration fields", () => {
    expect(block).toMatch(/forwarding_enabled/);
    expect(block).toMatch(/ingest_url_configured/);
    expect(block).toMatch(/bridge_token_configured/);
    expect(block).toMatch(/masked_ingest_url/);
    expect(block).toMatch(/masked_token_preview/);
  });

  it("returns attempt/success/failure counters and last-forward fields", () => {
    expect(block).toMatch(/forward_attempt_count/);
    expect(block).toMatch(/forward_success_count/);
    expect(block).toMatch(/forward_failure_count/);
    expect(block).toMatch(/last_forward_status/);
    expect(block).toMatch(/last_forward_at/);
    expect(block).toMatch(/last_forward_error/);
  });

  it("masks the token preview via mask_token and never returns the raw token", () => {
    expect(block).toMatch(/mask_token/);
    // The block must not return os.environ.get("VERDANT_BRIDGE_TOKEN") as-is.
    expect(block).not.toMatch(/"token"\s*:\s*token\b/);
    expect(block).not.toMatch(/"bridge_token"\s*:\s*token\b/);
  });

  it("masks the ingest URL via mask_ingest_url", () => {
    expect(block).toMatch(/mask_ingest_url/);
    const helper = py.split("def mask_ingest_url")[1]?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/\*\*\*/);
  });

  it("does not return Authorization header or raw payload", () => {
    expect(block).not.toMatch(/Authorization/);
    expect(block).not.toMatch(/raw_payload/);
  });

  it("sanitizes last_forward_error through sanitize_debug_payload", () => {
    expect(block).toMatch(/sanitize_debug_payload/);
  });

  it("does not forward or import supabase", () => {
    expect(block).not.toMatch(/requests\.post/);
    expect(block).not.toMatch(/maybe_forward/);
    expect(py).not.toMatch(/from\s+supabase/i);
    expect(py).not.toMatch(/import\s+supabase/i);
  });
});

describe("ecowitt windows testbench — forwarding counters", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const fn = py.split("def maybe_forward")[1]?.split("\ndef ")[0] ?? "";

  it("declares module-level FORWARD_STATS counters", () => {
    expect(py).toMatch(/FORWARD_STATS\s*:\s*Dict\[str,\s*Any\]\s*=\s*\{/);
    expect(py).toMatch(/"attempt_count"/);
    expect(py).toMatch(/"success_count"/);
    expect(py).toMatch(/"failure_count"/);
    expect(py).toMatch(/"last_status"/);
    expect(py).toMatch(/"last_at"/);
    expect(py).toMatch(/"last_error"/);
  });

  it("increments attempt counter only in the forwarding branch (after env checks)", () => {
    expect(fn).toMatch(/FORWARD_STATS\["attempt_count"\]\s*\+=\s*1/);
    // The attempt increment must come AFTER the early-return guards.
    const noFwdIdx = fn.indexOf('no_forwarding_configured');
    const attemptIdx = fn.indexOf('FORWARD_STATS["attempt_count"]');
    expect(noFwdIdx).toBeGreaterThanOrEqual(0);
    expect(attemptIdx).toBeGreaterThan(noFwdIdx);
  });

  it("increments success counter on 2xx response", () => {
    expect(fn).toMatch(/200\s*<=\s*resp\.status_code\s*<\s*300/);
    expect(fn).toMatch(/FORWARD_STATS\["success_count"\]\s*\+=\s*1/);
  });

  it("increments failure counter on non-2xx and on exception", () => {
    const failures = (fn.match(/FORWARD_STATS\["failure_count"\]\s*\+=\s*1/g) || []).length;
    expect(failures).toBeGreaterThanOrEqual(2);
    expect(fn).toMatch(/except\s+Exception/);
  });

  it("sanitizes the last error via _short_sanitized_error", () => {
    expect(fn).toMatch(/_short_sanitized_error/);
    const helper = py.split("def _short_sanitized_error")[1]?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/sanitize_debug_payload/);
  });
});

describe("ecowitt windows testbench — troubleshooting docs", () => {
  const doc = readFileSync(DOC_PATH, "utf-8");

  it("contains a troubleshooting section for malformed JSONL", () => {
    expect(doc).toMatch(/##\s+Troubleshooting malformed JSONL/);
  });

  it("documents common malformed JSONL cases", () => {
    expect(doc).toMatch(/partial write/i);
    expect(doc).toMatch(/manually edited/i);
    expect(doc).toMatch(/old test line/i);
    expect(doc).toMatch(/non-JSON raw body/i);
  });

  it("explains parsed/skipped/malformed counts and last_parse_error", () => {
    expect(doc).toMatch(/parsed_line_count/);
    expect(doc).toMatch(/skipped_line_count/);
    expect(doc).toMatch(/malformed_line_count/);
    expect(doc).toMatch(/last_parse_error/);
    expect(doc).toMatch(/latest_metrics/);
  });

  it("includes curl example for /debug/forwarding-status", () => {
    expect(doc).toMatch(/curl[^\n]*\/debug\/forwarding-status/);
  });
});

describe("ecowitt windows testbench — CI secret scan step", () => {
  const WORKFLOW_PATH = join(
    process.cwd(),
    ".github",
    "workflows",
    "ecowitt-testbench-safety.yml",
  );
  const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

  it("contains a testbench-only secret scan step", () => {
    expect(workflow).toMatch(/secret scan/i);
    expect(workflow).toMatch(/tools\/ecowitt-testbench/);
  });

  it("scan targets tools/ecowitt-testbench and uses grep", () => {
    expect(workflow).toMatch(/DIR=tools\/ecowitt-testbench/);
    expect(workflow).toMatch(/grep\s+-R/);
  });

  it("scan checks for vbt_, JWT, service_role, and hardcoded bearer patterns", () => {
    expect(workflow).toMatch(/vbt_/);
    expect(workflow).toMatch(/eyJ/);
    expect(workflow).toMatch(/service_role/);
    expect(workflow).toMatch(/Authorization/);
  });

  it("scan requires no repository secrets", () => {
    expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
  });

  it("scan allows the documented placeholder vbt_REPLACE_WITH_REAL_TOKEN", () => {
    expect(workflow).toMatch(/vbt_REPLACE_WITH_REAL_TOKEN/);
  });
});

describe("ecowitt windows testbench — forwarding-status troubleshooting docs", () => {
  const doc = readFileSync(DOC_PATH, "utf-8");

  it("has an Interpreting /debug/forwarding-status section", () => {
    expect(doc).toMatch(/###\s+Interpreting \/debug\/forwarding-status/);
  });

  it("documents that counters reset on restart", () => {
    expect(doc).toMatch(/in-memory.*reset.*restart/is);
  });

  it("includes safe curl and curl.exe examples for forwarding-status", () => {
    expect(doc).toMatch(/curl\s+"http:\/\/localhost:8787\/debug\/forwarding-status"/);
    expect(doc).toMatch(/curl\.exe\s+"http:\/\/localhost:8787\/debug\/forwarding-status"/);
  });

  it("forwarding-status curl examples do not include Authorization or token", () => {
    const section =
      doc.split("### Interpreting /debug/forwarding-status")[1]?.split("\n## ")[0]
      ?.split("\n### ")[0] ?? "";
    expect(section).not.toMatch(/Authorization:/i);
    expect(section).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(section).not.toMatch(/vbt_[A-Za-z0-9_-]{20,}/);
  });
});

describe("ecowitt windows testbench — verify-testbench-windows.ps1", () => {
  const SCRIPT_PATH = join(TESTBENCH_DIR, "verify-testbench-windows.ps1");

  it("file exists", () => {
    expect(() => readFileSync(SCRIPT_PATH, "utf-8")).not.toThrow();
  });

  const script = readFileSync(SCRIPT_PATH, "utf-8");

  it("runs bun run typecheck", () => {
    expect(script).toMatch(/bun run typecheck/);
  });

  it("runs the EcoWitt static safety vitest", () => {
    expect(script).toMatch(
      /bunx vitest run src\/test\/ecowitt-windows-testbench-static-safety\.test\.ts/,
    );
  });

  it("calls /health, /debug/status, and /debug/forwarding-status", () => {
    expect(script).toMatch(/\/health/);
    expect(script).toMatch(/\/debug\/status/);
    expect(script).toMatch(/\/debug\/forwarding-status/);
  });

  it("does not call -ForwardToVerdant", () => {
    expect(script).not.toMatch(/-ForwardToVerdant/);
  });

  it("does not read or print .env", () => {
    expect(script).not.toMatch(/Get-Content[^\n]*\.env/i);
    expect(script).not.toMatch(/cat\s+\.env/i);
    expect(script).not.toMatch(/Write-Host[^\n]*\.env/);
  });

  it("does not include real-looking bridge tokens", () => {
    const matches = script.match(/vbt_[A-Za-z0-9_-]{20,}/g) || [];
    for (const m of matches) {
      expect(m).toMatch(/^vbt_REPLACE_WITH_REAL_TOKEN$/);
    }
  });

  it("exits non-zero on failure", () => {
    expect(script).toMatch(/exit\s+1/);
  });

  it("tells the operator to start the listener if not running", () => {
    expect(script).toMatch(/start-listener-windows\.ps1/);
  });
});

describe("ecowitt windows testbench — /debug/parse-diagnostics safety", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const block =
    py.split('@app.get("/debug/parse-diagnostics")')[1]?.split("@app.get(")[0]
    ?? py.split('@app.get("/debug/parse-diagnostics")')[1]?.split("\ndef main(")[0]
    ?? "";

  it("declares the /debug/parse-diagnostics endpoint", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/parse-diagnostics["']\)/);
  });

  it("enforces loopback-only with 403 fallback", () => {
    expect(block).toMatch(/_is_local_request/);
    expect(block).toMatch(/forbidden_non_local/);
    expect(block).toMatch(/\b403\b/);
  });

  it("is read-only and does not forward", () => {
    expect(block).not.toMatch(/requests\.post/);
    expect(block).not.toMatch(/maybe_forward/);
  });

  it("does not import/use Supabase client", () => {
    expect(py).not.toMatch(/from\s+supabase/i);
    expect(py).not.toMatch(/import\s+supabase/i);
  });

  it("does not return raw JSONL lines or raw payloads", () => {
    expect(block).not.toMatch(/raw_payload/);
    expect(block).not.toMatch(/"raw_line"/);
    expect(block).not.toMatch(/"text"/);
  });

  it("returns category counts and last_parse_error", () => {
    expect(block).toMatch(/"categories"/);
    expect(block).toMatch(/"last_parse_error"/);
    expect(block).toMatch(/"count"/);
  });

  it("uses categorize_parse_issue helper that enumerates category names", () => {
    const helper = py.split("def categorize_parse_issue")[1]?.split("\n@app")[0]
      ?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/json_decode_error/);
    expect(helper).toMatch(/non_object_json/);
    expect(helper).toMatch(/missing_metrics/);
    expect(helper).toMatch(/missing_captured_at/);
    expect(helper).toMatch(/secret_redacted/);
    expect(helper).toMatch(/empty_line/);
  });

  it("sanitizes parse errors via sanitize_debug_payload", () => {
    const helper = py.split("def categorize_parse_issue")[1]?.split("\n@app")[0]
      ?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/sanitize_debug_payload/);
    // Must never put the raw line text into the error string.
    expect(helper).not.toMatch(/last_error\s*=\s*text/);
    expect(helper).not.toMatch(/last_error\s*=\s*raw_text/);
  });

  it("missing log file returns safe zero counts", () => {
    expect(block).toMatch(/LOG_PATH\.exists\(\)/);
    expect(block).toMatch(/"log_exists":\s*False/);
    expect(block).toMatch(/"parsed_line_count":\s*0/);
    expect(block).toMatch(/"malformed_line_count":\s*0/);
    expect(block).toMatch(/"skipped_line_count":\s*0/);
    expect(block).toMatch(/"categories":\s*\[\]/);
    expect(block).toMatch(/"last_parse_error":\s*None/);
  });

  it("malformed lines never crash — categorizer is wrapped in try/except", () => {
    const helper = py.split("def categorize_parse_issue")[1]?.split("\n@app")[0]
      ?.split("\ndef ")[0] ?? "";
    expect(helper).toMatch(/except\s+Exception/);
  });
});

describe("ecowitt windows testbench — parse-diagnostics docs", () => {
  const doc = readFileSync(DOC_PATH, "utf-8");

  it("documents the parse-diagnostics curl examples", () => {
    expect(doc).toMatch(/curl\s+"http:\/\/localhost:8787\/debug\/parse-diagnostics"/);
    expect(doc).toMatch(/curl\.exe\s+"http:\/\/localhost:8787\/debug\/parse-diagnostics"/);
  });

  it("mentions it is loopback-only and sanitized", () => {
    const section = doc.split("### Parse diagnostics")[1]?.split("\n## ")[0]
      ?.split("\n### ")[0] ?? "";
    expect(section).toMatch(/loopback-only/i);
    expect(section).toMatch(/sanitiz/i);
    expect(section).toMatch(/never returns raw/i);
  });

  it("lists multiple categories operators can expect", () => {
    const section = doc.split("### Parse diagnostics")[1]?.split("\n## ")[0]
      ?.split("\n### ")[0] ?? "";
    expect(section).toMatch(/json_decode_error/);
    expect(section).toMatch(/missing_metrics/);
    expect(section).toMatch(/missing_captured_at/);
    expect(section).toMatch(/secret_redacted/);
  });

  it("documents the one-command verification script", () => {
    expect(doc).toMatch(/verify-testbench-windows\.ps1/);
  });
});

describe("ecowitt windows testbench — preserved behavior", () => {
  const py = readFileSync(join(TESTBENCH_DIR, "ecowitt_listener.py"), "utf-8");
  const WORKFLOW_PATH = join(
    process.cwd(),
    ".github",
    "workflows",
    "ecowitt-testbench-safety.yml",
  );
  const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

  it("/debug/status still exists", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/status["']\)/);
  });

  it("/debug/forwarding-status still exists", () => {
    expect(py).toMatch(/@app\.get\(["']\/debug\/forwarding-status["']\)/);
  });

  it("CI secret scan step still exists", () => {
    expect(workflow).toMatch(/secret scan/i);
    expect(workflow).toMatch(/tools\/ecowitt-testbench/);
  });

  it("typecheck still in workflow", () => {
    expect(workflow).toMatch(/bun run typecheck/);
  });

  it("no Supabase client imports anywhere in testbench files", () => {
    for (const path of testbenchFiles) {
      const body = readFileSync(path, "utf-8");
      expect(body, `supabase import in ${path}`).not.toMatch(/from\s+supabase/i);
      expect(body, `supabase import in ${path}`).not.toMatch(/import\s+supabase/i);
    }
  });

  it("no real-looking tokens/JWT/service-role in any testbench file", () => {
    for (const path of testbenchFiles) {
      const body = readFileSync(path, "utf-8");
      const tokens = body.match(/vbt_[A-Za-z0-9_-]{20,}/g) || [];
      for (const t of tokens) expect(t).toMatch(/^vbt_REPLACE_WITH_REAL_TOKEN$/);
      expect(body, `JWT in ${path}`).not.toMatch(
        /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
      );
      expect(body, `service_role literal in ${path}`).not.toMatch(/service_role/i);
    }
  });
});



describe("ecowitt windows testbench — preflight + wrapper + CI artifacts", () => {
  const preflightPath = join(TESTBENCH_DIR, "preflight-windows.ps1");
  const wrapperPath = join(TESTBENCH_DIR, "run-testbench-windows.ps1");
  const WORKFLOW_PATH = join(
    process.cwd(),
    ".github",
    "workflows",
    "ecowitt-testbench-safety.yml",
  );
  const doc = readFileSync(DOC_PATH, "utf-8");
  const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

  it("preflight-windows.ps1 exists", () => {
    expect(statSync(preflightPath).isFile()).toBe(true);
  });

  it("preflight verifies tools/ecowitt-testbench and expected files", () => {
    const body = readFileSync(preflightPath, "utf-8");
    expect(body).toMatch(/tools\\ecowitt-testbench/);
    for (const f of [
      ".env.example",
      "ecowitt_listener.py",
      "requirements.txt",
      "send-demo-payload-windows.ps1",
      "setup-windows.ps1",
      "start-listener-windows.ps1",
      "verify-testbench-windows.ps1",
      "preflight-windows.ps1",
    ]) {
      expect(body, `preflight missing check for ${f}`).toContain(f);
    }
    expect(body).toMatch(/docs\\ecowitt-windows-testbench\.md/);
    expect(body).toMatch(/src\\test\\ecowitt-windows-testbench-static-safety\.test\.ts/);
    expect(body).toMatch(/\.github\\workflows\\ecowitt-testbench-safety\.yml/);
  });

  it("preflight warns about old standalone verdant-testbench folder", () => {
    const body = readFileSync(preflightPath, "utf-8");
    expect(body).toMatch(/old standalone testbench folder/i);
    expect(body).toMatch(/verdant-testbench/);
  });

  it("preflight prints git pull origin verdant-grow-diary", () => {
    const body = readFileSync(preflightPath, "utf-8");
    expect(body).toMatch(/git pull origin verdant-grow-diary/);
  });

  it("preflight does not read .env or forward", () => {
    const body = readFileSync(preflightPath, "utf-8");
    expect(body).not.toMatch(/Get-Content\s+.*\.env/i);
    expect(body).not.toMatch(/-ForwardToVerdant/);
    expect(body).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
  });

  it("run-testbench-windows.ps1 exists and orchestrates preflight/setup/verify", () => {
    const body = readFileSync(wrapperPath, "utf-8");
    expect(body).toMatch(/preflight-windows\.ps1/);
    expect(body).toMatch(/setup-windows\.ps1/);
    expect(body).toMatch(/start-listener-windows\.ps1/);
    expect(body).toMatch(/verify-testbench-windows\.ps1/);
    expect(body).toMatch(/localhost:8787\/health/);
  });

  it("run-testbench wrapper is safe (no .env read, no forward, no default POST)", () => {
    const body = readFileSync(wrapperPath, "utf-8");
    expect(body).not.toMatch(/Get-Content\s+.*\.env/i);
    expect(body).not.toMatch(/-ForwardToVerdant/);
    expect(body).not.toMatch(/Invoke-RestMethod\s+-Method\s+Post/i);
    expect(body).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
  });

  it("docs add wrong-folder/out-of-date checkout troubleshooting section", () => {
    expect(doc).toMatch(/Troubleshooting:\s*wrong folder or out-of-date checkout/i);
    expect(doc).toMatch(/dir tools\\ecowitt-testbench/);
    expect(doc).toMatch(/verdant-testbench/);
    expect(doc).toMatch(/git pull origin verdant-grow-diary/);
  });

  it("docs document the one-command wrapper", () => {
    expect(doc).toMatch(/run-testbench-windows\.ps1/);
  });

  it("CI workflow uses actions/upload-artifact", () => {
    expect(workflow).toMatch(/actions\/upload-artifact@/);
    expect(workflow).toMatch(/ecowitt-testbench-safety-logs/);
  });

  it("CI workflow captures typecheck, static safety, and secret scan logs", () => {
    expect(workflow).toMatch(/artifacts\/ecowitt-testbench\/typecheck\.log/);
    expect(workflow).toMatch(/artifacts\/ecowitt-testbench\/static-safety\.log/);
    expect(workflow).toMatch(/artifacts\/ecowitt-testbench\/secret-scan\.log/);
  });

  it("CI workflow preserves command failures via pipefail", () => {
    expect(workflow).toMatch(/set -o pipefail/);
  });

  it("CI workflow does not upload .env or raw JSONL", () => {
    expect(workflow).not.toMatch(/\.env(\s|$|"|')/);
    expect(workflow).not.toMatch(/ecowitt_raw_log\.jsonl/);
  });

  it("CI workflow still runs typecheck and static safety tests", () => {
    expect(workflow).toMatch(/bun run typecheck/);
    expect(workflow).toMatch(/ecowitt-windows-testbench-static-safety\.test\.ts/);
  });

  it("CI secret scan still scoped to tools/ecowitt-testbench", () => {
    expect(workflow).toMatch(/DIR=tools\/ecowitt-testbench/);
  });
});

describe("ecowitt windows testbench — preflight path-safety regression", () => {
  const body = readFileSync(join(TESTBENCH_DIR, "preflight-windows.ps1"), "utf-8");

  it("never calls Resolve-Path without -LiteralPath", () => {
    // Reject `Resolve-Path $x` or `Resolve-Path "..."` style calls.
    // Every Resolve-Path call must use -LiteralPath.
    const calls = body.match(/Resolve-Path\b[^\r\n]*/g) || [];
    for (const c of calls) {
      expect(c, `Resolve-Path call must use -LiteralPath: ${c}`).toMatch(/-LiteralPath/);
    }
  });

  it("uses Test-Path -LiteralPath for filesystem probes", () => {
    expect(body).toMatch(/Test-Path -LiteralPath/);
    // The fragile pattern from the bug — `Resolve-Path $c` — must not return.
    expect(body).not.toMatch(/Resolve-Path\s+\$[A-Za-z_]/);
  });

  it("guards Resolve-Path with Test-Path via a safe helper", () => {
    expect(body).toMatch(/function\s+Get-SafePath/);
    expect(body).toMatch(/\$PSScriptRoot/);
  });

  it("still checks all expected kit + repo files", () => {
    for (const f of [
      ".env.example",
      "ecowitt_listener.py",
      "requirements.txt",
      "send-demo-payload-windows.ps1",
      "setup-windows.ps1",
      "start-listener-windows.ps1",
      "verify-testbench-windows.ps1",
      "preflight-windows.ps1",
    ]) {
      expect(body, `preflight no longer checks ${f}`).toContain(f);
    }
    expect(body).toMatch(/docs\\ecowitt-windows-testbench\.md/);
    expect(body).toMatch(/src\\test\\ecowitt-windows-testbench-static-safety\.test\.ts/);
    expect(body).toMatch(/\.github\\workflows\\ecowitt-testbench-safety\.yml/);
  });

  it("preserves safety: no .env read, no forwarding, no token printing", () => {
    expect(body).not.toMatch(/Get-Content\s+.*\.env/i);
    expect(body).not.toMatch(/-ForwardToVerdant/);
    expect(body).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
    expect(body).not.toMatch(/Start-Process.*listener/i);
  });
});

describe("ecowitt windows testbench — preflight diagnostics + invocation smoke", () => {
  const body = readFileSync(join(TESTBENCH_DIR, "preflight-windows.ps1"), "utf-8");

  it("preflight accepts -Diagnostics switch", () => {
    expect(body).toMatch(/\[switch\]\$Diagnostics/);
    expect(body).toMatch(/=== Diagnostics \(safe paths only\) ===/);
  });

  it("preflight diagnostics block prints only safe path info", () => {
    // Diagnostics must not leak sensitive markers.
    const diagBlock = body.split("=== Diagnostics (safe paths only) ===")[1] ?? "";
    expect(diagBlock).not.toMatch(/Authorization/);
    expect(diagBlock).not.toMatch(/Bearer/);
    expect(diagBlock).not.toMatch(/vbt_[A-Za-z0-9_-]/);
    expect(diagBlock).not.toMatch(/Get-Content\s+.*\.env/i);
    expect(diagBlock).not.toMatch(/raw_payload/);
  });

  it("preflight failure block prints improved wrong-folder guidance", () => {
    expect(body).toMatch(/EcoWitt testbench preflight failed\./);
    expect(body).toMatch(/Expected repo-relative paths:/);
    expect(body).toMatch(/git pull origin verdant-grow-diary/);
    expect(body).toMatch(/preflight-windows\.ps1 -Diagnostics/);
    expect(body).toMatch(/old standalone testbench folder/i);
  });

  it("preflight uses Write-Verbose for internals", () => {
    expect(body).toMatch(/Write-Verbose/);
    expect(body).toMatch(/\[CmdletBinding\(\)\]/);
  });
});

describe("ecowitt windows testbench — preflight PowerShell invocation smoke", () => {
  // These tests actually invoke PowerShell. Skip when no PS executable
  // is available so non-Windows CI does not fail.
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const { existsSync } = require("node:fs") as typeof import("node:fs");

  function findPwsh(): string | null {
    for (const c of ["pwsh", "powershell.exe", "powershell"]) {
      const r = spawnSync(c, ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
        encoding: "utf-8",
      });
      if (r.status === 0) return c;
    }
    return null;
  }

  const pwsh = findPwsh();
  const repoRoot = process.cwd();
  const tbDir = TESTBENCH_DIR;
  const scriptRel = "tools\\ecowitt-testbench\\preflight-windows.ps1";
  const scriptAbs = join(tbDir, "preflight-windows.ps1");

  const skipMsg = "PowerShell not available; skipping invocation smoke tests";
  const maybeIt = pwsh ? it : it.skip;

  if (!pwsh) {
    it("invocation smoke tests skipped (no powershell/pwsh in PATH)", () => {
      console.warn(skipMsg);
      expect(existsSync(scriptAbs)).toBe(true);
    });
  }

  function runPreflight(cwd: string, args: string[]) {
    return spawnSync(
      pwsh!,
      ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptAbs, ...args],
      { cwd, encoding: "utf-8", timeout: 30_000 },
    );
  }

  function assertSafeOutput(out: string) {
    expect(out).not.toMatch(/Illegal characters in path/);
    expect(out).not.toMatch(/Resolve-Path\s*:/);
    expect(out).not.toMatch(/ArgumentException/);
    expect(out).not.toMatch(/Authorization/);
    expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{8,}/);
    expect(out).not.toMatch(/vbt_[A-Za-z0-9_-]{8,}/);
    expect(out).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  }

  maybeIt("invokes successfully from repo root", () => {
    const r = runPreflight(repoRoot, []);
    const out = (r.stdout || "") + (r.stderr || "");
    assertSafeOutput(out);
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/\[preflight\]/);
    expect(out.toLowerCase()).toMatch(/repo root/);
  });

  maybeIt("invokes successfully from tools/ecowitt-testbench", () => {
    const r = runPreflight(tbDir, []);
    const out = (r.stdout || "") + (r.stderr || "");
    assertSafeOutput(out);
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/\[preflight\]/);
  });

  maybeIt("invokes successfully by direct script path from repo root with -Diagnostics", () => {
    const r = runPreflight(repoRoot, ["-Diagnostics"]);
    const out = (r.stdout || "") + (r.stderr || "");
    assertSafeOutput(out);
    expect(r.status, out).toBe(0);
    expect(out).toMatch(/Diagnostics \(safe paths only\)/);
    expect(out.toLowerCase()).toMatch(/detected repo root/);
  });
});

describe("ecowitt windows testbench — forwarding tent-context safety", () => {
  const LISTENER_PATH = join(TESTBENCH_DIR, "ecowitt_listener.py");
  const ENV_EXAMPLE_PATH = join(TESTBENCH_DIR, ".env.example");
  const listener = readFileSync(LISTENER_PATH, "utf-8");
  const envExample = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
  const doc = readFileSync(DOC_PATH, "utf-8");

  it("listener defines tent-id readiness helpers", () => {
    expect(listener).toMatch(/def is_valid_tent_id\(/);
    expect(listener).toMatch(/def evaluate_forwarding_readiness\(/);
  });

  it("listener blocks forwarding when tent_id is missing or invalid", () => {
    expect(listener).toMatch(/blocked_missing_tent_id/);
    expect(listener).toMatch(/blocked_invalid_tent_id/);
    expect(listener).toMatch(/forwarding blocked locally/);
  });

  it("listener attaches tent_id to forwarded payload and x-verdant-tent-id header", () => {
    expect(listener).toMatch(/outbound\["tent_id"\]\s*=\s*tent_id/);
    expect(listener).toMatch(/"x-verdant-tent-id"/);
  });

  it("forwarding-status exposes tent_id_configured / tent_id_valid / forwarding_ready", () => {
    expect(listener).toMatch(/"tent_id_configured"/);
    expect(listener).toMatch(/"tent_id_valid"/);
    expect(listener).toMatch(/"forwarding_ready"/);
    expect(listener).toMatch(/"forward_blocked_count"/);
  });

  it("forwarding-status does not echo the raw tent UUID value", () => {
    expect(listener).not.toMatch(/"tent_id":\s*tent_id\b/);
  });

  it(".env.example documents VERDANT_TENT_ID as a real UUID requirement", () => {
    expect(envExample).toMatch(/VERDANT_TENT_ID=/);
    expect(envExample).toMatch(/UUID/i);
    expect(envExample).toMatch(/Flower Tent|display name/i);
    expect(envExample).toMatch(/tent-1|demo-tent/);
  });

  it("docs explain http_400 + tent_id: null troubleshooting", () => {
    expect(doc).toMatch(/VERDANT_TENT_ID/);
    expect(doc).toMatch(/http[_ ]?400|HTTP 400/i);
    expect(doc).toMatch(/tent_id/);
    expect(doc).toMatch(/forwarding_ready/);
  });
});

describe("ecowitt windows testbench — forwarding response sanitization", () => {
  const LISTENER_PATH = join(TESTBENCH_DIR, "ecowitt_listener.py");
  const listener = readFileSync(LISTENER_PATH, "utf-8");
  const doc = readFileSync(DOC_PATH, "utf-8");
  const fwdBlock =
    listener.split('@app.get("/debug/forwarding-status")')[1]?.split("@app.get(")[0] ??
    "";

  it("declares sanitize_forward_error_value and summarize_forward_response helpers", () => {
    expect(listener).toMatch(/def\s+sanitize_forward_error_value\(/);
    expect(listener).toMatch(/def\s+summarize_forward_response\(/);
  });

  it("captures sanitized webhook response fields in FORWARD_STATS", () => {
    expect(listener).toMatch(/"last_forward_response_error"/);
    expect(listener).toMatch(/"last_forward_response_classification"/);
    expect(listener).toMatch(/"last_forward_response_message"/);
  });

  it("/debug/forwarding-status exposes sanitized response fields", () => {
    expect(fwdBlock).toMatch(/last_forward_response_error/);
    expect(fwdBlock).toMatch(/last_forward_response_classification/);
    expect(fwdBlock).toMatch(/last_forward_response_message/);
    expect(fwdBlock).toMatch(/sanitize_forward_error_value/);
  });

  it("/debug/forwarding-status still never echoes Authorization or raw payload", () => {
    expect(fwdBlock).not.toMatch(/Authorization/);
    expect(fwdBlock).not.toMatch(/raw_payload/);
  });

  it("forwarded payload uses webhook transport source, never raw verdant 'live'", () => {
    expect(listener).toMatch(/WEBHOOK_TRANSPORT_SOURCE\s*=\s*"ecowitt"/);
    const fn = listener.split("def maybe_forward")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/"source":\s*WEBHOOK_TRANSPORT_SOURCE/);
    // Verdant source must be preserved as lineage in metadata, not as `source`.
    expect(fn).toMatch(/verdant_source/);
  });

  it("PASSKEY is stripped from forwarded raw_payload", () => {
    expect(listener).toMatch(/_redact_raw_payload_for_forward/);
    expect(listener).toMatch(/_FORWARD_PAYLOAD_REDACT_KEYS/);
    // The redactor must drop PASSKEY in any common case.
    const redactor =
      listener.split("def _redact_raw_payload_for_forward")[1]?.split("\ndef ")[0] ?? "";
    expect(redactor).toMatch(/passkey/i);
  });

  it("summarize_forward_response never returns response.text without sanitization", () => {
    const fn =
      listener.split("def summarize_forward_response")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/sanitize_forward_error_value/);
    // Must not assign raw resp.text directly into output keys.
    expect(fn).not.toMatch(/"message"\s*:\s*text\b/);
    expect(fn).not.toMatch(/"error"\s*:\s*text\b/);
  });

  it("inline redactor scrubs embedded vbt_ / JWT / Bearer substrings", () => {
    expect(listener).toMatch(/_INLINE_REDACT_PATTERNS/);
    expect(listener).toMatch(/vbt_\[A-Za-z0-9_\\-\]/);
    expect(listener).toMatch(/eyJ\[A-Za-z0-9_\\-\]/);
    expect(listener).toMatch(/bearer/i);
  });

  it("docs explain sanitized forwarding response diagnostics", () => {
    expect(doc).toMatch(/last_forward_response_error/);
    expect(doc).toMatch(/last_forward_response_classification/);
    expect(doc).toMatch(/last_forward_response_message/);
    expect(doc).toMatch(/invalid_payload/);
    expect(doc).toMatch(/forbidden_tent/);
    expect(doc).toMatch(/tent_lookup_failed/);
    expect(doc).toMatch(/insert_failed/);
    expect(doc).toMatch(/Never paste bridge token/i);
  });
});

describe("ecowitt windows testbench — retry/backoff + error report", () => {
  const LISTENER_PATH = join(TESTBENCH_DIR, "ecowitt_listener.py");
  const listener = readFileSync(LISTENER_PATH, "utf-8");
  const doc = readFileSync(DOC_PATH, "utf-8");

  it("declares bounded retry constants and helpers", () => {
    expect(listener).toMatch(/MAX_RETRY_ATTEMPTS\s*=\s*\d/);
    expect(listener).toMatch(/RETRYABLE_STATUSES\s*=\s*\{/);
    expect(listener).toMatch(/def is_retryable_status\(/);
    expect(listener).toMatch(/def compute_backoff_delay\(/);
  });

  it("retry set includes transient statuses and excludes terminal ones", () => {
    const block =
      listener.split("RETRYABLE_STATUSES = {")[1]?.split("}")[0] ?? "";
    for (const s of ["408", "425", "429", "500", "502", "503", "504"]) {
      expect(block).toContain(s);
    }
    for (const s of ["400", "401", "403", "404", "405", "409"]) {
      expect(block).not.toContain(s);
    }
  });

  it("retry loop is bounded (uses MAX_RETRY_ATTEMPTS, not while True)", () => {
    const fn = listener.split("def maybe_forward")[1]?.split("\ndef ")[0] ?? "";
    expect(fn).toMatch(/range\(MAX_RETRY_ATTEMPTS\s*\+\s*1\)/);
    expect(fn).not.toMatch(/while\s+True/);
    // No unbounded queue wording
    expect(fn).not.toMatch(/queue\.put|deque\(/);
  });

  it("forwarding-status exposes retry tracking fields", () => {
    const fwd =
      listener.split('@app.get("/debug/forwarding-status")')[1]?.split("@app.get(")[0] ?? "";
    expect(fwd).toMatch(/"retry_count"/);
    expect(fwd).toMatch(/"last_retry_error"/);
    expect(fwd).toMatch(/"last_retry_at"/);
    expect(fwd).toMatch(/"last_retryable_status"/);
    expect(fwd).toMatch(/"max_retry_attempts"/);
  });

  it("/debug/forwarding-error-report endpoint exists and is loopback-only + sanitized", () => {
    expect(listener).toMatch(/@app\.get\("\/debug\/forwarding-error-report"\)/);
    const fn =
      listener.split('@app.get("/debug/forwarding-error-report")')[1]?.split("@app.get(")[0] ?? "";
    expect(fn).toMatch(/_is_local_request\(\)/);
    expect(fn).toMatch(/recommended_next_step/);
    expect(fn).toMatch(/sanitize_debug_payload/);
    // never echoes Authorization or raw payload
    expect(fn).not.toMatch(/Authorization/);
    expect(fn).not.toMatch(/raw_payload/);
    // never reads .env file contents (allow os.environ access)
    expect(fn).not.toMatch(/open\([^)]*\.env\b/);
    expect(fn).not.toMatch(/\.env"|'\.env'/);
  });

  it("no endpoint reads or returns .env file contents", () => {
    // Routes must not open or return the .env file body.
    expect(listener).not.toMatch(/open\([^)]*\.env[^)]*\)/);
  });

  it("summarize_forward_response sanitizes resp.text before storing", () => {
    const fn =
      listener.split("def summarize_forward_response")[1]?.split("\ndef ")[0] ?? "";
    // Must call sanitizer; must not pass raw text straight into message
    expect(fn).toMatch(/sanitize_forward_error_value\(text\)/);
  });

  it("docs document /debug/forwarding-error-report and retry behavior", () => {
    expect(doc).toMatch(/\/debug\/forwarding-error-report/);
    expect(doc).toMatch(/recommended_next_step/);
    expect(doc).toMatch(/retry_count/);
    expect(doc).toMatch(/max_retry_attempts/);
    expect(doc).toMatch(/exponential backoff/i);
  });

  it("docs include troubleshooting checklist with each classification", () => {
    for (const cls of [
      "invalid_payload",
      "unauthorized",
      "forbidden_tent",
      "tent_lookup_failed",
      "insert_failed",
      "server_misconfigured",
      "method_not_allowed",
      "internal_error",
      "non_json_response",
      "blocked_missing_tent_id",
      "blocked_invalid_tent_id",
    ]) {
      expect(doc, `docs missing checklist row for ${cls}`).toContain(cls);
    }
  });

  it("golden contract fixture has no secrets", () => {
    const fixture = readFileSync(
      join(TESTBENCH_DIR, "fixtures", "golden_forwarded_payload.json"),
      "utf-8",
    );
    expect(fixture).not.toMatch(/PASSKEY/i);
    expect(fixture).not.toMatch(/vbt_[A-Za-z0-9_\-]{6,}/);
    expect(fixture).not.toMatch(/Authorization/);
    expect(fixture).not.toMatch(/Bearer\s+/);
    expect(fixture).not.toMatch(/service_role/i);
  });

  it("golden contract test file exists and asserts contract fields", () => {
    const test = readFileSync(
      join(TESTBENCH_DIR, "test_forwarding_contract.py"),
      "utf-8",
    );
    expect(test).toMatch(/source.*ecowitt/);
    expect(test).toMatch(/tent_id/);
    expect(test).toMatch(/verdant_source/);
    expect(test).toMatch(/PASSKEY/);
  });
});



describe("ecowitt windows testbench — forwarding tests CI workflow", () => {
  const WORKFLOW_PATH = join(
    process.cwd(),
    ".github",
    "workflows",
    "ecowitt-testbench-forwarding-tests.yml",
  );
  const wf = readFileSync(WORKFLOW_PATH, "utf-8");

  it("workflow file exists and triggers on PR + push for relevant paths", () => {
    expect(wf).toMatch(/pull_request:/);
    expect(wf).toMatch(/push:/);
    expect(wf).toContain("tools/ecowitt-testbench/**");
    expect(wf).toContain("docs/ecowitt-windows-testbench.md");
    expect(wf).toContain("src/test/ecowitt-windows-testbench-static-safety.test.ts");
  });

  it("workflow runs python forwarding tests", () => {
    expect(wf).toMatch(/python3?\s+-m\s+unittest\s+test_forwarding_config/);
    expect(wf).toMatch(/python3?\s+-m\s+unittest\s+test_source_labeling/);
    expect(wf).toMatch(/python3?\s+-m\s+unittest\s+test_forwarding_contract/);
  });

  it("workflow runs the static safety vitest suite + typecheck", () => {
    expect(wf).toContain(
      "bunx vitest run src/test/ecowitt-windows-testbench-static-safety.test.ts",
    );
    expect(wf).toMatch(/bun run typecheck/);
  });

  it("workflow does not require production secrets and does not upload .env/raw logs/tokens", () => {
    // No use of repository secrets / production tokens.
    expect(wf).not.toMatch(/secrets\./);
    expect(wf).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    // No raw JSONL / .env upload paths.
    expect(wf).not.toMatch(/ecowitt_raw_log\.jsonl/);
    expect(wf).not.toMatch(/path:\s*[^\n]*\.env\b/);
    // Test-only env values must not look like real vbt_ tokens.
    const realToken = /VERDANT_BRIDGE_TOKEN:\s*"vbt_[A-Za-z0-9_-]{20,}"/;
    expect(wf).not.toMatch(realToken);
  });
});

describe("ecowitt windows testbench — operator forwarding widget safety", () => {
  const WIDGET_PATH = join(
    process.cwd(),
    "src",
    "components",
    "EcowittLocalForwardingStatusWidget.tsx",
  );
  const HELPER_PATH = join(
    process.cwd(),
    "src",
    "lib",
    "ecowittLocalForwardingStatus.ts",
  );
  const widget = readFileSync(WIDGET_PATH, "utf-8");
  const helper = readFileSync(HELPER_PATH, "utf-8");

  it("widget only fetches localhost:8787 (no remote URLs)", () => {
    // Combined helper + widget must reference only localhost for fetch.
    expect(helper).toContain("http://localhost:8787");
    expect(widget).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(helper).not.toMatch(/supabase\.co/);
  });

  it("widget never imports supabase client or admin role", () => {
    expect(widget).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(widget).not.toMatch(/service_role/i);
    expect(helper).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("helper deep-sanitizes forbidden keys before display/copy", () => {
    expect(helper).toMatch(/FORBIDDEN_KEYS/);
    expect(helper).toMatch(/authorization/);
    expect(helper).toMatch(/passkey/);
    expect(helper).toMatch(/raw_payload/);
  });

  it("widget shows offline copy when local bridge unreachable", () => {
    expect(widget).toMatch(/not reachable on localhost:8787/i);
  });
});
