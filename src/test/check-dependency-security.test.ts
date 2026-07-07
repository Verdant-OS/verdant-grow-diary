/**
 * Tests for scripts/check-dependency-security.mjs — pure parser +
 * policy evaluator. No live `bun audit` calls, no network.
 */
import { describe, it, expect } from "vitest";
import {
  parseAuditOutput,
  evaluateFindings,
  redactSecrets,
  BLOCKED_PACKAGES,
  BLOCKED_SEVERITIES,
} from "../../scripts/check-dependency-security.mjs";

const CLEAN_JSON = JSON.stringify({ advisories: {} });

const MCP_JSON = JSON.stringify({
  advisories: {
    "1234": {
      id: 1234,
      module_name: "@lovable.dev/mcp-js",
      severity: "moderate",
      title: "hypothetical",
    },
  },
});

const ESBUILD_JSON = JSON.stringify({
  advisories: {
    "9": { id: 9, module_name: "esbuild", severity: "moderate", title: "dev-server CORS" },
  },
});

const AJV_JSON = JSON.stringify({
  advisories: {
    "10": { id: 10, module_name: "ajv", severity: "moderate", title: "ReDoS via $data" },
  },
});

const HIGH_OTHER = JSON.stringify({
  advisories: {
    "11": { id: 11, module_name: "something-else", severity: "high", title: "x" },
  },
});

describe("check-dependency-security parser + policy", () => {
  it("clean audit passes", () => {
    const findings = parseAuditOutput(CLEAN_JSON);
    const { blocked } = evaluateFindings(findings);
    expect(blocked).toHaveLength(0);
  });

  it("blocks when @lovable.dev/mcp-js has a finding at any severity", () => {
    const findings = parseAuditOutput(MCP_JSON);
    const { blocked, reasons } = evaluateFindings(findings);
    expect(blocked).toHaveLength(1);
    expect(reasons.join(" ")).toContain("@lovable.dev/mcp-js");
  });

  it("blocks when esbuild has a finding at any severity", () => {
    const { blocked } = evaluateFindings(parseAuditOutput(ESBUILD_JSON));
    expect(blocked.map((b) => b.package)).toContain("esbuild");
  });

  it("blocks when ajv has a finding at any severity", () => {
    const { blocked } = evaluateFindings(parseAuditOutput(AJV_JSON));
    expect(blocked.map((b) => b.package)).toContain("ajv");
  });

  it("blocks any high/critical finding, even for unrelated packages", () => {
    const { blocked } = evaluateFindings(parseAuditOutput(HIGH_OTHER));
    expect(blocked).toHaveLength(1);
    expect(blocked[0].severity).toBe("high");
  });

  it("does not block low/moderate findings on unrelated packages", () => {
    const raw = JSON.stringify({
      advisories: {
        "12": { id: 12, module_name: "harmless", severity: "moderate", title: "x" },
      },
    });
    const { blocked } = evaluateFindings(parseAuditOutput(raw));
    expect(blocked).toHaveLength(0);
  });

  it("parses text audit output as a fallback", () => {
    const text = `
      | moderate | esbuild 0.21.5   | GHSA-xxxx-xxxx |
      | high     | somepkg 1.0.0    | GHSA-yyyy-yyyy |
    `;
    const findings = parseAuditOutput(text);
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const { blocked } = evaluateFindings(findings);
    expect(blocked.some((b) => b.package === "esbuild")).toBe(true);
  });

  it("redactSecrets removes JWT/GitHub/npm/Bearer/sk tokens", () => {
    const raw = [
      "Bearer abcdef1234567890abcdef",
      "ghp_ABCDEFGHIJKLMNOPQRSTUVWX",
      "npm_ABCDEFGHIJKLMNOPQRSTUVWX",
      "aaaaaaaaaa.bbbbbbbbbb.cccccccccc",
      "sk_ABCDEFGHIJKLMNOP",
    ].join(" ");
    const redacted = redactSecrets(raw);
    expect(redacted).not.toContain("abcdef1234567890abcdef");
    expect(redacted).not.toContain("ghp_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(redacted).not.toContain("npm_ABCDEFGHIJKLMNOPQRSTUVWX");
    expect(redacted).not.toContain("aaaaaaaaaa.bbbbbbbbbb.cccccccccc");
    expect(redacted).toContain("[REDACTED_KEY]");
  });

  it("exposes the expected blocked-package + severity policy", () => {
    expect(BLOCKED_PACKAGES).toEqual(["@lovable.dev/mcp-js", "esbuild", "ajv"]);
    expect(BLOCKED_SEVERITIES).toEqual(["high", "critical"]);
  });
});
