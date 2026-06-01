/**
 * Action Queue provenance — pure helpers + static UI safety.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  extractSourceAlertId,
  getActionQueueSourceKind,
  getActionQueueSourceLabel,
  isAlertDerived,
} from "@/lib/actionQueueProvenanceRules";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const QUEUE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");
const DETAIL = readFileSync(resolve(ROOT, "src/pages/ActionDetail.tsx"), "utf8");
const RULES = readFileSync(
  resolve(ROOT, "src/lib/actionQueueProvenanceRules.ts"),
  "utf8",
);

describe("extractSourceAlertId", () => {
  it("extracts a valid alert id token", () => {
    expect(extractSourceAlertId("High RH [alert:abc-123]")).toBe("abc-123");
    expect(
      extractSourceAlertId(
        "x [alert:550e8400-e29b-41d4-a716-446655440000] tail",
      ),
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
  it("returns null when no token", () => {
    expect(extractSourceAlertId("Plain reason without token")).toBeNull();
  });
  it("returns null for malformed tokens", () => {
    expect(extractSourceAlertId("[alert:]")).toBeNull();
    expect(extractSourceAlertId("[alert:has spaces]")).toBeNull();
    expect(extractSourceAlertId("[alert:contains/slash]")).toBeNull();
    expect(extractSourceAlertId("[alert:" + "x".repeat(100) + "]")).toBeNull();
  });
  it("is null-safe and deterministic", () => {
    expect(extractSourceAlertId(null)).toBeNull();
    expect(extractSourceAlertId(undefined)).toBeNull();
    expect(extractSourceAlertId("")).toBeNull();
    // deterministic
    expect(extractSourceAlertId("a [alert:zzz]")).toBe(
      extractSourceAlertId("a [alert:zzz]"),
    );
  });
});

describe("source labels", () => {
  it("maps known sources", () => {
    expect(getActionQueueSourceKind({ source: "environment_alert" })).toBe(
      "environment_alert",
    );
    expect(getActionQueueSourceKind({ source: "ai_coach" })).toBe("ai_coach");
    expect(getActionQueueSourceKind({ source: "manual" })).toBe("manual");
    expect(getActionQueueSourceKind({ source: "weird" })).toBe("unknown");
    expect(getActionQueueSourceKind(null)).toBe("unknown");
  });
  it("renders friendly labels", () => {
    expect(getActionQueueSourceLabel({ source: "environment_alert" })).toBe(
      "Environment Alert",
    );
    expect(getActionQueueSourceLabel({ source: "ai_coach" })).toBe("AI Coach");
    expect(getActionQueueSourceLabel({ source: "manual" })).toBe("Manual");
    expect(getActionQueueSourceLabel(undefined)).toBe("Unknown");
  });
  it("isAlertDerived flags only environment_alert", () => {
    expect(isAlertDerived({ source: "environment_alert" })).toBe(true);
    expect(isAlertDerived({ source: "ai_coach" })).toBe(false);
    expect(isAlertDerived(null)).toBe(false);
  });
});

describe("ActionQueue UI — provenance presentation", () => {
  it("imports the provenance helpers (no duplicated mapping)", () => {
    expect(QUEUE).toMatch(/from "@\/lib\/actionQueueProvenanceRules"/);
    // No duplicated literal label table inside JSX
    expect(
      (QUEUE.match(/Environment Alert/g) ?? []).length,
    ).toBeLessThanOrEqual(2);
  });
  it("offers an Environment Alerts filter chip", () => {
    expect(QUEUE).toMatch(/ACTION_QUEUE_SOURCE_VALUES\.ENVIRONMENT_ALERT/);
    expect(QUEUE).toMatch(/Environment Alerts/);
    expect(QUEUE).toMatch(/sourceFilter/);
  });

  it("renders the Environment Alert badge for alert-derived rows", () => {
    // Badge appears in both pending and reviewed lists via isAlertDerived().
    expect((QUEUE.match(/isAlertDerived\(row\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(QUEUE).toMatch(/getActionQueueSourceLabel\(row\)/);
  });
  it("does not parse alert or session provenance tokens inline in ActionQueue executable code", () => {
    // Use the shared comment-stripper so harmless docstring mentions of
    // `[alert:<id>]` / `[session:<id>]` don't trip this scan. The intent:
    // ActionQueue must delegate token parsing to shared helpers
    // (`extractSourceAlertId`, `extractSourceAiDoctorSessionId`) and never
    // construct ad-hoc regexes / matchers / splitters / indexOf / includes
    // against the `[alert:` or `[session:` literal in executable code —
    // including JSX attributes, event handlers, and callback bodies.
    const executable: string = stripSourceComments(QUEUE);

    // No raw provenance token literals anywhere in executable code.
    expect(executable).not.toContain("[alert:");
    expect(executable).not.toContain("[session:");

    // No ad-hoc regex extraction.
    for (const tok of ["alert", "session"]) {
      const t = tok;
      expect(executable).not.toMatch(new RegExp(`\\.match\\(\\s*\\/\\\\?\\[${t}:`));
      expect(executable).not.toMatch(new RegExp(`\\.exec\\(\\s*\\/\\\\?\\[${t}:`));
      expect(executable).not.toMatch(new RegExp(`new RegExp\\(\\s*["\`']\\\\?\\[${t}:`));
      // No ad-hoc string-based extraction.
      expect(executable).not.toMatch(new RegExp(`\\.indexOf\\(\\s*["\`']\\[${t}:`));
      expect(executable).not.toMatch(new RegExp(`\\.includes\\(\\s*["\`']\\[${t}:`));
      expect(executable).not.toMatch(new RegExp(`\\.split\\(\\s*["\`']\\[${t}:`));
      expect(executable).not.toMatch(new RegExp(`\\.slice\\([^)]*["\`']\\[${t}:`));
    }

    // Positive contract: parsing goes through the shared helper(s).
    expect(QUEUE).toMatch(/extractSourceAlertId\(/);
  });
});

describe("ActionDetail UI — source section", () => {
  it("imports the provenance helpers", () => {
    expect(DETAIL).toMatch(/from "@\/lib\/actionQueueProvenanceRules"/);
    expect(DETAIL).toMatch(/extractSourceAlertId\(row\.reason\)/);
  });
  it("shows a Source section labelled Environment Alert when alert-derived", () => {
    expect(DETAIL).toMatch(/aria-label="Action source"/);
    expect(DETAIL).toMatch(/Environment Alert/);
    expect(DETAIL).toMatch(/Source/);
  });
  it("renders 'Open source alert' only when a valid alert id is found", () => {
    // Link is guarded by `sourceAlertId &&`
    expect(DETAIL).toMatch(
      /sourceAlertId\s*&&\s*\(\s*<Button[\s\S]{0,200}Open source alert/,
    );
    expect(DETAIL).toMatch(/alertDetailPath\(sourceAlertId\)/);
  });
  it("does not regex-parse [alert:...] inline in JSX", () => {
    expect(DETAIL).not.toMatch(/\[alert:/);
  });
});

describe("Static safety", () => {
  it("provenance rules module is pure (no network, no react, no device strings)", () => {
    expect(RULES).not.toMatch(/import .* react|from "react"/);
    expect(RULES).not.toMatch(/supabase|fetch\(|axios/);
    expect(RULES).not.toMatch(
      /mqtt|home[\s_-]?assistant|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });
  it("ActionQueue / ActionDetail introduce no device-control surface", () => {
    for (const src of [QUEUE, DETAIL]) {
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|service_role/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Hardening: forbidden device-command / automation-like copy in user-facing UI.
// Comments and JSDoc are stripped so security disclaimers ("No device commands.")
// don't trip the scan; only executable code + string literals are inspected.
// ---------------------------------------------------------------------------
describe("ActionQueue / ActionDetail — forbidden copy hardening", () => {
  const QUEUE_EXEC = stripSourceComments(QUEUE).toLowerCase();
  const DETAIL_EXEC = stripSourceComments(DETAIL).toLowerCase();

  // Imperative / automation-like phrasing that must never appear as
  // grower-facing copy. "device command" is intentionally NOT in this list:
  // it legitimately appears in negative safety toasts ("no device command
  // sent") and is already covered by the broader device-control scan above.
  const FORBIDDEN_PHRASES = [
    "execute device",
    "send command",
    "control equipment",
    "turn on fan",
    "turn off fan",
    "start pump",
    "stop pump",
    "change setpoint automatically",
    "autopilot",
    "automate equipment",
    "direct control",
    "home assistant command",
    "mqtt command",
    "relay command",
  ];

  it("ActionQueue executable source contains no forbidden device-command/automation phrasing", () => {
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(QUEUE_EXEC, `forbidden phrase leaked into ActionQueue: "${phrase}"`)
        .not.toContain(phrase);
    }
  });

  it("ActionDetail executable source contains no forbidden device-command/automation phrasing", () => {
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(DETAIL_EXEC, `forbidden phrase leaked into ActionDetail: "${phrase}"`)
        .not.toContain(phrase);
    }
  });

  it("preserves safe review/approval vocabulary in user-facing copy", () => {
    // Approval-required model is explicit and visible to growers.
    const SAFE_VOCAB = ["review", "pending approval", "simulate"];
    for (const tok of SAFE_VOCAB) {
      expect(
        QUEUE_EXEC.includes(tok) || DETAIL_EXEC.includes(tok),
        `expected safe review/approval vocab present somewhere: "${tok}"`,
      ).toBe(true);
    }
  });

  it("ActionQueue and ActionDetail strip provenance tokens before rendering reason text", () => {
    // Every row.reason rendering must pass through stripBackPointerTokens.
    // Affirmative contract:
    expect(QUEUE).toMatch(/stripBackPointerTokens\(\s*row\.reason\s*\)/);
    expect(DETAIL).toMatch(/stripBackPointerTokens\(\s*row\.reason\s*\)/);
    // Negative contract: no bare {row.reason} render in JSX (would leak `[alert:` / `[session:`).
    expect(QUEUE).not.toMatch(/\{\s*row\.reason\s*\}/);
    expect(DETAIL).not.toMatch(/\{\s*row\.reason\s*\}/);
  });

  it("never renders raw [alert:<id>] or [session:<id>] tokens as JSX literals", () => {
    for (const src of [QUEUE, DETAIL]) {
      expect(src).not.toMatch(/>\s*\[alert:/);
      expect(src).not.toMatch(/>\s*\[session:/);
    }
  });

  it("never includes raw id substrings in user-facing aria-label or title attributes", () => {
    // aria-label / title values must use names/copy, not raw uuids or token literals.
    for (const src of [QUEUE, DETAIL]) {
      expect(src).not.toMatch(/aria-label=\{?["'`][^"'`}]*\[alert:/);
      expect(src).not.toMatch(/aria-label=\{?["'`][^"'`}]*\[session:/);
      expect(src).not.toMatch(/\btitle=\{?["'`][^"'`}]*\[alert:/);
      expect(src).not.toMatch(/\btitle=\{?["'`][^"'`}]*\[session:/);
    }
  });

  it("preserves approval-required status flow (no auto-approve/auto-reject)", () => {
    for (const src of [QUEUE_EXEC, DETAIL_EXEC]) {
      expect(src).not.toMatch(/auto[_-\s]?approve/);
      expect(src).not.toMatch(/auto[_-\s]?reject/);
      expect(src).not.toMatch(/auto[_-\s]?execute/);
    }
  });
});
