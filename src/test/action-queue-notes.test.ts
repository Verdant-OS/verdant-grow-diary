/**
 * Static tests for the polished note Dialog on Action Queue transitions.
 *
 * Asserts:
 *  - Native window.prompt is no longer used.
 *  - shadcn Dialog + Textarea power the note capture.
 *  - Cancel writes no audit event (no transition() in cancel handler).
 *  - Confirm forwards a trimmed note (or undefined if blank) into transition()
 *    and ultimately into action_queue_events.note.
 *  - Approve / Reject / Simulate each open the dialog.
 *  - History still renders the note.
 *  - action_queue_events remains immutable (no UPDATE policy added).
 *  - No device-control surface is introduced.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const PAGE = readFileSync(resolve(ROOT, "src/pages/ActionQueue.tsx"), "utf8");

function allMigrations(): string {
  const dir = resolve(ROOT, "supabase/migrations");
  return readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(dir, n), "utf8"))
    .join("\n\n");
}
const MIG = allMigrations();

describe("ActionQueue — note Dialog UX", () => {
  it("no longer calls window.prompt", () => {
    expect(PAGE).not.toMatch(/window\.prompt/);
  });

  it("imports Dialog primitives and Textarea from shadcn/ui", () => {
    expect(PAGE).toMatch(/from\s+["']@\/components\/ui\/dialog["']/);
    expect(PAGE).toMatch(/from\s+["']@\/components\/ui\/textarea["']/);
    expect(PAGE).toMatch(/\bDialog\b/);
    expect(PAGE).toMatch(/\bTextarea\b/);
  });

  it("renders all three dialog titles", () => {
    expect(PAGE).toContain("Approve Action");
    expect(PAGE).toContain("Reject Action");
    expect(PAGE).toContain("Simulate Action");
  });

  it("renders all three note labels", () => {
    expect(PAGE).toContain("Approval note");
    expect(PAGE).toContain("Rejection reason");
    expect(PAGE).toContain("Simulation note");
  });

  it("exposes Cancel and Confirm buttons", () => {
    expect(PAGE).toMatch(/onClick=\{cancelNoteDialog\}[\s\S]{0,40}Cancel/);
    expect(PAGE).toMatch(/onClick=\{confirmNoteDialog\}/);
  });
});

describe("ActionQueue — dialog wiring", () => {
  it("Approve / Reject / Simulate each open the dialog", () => {
    expect(PAGE).toMatch(/function\s+approve[\s\S]{0,80}openNoteDialog\(\s*row\s*,\s*["']approve["']\s*\)/);
    expect(PAGE).toMatch(/function\s+reject[\s\S]{0,80}openNoteDialog\(\s*row\s*,\s*["']reject["']\s*\)/);
    expect(PAGE).toMatch(/function\s+simulate[\s\S]{0,80}openNoteDialog\(\s*row\s*,\s*["']simulate["']\s*\)/);
  });

  it("Cancel makes no status change and writes no audit event", () => {
    const m = PAGE.match(/function\s+cancelNoteDialog\s*\(\s*\)\s*\{([\s\S]*?)\}\s*\n/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/transition\(/);
    expect(m![1]).not.toMatch(/\.from\(\s*["']action_queue/);
  });

  it("Confirm forwards a blank-trimmed note as undefined and otherwise as string", () => {
    expect(PAGE).toMatch(/normalizeNote\(noteDraft\)/);
    expect(PAGE).toMatch(/function\s+confirmNoteDialog[\s\S]*?transition\(/);
  });

  it("Confirm path drives transition() for each kind via shared helpers", () => {
    expect(PAGE).toMatch(/buildTransitionPatch\(kind\)/);
    expect(PAGE).toMatch(/transition\(row,\s*patch,\s*eventTypeFor\(kind\),\s*nextStatusFor\(kind\),\s*note\)/);
  });



  it("note is written into action_queue_events.note", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\s*\{[\s\S]*?note:\s*note\s*\?\?\s*null[\s\S]*?\}/,
    );
  });

  it("history view still renders the note", () => {
    expect(PAGE).toMatch(/e\.note/);
  });
});

describe("ActionQueue — safety", () => {
  it("no UPDATE policy exists for action_queue_events in any migration", () => {
    expect(MIG).not.toMatch(
      /CREATE\s+POLICY[^;]*?ON\s+public\.action_queue_events[^;]*?FOR\s+UPDATE/i,
    );

  });

  it("no device-control surface introduced", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });
});
