/**
 * QuickLog v2 RPC reason-code regression.
 *
 * Keeps the documented allow-list in docs/quicklog-rpc-safety.md aligned with
 * the actual reason codes emitted by public.quicklog_save_manual, and proves
 * those codes are safe tokens that never leak SQL, schema, table, or UUID
 * details.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentQuicklogManualRpcSource } from "./quicklogManualRpcSource";

const ROOT = resolve(__dirname, "../..");
const DOC_PATH = resolve(ROOT, "docs/quicklog-rpc-safety.md");
const body = currentQuicklogManualRpcSource()?.body ?? "";
const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

function reasonCodesInSql(s: string): string[] {
  const codes = new Set<string>();
  for (const m of s.matchAll(/'reason'\s*,\s*'([^']+)'/g)) codes.add(m[1]);
  return [...codes].sort();
}

function reasonCodesInDoc(d: string): string[] {
  const codes = new Set<string>();
  // Markdown table rows: | `code` | ... |
  for (const m of d.matchAll(/\|\s*`([a-z][a-z0-9_]{2,40})`\s*\|/g)) {
    codes.add(m[1]);
  }
  return [...codes].sort();
}

describe("quicklog_save_manual — reason-code doc alignment", () => {
  it("safety doc exists", () => {
    expect(doc.length).toBeGreaterThan(200);
  });

  it("migration is discoverable", () => {
    expect(body.length).toBeGreaterThan(200);
  });

  it("every RPC reason code is documented in the safety doc", () => {
    const fromSql = reasonCodesInSql(body);
    const fromDoc = reasonCodesInDoc(doc);
    expect(fromSql.length).toBeGreaterThan(0);
    for (const code of fromSql) {
      expect(fromDoc).toContain(code);
    }
  });

  it("every documented reason code still exists in the RPC", () => {
    const fromSql = new Set(reasonCodesInSql(body));
    // Pull only codes that appear inside the allow-list section.
    const allowSection = doc.match(/Allowed safe reason codes[\s\S]+?##\s/)?.[0] ?? "";
    const documented = reasonCodesInDoc(allowSection);
    expect(documented.length).toBeGreaterThan(0);
    for (const code of documented) {
      expect(fromSql.has(code)).toBe(true);
    }
  });
});

describe("quicklog_save_manual — reason-code safety", () => {
  const codes = reasonCodesInSql(body);

  it("uses safe short tokens", () => {
    for (const c of codes) expect(c).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
  });

  it("never contains SQL keywords", () => {
    for (const c of codes) {
      expect(c).not.toMatch(/select|insert|update|delete|from|where|join/i);
    }
  });

  it("never names a schema or table", () => {
    for (const c of codes) {
      expect(c).not.toMatch(/public\.|auth\./i);
      expect(c).not.toMatch(
        /\b(grow_events|environment_events|watering_events|plants|tents|grows|alerts|action_queue|ai_doctor_sessions)\b/i,
      );
    }
  });

  it("never leaks UUIDs or stack traces", () => {
    for (const c of codes) {
      expect(c).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(c).not.toMatch(/\bat\s+\w+\s*\(/);
    }
  });
});
