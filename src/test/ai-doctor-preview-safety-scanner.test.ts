import { describe, expect, it } from "vitest";
import {
  ALLOW_MARKER,
  ALLOW_PHRASES,
  RULES,
  formatViolation,
  scanText,
} from "../../scripts/assert-ai-doctor-preview-safety.mjs";

describe("ai-doctor preview safety scanner", () => {
  it("passes clean preview text with safe phrases", () => {
    const text = [
      "const summary = 'Context is sufficient for a cautious, approval-required suggestion.';",
      "const note = 'Approval required — grower must approve any action before it runs.';",
      "const dev = 'No device control — Verdant will not run equipment commands.';",
      "const ui = 'Preview only — no Action Queue item is created.';",
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("flags 'queued' language", () => {
    const text = `const s = "Suggestion was queued for approval";`;
    const violations = scanText(text);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].rule).toBe("no-queued-language");
    expect(violations[0].line).toBe(1);
  });

  it("flags 'approved' language", () => {
    const text = `const s = "Action was approved automatically";`;
    const violations = scanText(text);
    expect(violations.map((v) => v.rule)).toContain("no-approved-language");
  });

  it("flags 'executed' / 'execute' language", () => {
    const violations = scanText(`const s = "Action was executed by Verdant";`);
    expect(violations.map((v) => v.rule)).toContain("no-executed-language");
  });

  it("flags Supabase action_queue write paths", () => {
    const text = `await supabase.from("action_queue").insert({ id: 1 });`;
    const violations = scanText(text);
    expect(violations.map((v) => v.rule)).toContain("no-action-queue-write");
  });

  it("flags functions.invoke calls", () => {
    const text = `await supabase.functions.invoke("ai-doctor");`;
    const violations = scanText(text);
    expect(violations.map((v) => v.rule)).toContain("no-functions-invoke");
  });

  it("flags service_role references", () => {
    const text = `const k = serviceRoleKey; // uses service_role from env`;
    // first segment scanned: trimmed line includes "service_role" outside the comment portion
    const violations = scanText(text);
    expect(violations.map((v) => v.rule)).toContain("no-service-role");
  });

  it("flags device command / mqtt publish / turn on / pump / dose / set temp / set humidity", () => {
    const samples = [
      `const a = "send device command to fan";`,
      `const b = "mqtt publish climate/cmd";`,
      `const c = "turn on the pump";`,
      `const d = "pump on at 6am";`,
      `const e = "auto dose nutrients";`,
      `const f = "set temp 25C";`,
      `const g = "set humidity 60";`,
      `const h = "control equipment from preview";`,
      `const i = "automation enabled by default";`,
    ];
    for (const text of samples) {
      const v = scanText(text);
      expect(v.length, `expected violation for: ${text}`).toBeGreaterThan(0);
    }
  });

  it("allows the explicit safety phrases verbatim", () => {
    for (const phrase of ALLOW_PHRASES) {
      const text = `const s = "${phrase} — safety note";`;
      expect(scanText(text), `phrase should pass: ${phrase}`).toEqual([]);
    }
  });

  it("skips JS/TS comment lines", () => {
    const text = [
      "// turn on the pump — describing what we do NOT do",
      "/* approved/queued/executed language reference */",
      " * service_role appears in jsdoc only",
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("skips regex-literal pattern declaration lines", () => {
    const text = [
      "  /\\bturn[_\\s-]?on\\b/i,",
      "  /\\bpump[_\\s-]?(on|off)\\b/i,",
      "  /\\bexecute\\b/i,",
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("honours the ALLOW marker on the same line", () => {
    const text = `const s = "Suggestion was queued"; // ${ALLOW_MARKER} — test fixture`;
    expect(scanText(text)).toEqual([]);
  });

  it("treats denial / safety-context lines as safe", () => {
    const text = [
      `const s = "Preview must never emit device commands";`,
      `const t = "Blocked — device-command risk";`,
      `const u = "Safety filter drops approved/queued language";`,
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("does not scan files inside src/test/**", () => {
    const text = `const s = "Suggestion was queued and executed";`;
    expect(scanText(text, { isTestFile: true })).toEqual([]);
  });

  it("formatViolation includes file, line, rule, and matched text", () => {
    const v = {
      line: 12,
      rule: "no-queued-language",
      explanation: "Preview must never claim queued.",
      text: 'const s = "queued";',
    };
    const out = formatViolation("src/foo.ts", v);
    expect(out).toContain("src/foo.ts:12");
    expect(out).toContain("[no-queued-language]");
    expect(out).toContain('"const s = \\"queued\\";"'.replace(/\\"/g, '"'));
    expect(out).toContain("Preview must never claim queued.");
  });

  it("RULES export is non-empty and every rule has a name + pattern + explanation", () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) {
      expect(typeof r.name).toBe("string");
      expect(r.pattern).toBeInstanceOf(RegExp);
      expect(typeof r.explanation).toBe("string");
    }
  });
});
