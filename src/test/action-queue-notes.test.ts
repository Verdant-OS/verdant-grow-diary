/**
 * Static tests for optional approve/simulate/reject notes on Action Queue.
 *
 * Asserts:
 *  - Each of approve/reject/simulate calls a prompt helper for an optional note.
 *  - The note is forwarded through transition() into logEvent() and into the
 *    action_queue_events.note column.
 *  - History renders the note (existing behavior preserved).
 *  - action_queue_events remains immutable: no UPDATE policy exists anywhere
 *    in the migrations.
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

describe("ActionQueue — optional notes on transitions", () => {
  it("defines a prompt helper that returns undefined when empty", () => {
    expect(PAGE).toMatch(/function\s+promptNote\s*\(/);
    // empty/whitespace prompt collapses to undefined → no note stored
    expect(PAGE).toMatch(/trimmed\.length\s*\?\s*trimmed\s*:\s*undefined/);
  });

  it("approve prompts for an optional approval note and forwards it", () => {
    expect(PAGE).toMatch(
      /function\s+approve[\s\S]*?promptNote\([\s\S]*?approv[\s\S]*?transition\([\s\S]*?note\s*\)/i,
    );
  });

  it("reject prompts for an optional rejection reason and forwards it", () => {
    expect(PAGE).toMatch(
      /function\s+reject[\s\S]*?promptNote\([\s\S]*?reject[\s\S]*?transition\([\s\S]*?note\s*\)/i,
    );
  });

  it("simulate prompts for an optional simulation note and forwards it", () => {
    expect(PAGE).toMatch(
      /function\s+simulate[\s\S]*?promptNote\([\s\S]*?simulat[\s\S]*?transition\([\s\S]*?note\s*\)/i,
    );
  });

  it("transition() accepts a note arg and passes it to logEvent()", () => {
    expect(PAGE).toMatch(
      /function\s+transition\([\s\S]*?note\?:\s*string[\s\S]*?logEvent\([\s\S]*?,\s*note\s*\)/,
    );
  });

  it("logEvent writes the note into the action_queue_events.note column", () => {
    expect(PAGE).toMatch(
      /\.from\(\s*["']action_queue_events["']\s*\)\s*\.insert\(\s*\{[\s\S]*?note:\s*note\s*\?\?\s*null[\s\S]*?\}/,
    );
  });

  it("history view renders the note", () => {
    expect(PAGE).toMatch(/e\.note/);
  });
});

describe("ActionQueue — transition/audit flow preserved", () => {
  it("approve/reject/simulate still go through transition()", () => {
    expect(PAGE).toMatch(/function\s+approve[\s\S]*?transition\(/);
    expect(PAGE).toMatch(/function\s+reject[\s\S]*?transition\(/);
    expect(PAGE).toMatch(/function\s+simulate[\s\S]*?transition\(/);
  });

  it("status semantics unchanged", () => {
    expect(PAGE).toMatch(/transition\([\s\S]*?status:\s*["']approved["'][\s\S]*?["']approved["'][\s\S]*?["']approved["']/);
    expect(PAGE).toMatch(/transition\([\s\S]*?status:\s*["']rejected["'][\s\S]*?["']rejected["'][\s\S]*?["']rejected["']/);
    expect(PAGE).toMatch(/transition\([\s\S]*?status:\s*["']simulated["'][\s\S]*?["']simulated["'][\s\S]*?["']simulated["']/);
  });
});

describe("action_queue_events — immutability", () => {
  it("no UPDATE policy exists for action_queue_events in any migration", () => {
    expect(MIG).not.toMatch(
      /CREATE\s+POLICY[\s\S]*?ON\s+public\.action_queue_events[\s\S]*?FOR\s+UPDATE/i,
    );
  });

  it("no device-control surface introduced anywhere new", () => {
    expect(PAGE).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|webhook|\brelay\b|\bactuator\b|service_role/i,
    );
  });
});
