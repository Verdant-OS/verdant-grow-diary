import { describe, it, expect } from "vitest";
import {
  sanitizeProofReportMarkdown,
  REDACTED_PLACEHOLDER,
} from "@/lib/proofReportRedactionRules";

const FORBIDDEN_LITERALS = [
  "supersecret",
  "abc123token",
  "myp4ssword",
  "shouldNotLeak",
];

function expectRedacted(out: string) {
  for (const lit of FORBIDDEN_LITERALS) {
    expect(out).not.toContain(lit);
  }
}

describe("proofReportRedactionRules — expanded coverage", () => {
  it("redacts secrets inside fenced code blocks", () => {
    const src = [
      "Example config:",
      "```",
      "SUPABASE_SERVICE_ROLE_KEY=supersecret",
      "access_token=abc123token",
      "```",
    ].join("\n");
    const out = sanitizeProofReportMarkdown(src);
    expectRedacted(out);
    expect(out).toContain(REDACTED_PLACEHOLDER);
  });

  it("redacts secrets inside inline backticks", () => {
    const out = sanitizeProofReportMarkdown(
      "set `service_role=supersecret` then continue",
    );
    expectRedacted(out);
    expect(out).not.toMatch(/service_role/);
  });

  it("redacts shell export and $env: assignment variants", () => {
    const out = sanitizeProofReportMarkdown(
      "export api_key=abc123token\n$env:password=\"myp4ssword\"",
    );
    expectRedacted(out);
  });

  it("redacts JSON-like and YAML-like key/value pairs", () => {
    const out = sanitizeProofReportMarkdown(
      '{ "access_token": "abc123token" }\npassword: myp4ssword',
    );
    expectRedacted(out);
  });

  it("redacts URL query tokens", () => {
    const out = sanitizeProofReportMarkdown(
      "https://example.com/cb?access_token=abc123token&state=ok",
    );
    expectRedacted(out);
    expect(out).not.toMatch(/access_token/);
  });

  it("redacts Authorization header pattern", () => {
    const out = sanitizeProofReportMarkdown(
      "Authorization: Bearer abc123token",
    );
    expectRedacted(out);
    expect(out).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  });

  it("redacts SUPABASE_SERVICE_ROLE_KEY references", () => {
    const out = sanitizeProofReportMarkdown(
      "process.env.SUPABASE_SERVICE_ROLE_KEY = 'supersecret'",
    );
    expectRedacted(out);
    expect(out).not.toMatch(/SUPABASE_SERVICE_ROLE/);
  });

  it("redacts UUIDs, ISO timestamps, MACs inside code spans", () => {
    const src =
      "log: `id=11111111-2222-3333-4444-555555555555 ts=2026-01-02T03:04:05Z mac=AA:BB:CC:DD:EE:FF`";
    const out = sanitizeProofReportMarkdown(src);
    expect(out).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(out).not.toMatch(/[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}/i);
  });

  it("is idempotent across all expanded variants", () => {
    const src = [
      "```",
      "SUPABASE_SERVICE_ROLE_KEY=supersecret",
      "```",
      "url=https://x.test?access_token=abc123token",
      "Authorization: Bearer abc123token",
      "password: myp4ssword",
    ].join("\n");
    const once = sanitizeProofReportMarkdown(src);
    const twice = sanitizeProofReportMarkdown(once);
    expect(twice).toBe(once);
  });

  it("preserves benign prose and code blocks without secrets", () => {
    const src = [
      "Step 1 — review the snapshot.",
      "```",
      "tent = greenhouse-a",
      "stage = veg",
      "```",
      "No tokens here.",
    ].join("\n");
    expect(sanitizeProofReportMarkdown(src)).toBe(src);
  });
});
