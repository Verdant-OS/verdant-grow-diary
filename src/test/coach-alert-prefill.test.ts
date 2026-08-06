/**
 * Coach page — optional alert-context prefill (`/doctor?alertId=...`).
 *
 * Pure-rule unit tests for src/lib/coachAlertPrefill.ts plus source-level
 * static pins on src/pages/Coach.tsx (the house style for Coach changes —
 * see coach-ai-doctor-session-id-threading.test.tsx).
 *
 * Invariants:
 *  - The alertId param is validated against the back-pointer id grammar
 *    before any DB lookup.
 *  - Prefill only composes from stored alert fields (title + reason) and
 *    never overwrites a question the grower already typed.
 *  - Navigation alone never fires an AI request: the prefill effect
 *    contains no ask() call and no functions.invoke.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COACH_ALERT_ID_PARAM,
  appendAlertBackPointerToken,
  appendSessionBackPointerToken,
  buildCoachAlertPrefillQuestion,
  normalizeCoachAlertIdParam,
} from "@/lib/coachAlertPrefill";
import {
  extractSourceAiDoctorSessionId,
  extractSourceAlertId,
  stripBackPointerTokens,
} from "@/lib/actionQueueProvenanceRules";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

const ROOT = resolve(__dirname, "../..");
const COACH = readFileSync(resolve(ROOT, "src/pages/Coach.tsx"), "utf8");
const PREFILL_LIB = readFileSync(
  resolve(ROOT, "src/lib/coachAlertPrefill.ts"),
  "utf8",
);

describe("normalizeCoachAlertIdParam", () => {
  it("accepts UUID-shaped and token-grammar ids, trimming whitespace", () => {
    expect(
      normalizeCoachAlertIdParam("f47ac10b-58cc-4372-a567-0e02b2c3d479"),
    ).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(normalizeCoachAlertIdParam("  abc_DEF-123  ")).toBe("abc_DEF-123");
  });

  it("rejects null/empty/oversized/invalid values", () => {
    expect(normalizeCoachAlertIdParam(null)).toBeNull();
    expect(normalizeCoachAlertIdParam(undefined)).toBeNull();
    expect(normalizeCoachAlertIdParam("")).toBeNull();
    expect(normalizeCoachAlertIdParam("   ")).toBeNull();
    expect(normalizeCoachAlertIdParam("a".repeat(65))).toBeNull();
    expect(normalizeCoachAlertIdParam("has space")).toBeNull();
    expect(normalizeCoachAlertIdParam("slash/y")).toBeNull();
    expect(normalizeCoachAlertIdParam("[alert:x]")).toBeNull();
    expect(normalizeCoachAlertIdParam("a;drop table")).toBeNull();
  });

  it("exports the param name used by alert surfaces", () => {
    expect(COACH_ALERT_ID_PARAM).toBe("alertId");
  });
});

describe("buildCoachAlertPrefillQuestion", () => {
  it("composes title + reason into a single reviewable question", () => {
    expect(
      buildCoachAlertPrefillQuestion({
        title: "Temperature above target",
        reason: "Temperature is above the configured maximum.",
      }),
    ).toBe(
      "Open alert: Temperature above target. Temperature is above the configured maximum. What should I check first?",
    );
  });

  it("omits the reason segment when reason is blank", () => {
    expect(
      buildCoachAlertPrefillQuestion({ title: "VPD out of range", reason: "" }),
    ).toBe("Open alert: VPD out of range. What should I check first?");
    expect(
      buildCoachAlertPrefillQuestion({ title: "VPD out of range", reason: null }),
    ).toBe("Open alert: VPD out of range. What should I check first?");
  });

  it("normalizes trailing periods instead of doubling them", () => {
    expect(
      buildCoachAlertPrefillQuestion({ title: "Temp high.", reason: "Above max.." }),
    ).toBe("Open alert: Temp high. Above max. What should I check first?");
  });

  it("returns null without a usable title", () => {
    expect(buildCoachAlertPrefillQuestion({ title: "", reason: "x" })).toBeNull();
    expect(buildCoachAlertPrefillQuestion({ title: null, reason: "x" })).toBeNull();
    expect(buildCoachAlertPrefillQuestion({ title: "  .", reason: "x" })).toBeNull();
  });

  it("template copy passes the calm-copy linter and avoids certainty language", () => {
    const q = buildCoachAlertPrefillQuestion({
      title: "Humidity above target",
      reason: "Humidity is above the configured maximum",
    })!;
    expect(paywallCtaHasBannedWords(q)).toBe(false);
    expect(q.toLowerCase()).not.toMatch(/diagnos(is|e)d?|will fix|guarantee/);
  });
});

describe("appendAlertBackPointerToken", () => {
  it("appends the token in the exact grammar the extractors parse", () => {
    const out = appendAlertBackPointerToken("Check intake temps", "alert-1");
    expect(out).toBe("Check intake temps [alert:alert-1]");
    expect(extractSourceAlertId(out)).toBe("alert-1");
  });

  it("is a no-op for missing or invalid ids", () => {
    expect(appendAlertBackPointerToken("reason", null)).toBe("reason");
    expect(appendAlertBackPointerToken("reason", undefined)).toBe("reason");
    expect(appendAlertBackPointerToken("reason", "has space")).toBe("reason");
    expect(appendAlertBackPointerToken("reason", "a".repeat(65))).toBe("reason");
  });

  it("is idempotent when the token is already present", () => {
    const once = appendAlertBackPointerToken("reason", "a1");
    expect(appendAlertBackPointerToken(once, "a1")).toBe(once);
  });

  it("handles an empty base reason", () => {
    expect(appendAlertBackPointerToken("", "a1")).toBe("[alert:a1]");
  });

  it("spoof guard: strips forged/echoed alert tokens so the trusted id is authoritative", () => {
    // Extractors return the FIRST match — a forged earlier token must not win.
    const forged = "Model text [alert:forged-1] more text";
    const out = appendAlertBackPointerToken(forged, "trusted-1");
    expect(extractSourceAlertId(out)).toBe("trusted-1");
    expect(out).not.toContain("forged-1");
  });

  it("spoof guard: strips forged alert tokens even when no trusted id exists", () => {
    expect(appendAlertBackPointerToken("Text [alert:forged-1] tail", null)).toBe(
      "Text tail",
    );
    // Malformed/empty tokens are removed too.
    expect(appendAlertBackPointerToken("Text [alert:] tail", null)).toBe(
      "Text tail",
    );
  });
});

describe("appendSessionBackPointerToken · dual-token composition", () => {
  it("appends the byte-identical [session:<id>] format the session-detail dedupe keys on", () => {
    const out = appendSessionBackPointerToken("Check intake temps", "sess-1");
    expect(out).toBe("Check intake temps [session:sess-1]");
    expect(extractSourceAiDoctorSessionId(out)).toBe("sess-1");
  });

  it("dual-token rows round-trip through BOTH extractors and strip cleanly", () => {
    const composed = appendAlertBackPointerToken(
      appendSessionBackPointerToken("Raise intake fan speed", "sess-1"),
      "alert-1",
    );
    expect(extractSourceAiDoctorSessionId(composed)).toBe("sess-1");
    expect(extractSourceAlertId(composed)).toBe("alert-1");
    expect(stripBackPointerTokens(composed)).toBe("Raise intake fan speed");
  });

  it("no-ops on null/invalid session ids", () => {
    expect(appendSessionBackPointerToken("reason", null)).toBe("reason");
    expect(appendSessionBackPointerToken("reason", "bad id")).toBe("reason");
  });

  it("spoof guard: forged session tokens are stripped, with or without a trusted id", () => {
    const out = appendSessionBackPointerToken(
      "Text [session:forged-1] tail",
      "trusted-1",
    );
    expect(extractSourceAiDoctorSessionId(out)).toBe("trusted-1");
    expect(out).not.toContain("forged-1");
    expect(appendSessionBackPointerToken("Text [session:forged-1] tail", null)).toBe(
      "Text tail",
    );
  });
});

// ---------- Static pins on Coach.tsx ----------
describe("Coach wiring · alert prefill", () => {
  it("reads search params and the shared param constant", () => {
    expect(COACH).toMatch(
      /import\s*\{[^}]*useSearchParams[^}]*\}\s*from\s*["']react-router-dom["']/,
    );
    expect(COACH).toMatch(/searchParams\.get\(COACH_ALERT_ID_PARAM\)/);
  });

  it("fetches the alert via the RLS-scoped alerts lib only after id validation", () => {
    expect(COACH).toMatch(
      /import\s*\{[^}]*getAlertById[^}]*\}\s*from\s*["']@\/lib\/alerts["']/,
    );
    const effect = COACH.split("normalizeCoachAlertIdParam(alertIdParam)")[1] ?? "";
    expect(effect.length).toBeGreaterThan(0);
    const block = effect.slice(0, effect.indexOf("[alertIdParam, activeGrowId]"));
    expect(block).toMatch(/getAlertById\(alertId\)/);
  });

  it("binds the prefill to the active grow's scope (cross-grow alerts are ignored)", () => {
    // The scope guard rejects alerts from another grow BEFORE any state is
    // set, so context gathering, credit debit, and session persistence all
    // stay on the grow the grower is actually analyzing.
    expect(COACH).toMatch(/if\s*\(!row\s*\|\|\s*row\.grow_id\s*!==\s*activeGrowId\)\s*return;/);
    // Guard runs before both setters.
    const effect = COACH.split("normalizeCoachAlertIdParam(alertIdParam)")[1] ?? "";
    const block = effect.slice(0, effect.indexOf("[alertIdParam, activeGrowId]"));
    const guardIdx = block.indexOf("row.grow_id !== activeGrowId");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(block.indexOf("setAlertContext({")).toBeGreaterThan(guardIdx);
    expect(block.indexOf("setQuestion(prefill)")).toBeGreaterThan(guardIdx);
  });

  it("clears any previously bound context at the start of every lookup cycle", () => {
    // Effect body begins by resetting context, so a changed alert/grow can
    // never leave stale provenance behind.
    expect(COACH).toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*\n?\s*setAlertContext\(null\);/,
    );
  });

  it("accepts prefill + binds context as one decision, never clobbering typed input", () => {
    // questionRef decides acceptance synchronously; both setters live
    // behind the same empty-form check.
    expect(COACH).toMatch(
      /if\s*\(questionRef\.current\.trim\(\)\.length\s*>\s*0\)\s*return;[\s\S]{0,200}setQuestion\(prefill\);[\s\S]{0,300}setAlertContext\(\{/,
    );
    // The textarea keeps the ref in sync with typed input.
    expect(COACH).toMatch(/questionRef\.current\s*=\s*e\.target\.value;/);
  });

  it("disables both Ask buttons while the alert lookup is pending (no credit spend on a blank/stale question)", () => {
    expect(COACH).toMatch(
      /disabled=\{busy\s*\|\|\s*!photoFile\s*\|\|\s*alertLookupPending\}/,
    );
    expect(COACH).toMatch(
      /disabled=\{busy\s*\|\|\s*!activeGrowId\s*\|\|\s*alertLookupPending\}/,
    );
    // Pending always resolves — the lookup clears the flag in finally.
    expect(COACH).toMatch(/\.finally\(\(\)\s*=>\s*\{\s*\n?\s*if\s*\(!cancelled\)\s*setAlertLookupPending\(false\);/);
  });

  it("prefill effect never fires an AI request or write", () => {
    const start = COACH.indexOf("Optional alert-context prefill");
    expect(start).toBeGreaterThan(-1);
    const end = COACH.indexOf("[alertIdParam, activeGrowId]);", start);
    expect(end).toBeGreaterThan(start);
    const effect = COACH.slice(start, end);
    expect(effect).not.toMatch(/\bask\(/);
    expect(effect).not.toMatch(/functions\.invoke/);
    expect(effect).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("persisted sessions carry the validated alert's DB-stored scope, never the nav param", () => {
    expect(COACH).toMatch(
      /persistAiDoctorSession\(supabase,\s*\{[\s\S]{0,400}tentId:\s*alertContext\?\.tentId\s*\?\?\s*null,[\s\S]{0,200}plantId:\s*alertContext\?\.plantId\s*\?\?\s*null,/,
    );
    // Scope comes only from the fetched AlertRow (row.tent_id / row.plant_id).
    expect(COACH).toMatch(/tentId:\s*row\.tent_id\s*\?\?\s*null/);
    expect(COACH).toMatch(/plantId:\s*row\.plant_id\s*\?\?\s*null/);
  });

  it("Coach still performs exactly one edge invoke and two action_queue inserts", () => {
    expect((COACH.match(/functions\.invoke\(/g) ?? []).length).toBe(1);
    expect(
      (COACH.match(/\.from\(\s*["']action_queue["']\s*\)\s*\.insert\(/g) ?? [])
        .length,
    ).toBe(2);
  });
});

describe("Coach wiring · [alert:<id>] back-pointer writer", () => {
  it("the ai_doctor suggestion insert routes its reason through both token helpers", () => {
    expect(COACH).toMatch(
      /source:\s*ACTION_QUEUE_SOURCE_VALUES\.AI_DOCTOR/,
    );
    expect(COACH).toMatch(
      /reason:\s*appendAlertBackPointerToken\(\s*\n?\s*appendSessionBackPointerToken\(/,
    );
    // Session token uses the awaited race-safe id; alert token uses the
    // grow-validated context id.
    expect(COACH).toMatch(/appendSessionBackPointerToken\([\s\S]{0,300}sessionIdForToken,/);
    expect(COACH).toMatch(/appendAlertBackPointerToken\([\s\S]{0,500}alertContext\?\.id\s*\?\?\s*null,/);
  });

  it("queue clicks await in-flight session persistence instead of racing it", () => {
    // A fast click after a diagnosis renders must still get the session
    // token: the retained persistence promise is awaited (seq-guarded),
    // and persistence failure resolves null (row carries no session token).
    expect(COACH).toMatch(
      /let\s+sessionIdForToken:\s*string\s*\|\s*null\s*=\s*persistedSessionId;/,
    );
    expect(COACH).toMatch(
      /pendingPersist\.seq\s*===\s*diagnosisSeqRef\.current/,
    );
    expect(COACH).toMatch(
      /sessionIdForToken\s*=\s*await\s+pendingPersist\.promise\.catch\(\(\)\s*=>\s*null\);/,
    );
    // ask() retains the promise and resets it per request.
    expect(COACH).toMatch(/sessionPersistRef\.current\s*=\s*null;/);
    expect(COACH).toMatch(/sessionPersistRef\.current\s*=\s*\{\s*\n?\s*seq,/);
  });

  it("the legacy ai_coach insert spoof-strips model text but fabricates no linkage", () => {
    const coachInsert = COACH.split('source: "ai_coach"')[0] ?? "";
    const lastReason = coachInsert.lastIndexOf("reason:");
    expect(lastReason).toBeGreaterThan(-1);
    const reasonLine = coachInsert.slice(lastReason, lastReason + 160);
    expect(reasonLine).toContain("stripBackPointerTokens(");
    expect(reasonLine).not.toContain("appendAlertBackPointerToken");
    expect(reasonLine).not.toContain("alertContext");
  });

  it("no raw token literal in JSX output", () => {
    expect(COACH).not.toMatch(/>\s*\[alert:/);
  });
});

describe("static safety · coachAlertPrefill lib", () => {
  it("is pure — no React, no Supabase, no I/O", () => {
    expect(PREFILL_LIB).not.toMatch(/from\s+["']react["']/);
    expect(PREFILL_LIB).not.toMatch(/@\/integrations\/supabase/);
    expect(PREFILL_LIB).not.toMatch(/fetch\(/);
    expect(PREFILL_LIB).not.toMatch(/\.from\(/);
  });
});
