/**
 * Customer Mode QR guide — static safety scan.
 *
 * Forbids the Customer Mode shell from importing any private grow,
 * sensor, AI, alert, Action Queue, or device-control surfaces. The shell
 * is presenter-only and must remain isolated from operator data paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILES = [
  "src/lib/customerModeGuideViewModel.ts",
  "src/components/customer/CustomerGuideSection.tsx",
  "src/components/customer/CustomerGuideTimeline.tsx",
  "src/pages/CustomerModeGuide.tsx",
];

function read(rel: string): string {
  return readFileSync(resolve(__dirname, "../..", rel), "utf8");
}

function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const FORBIDDEN_PATTERNS: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "supabase client import", re: /@\/integrations\/supabase\/client/ },
  { label: "raw fetch", re: /\bfetch\s*\(/ },
  { label: "sensor_readings reference", re: /\bsensor_readings\b/ },
  { label: "raw_payload reference", re: /\braw_payload\b/ },
  { label: "Action Queue write", re: /\baction[_-]?queue\b.*\b(insert|upsert|update|delete)\b/i },
  { label: "alerts write", re: /\balerts\b.*\b(insert|upsert|update|delete)\b/i },
  { label: "AI Doctor edge call", re: /\bai-doctor[-_]?(review|analyze|coach)\b/ },
  { label: "device control import", re: /@\/lib\/device(?:Control|-control)/ },
  { label: "private diary entries fetch", re: /\bdiary_entries\b/ },
];

describe("CustomerModeGuide — static safety", () => {
  for (const file of FILES) {
    const src = stripCommentsAndStrings(read(file));
    for (const { label, re } of FORBIDDEN_PATTERNS) {
      it(`${file} must not contain ${label}`, () => {
        expect(re.test(src)).toBe(false);
      });
    }
  }

  it("CustomerModeGuide page must not import AppShell or GlobalFastAddButton", () => {
    const src = read("src/pages/CustomerModeGuide.tsx");
    expect(src).not.toMatch(/from\s+["']@\/components\/AppShell["']/);
    expect(src).not.toMatch(/GlobalFastAddButton/);
  });
});
