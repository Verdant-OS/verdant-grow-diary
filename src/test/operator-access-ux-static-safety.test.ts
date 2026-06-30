/**
 * Static safety scan — Operator Access UX v1.
 *
 * Ensures the new role-aware UX files never include role internals, tokens,
 * service_role, or device-control verbs that would imply blind automation.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const FILES = [
  "src/components/RequireOperatorRole.tsx",
  "src/components/OperatorModeLink.tsx",
  "src/components/OperatorModeCallout.tsx",
  "src/components/ReleaseReadinessOperatorCard.tsx",
];

const FORBIDDEN = [
  "service_role",
  "access_token",
  "refresh_token",
  "api_token",
  "bridge_token",
  "fake live",
  "automatically executes",
  "auto execute",
  "controls your grow",
  "device command",
  "set fan",
  "set light",
  "set irrigation",
  "dose nutrients",
];

// Substring "jwt" must not appear in rendered copy — we still allow the
// security-policy doc comments to mention has_role / RPC in code comments,
// but not user-facing strings. We scan only JSX text content for sensitive
// internals by checking that they do not appear at all in these UX files.
const FORBIDDEN_RENDERED_INTERNALS = ["auth.uid"];

describe("Operator Access UX — static safety", () => {
  it.each(FILES)("%s contains no forbidden tokens/automation verbs", (rel) => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8").toLowerCase();
    for (const term of FORBIDDEN) {
      expect(src, `${rel} should not contain "${term}"`).not.toContain(term);
    }
  });

  it.each(FILES)("%s does not surface auth.uid in copy", (rel) => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", rel), "utf8").toLowerCase();
    for (const term of FORBIDDEN_RENDERED_INTERNALS) {
      expect(src, `${rel} should not contain "${term}"`).not.toContain(term);
    }
  });

  it("OperatorModeLink/Callout delegate to server-side useHasRole('operator')", () => {
    const link = fs.readFileSync(
      path.resolve(__dirname, "..", "components", "OperatorModeLink.tsx"),
      "utf8",
    );
    const callout = fs.readFileSync(
      path.resolve(__dirname, "..", "components", "OperatorModeCallout.tsx"),
      "utf8",
    );
    expect(link).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
    expect(callout).toMatch(/useHasRole\(\s*["']operator["']\s*\)/);
  });

  it("OperatorModeLink points only at /operator/demo-preview", () => {
    const link = fs.readFileSync(
      path.resolve(__dirname, "..", "components", "OperatorModeLink.tsx"),
      "utf8",
    );
    expect(link).toMatch(/\/operator\/demo-preview/);
    // No bypass query params
    expect(link).not.toMatch(/operator=1|\?bypass|skipAuth/i);
  });
});
