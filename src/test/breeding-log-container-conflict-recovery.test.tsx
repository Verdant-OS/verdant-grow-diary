/**
 * Static wiring guard for the conflict-recovery path in BreedingLogContainer.
 *
 * The behaviour under test is a ref mutation inside a submit handler that is
 * only reachable through a real RPC refusal, so this pins the wiring in source
 * rather than staging a full Supabase round-trip. The decision logic itself is
 * covered behaviourally in breeding-submission-recovery-rules.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../components/genetics/BreedingLogContainer.tsx"),
  "utf8",
);

describe("the refusal path disposes of the key", () => {
  it("resolves a disposition before throwing", () => {
    const resolveAt = SRC.indexOf("resolveBreedingSubmissionKeyDisposition(");
    const throwAt = SRC.indexOf("throw new Error(describeBreedingLogSaveEventReason");
    expect(resolveAt).toBeGreaterThan(0);
    expect(throwAt).toBeGreaterThan(0);
    // Throwing first would skip disposal entirely and restore the original bug.
    expect(resolveAt).toBeLessThan(throwAt);
  });

  it("clears the attempt ref when the disposition says to retire", () => {
    expect(SRC).toMatch(
      /shouldRetireSubmissionKey\([^)]*\)\s*\)\s*\{\s*submissionAttemptRef\.current\s*=\s*null/,
    );
  });

  it("still clears the ref on success", () => {
    // Regression guard: the success path predates this fix and must survive it.
    const successClears = SRC.match(/submissionAttemptRef\.current\s*=\s*null/g) ?? [];
    expect(successClears.length).toBeGreaterThanOrEqual(2);
  });

  it("still writes the attempt BEFORE the RPC call", () => {
    // The lost-response case is the only one where a duplicate is genuinely at
    // risk, and it depends on the key being stored before the request goes out.
    const store = SRC.indexOf("submissionAttemptRef.current = attempt");
    const call = SRC.indexOf("await callBreedingLogSaveEvent(");
    expect(store).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(store);
  });
});

describe("possible-duplicate warning", () => {
  it("is raised only via shouldWarnPossibleDuplicate", () => {
    expect(SRC).toMatch(
      /shouldWarnPossibleDuplicate\([^)]*\)\s*\)\s*\{\s*setDuplicateRisk\(true\)/,
    );
  });

  it("resets at the start of every submit so it cannot outlive its cause", () => {
    const reset = SRC.indexOf("setDuplicateRisk(false)");
    const call = SRC.indexOf("await callBreedingLogSaveEvent(");
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThan(call);
  });

  it("renders a persistent alert, not just a toast", () => {
    // A toast disappears well before a grower can check their timeline.
    expect(SRC).toContain('data-testid="breeding-duplicate-risk"');
    expect(SRC).toMatch(/role="alert"/);
  });

  it("links to this grow's timeline", () => {
    expect(SRC).toMatch(/to=\{logsPath\(activeGrowId\)\}/);
  });

  it("never tells the grower that saving again retries the first attempt", () => {
    const alert = SRC.slice(
      SRC.indexOf('data-testid="breeding-duplicate-risk"'),
      SRC.indexOf('data-testid="breeding-duplicate-risk-link"'),
    );
    expect(alert).toMatch(/separate event/i);
    expect(alert).not.toMatch(/try again|retry the save|save again to retry/i);
  });
});

describe("the pinned identifier other guards grep for", () => {
  it("still calls describeBreedingLogSaveEventReason literally", () => {
    // breeding-log-save-event-reasons.test.ts greps this file for the name.
    expect(SRC).toContain("describeBreedingLogSaveEventReason");
  });
});
