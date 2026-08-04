/**
 * Static safety pins for the docs/plantuml style pack (PR #716 gate):
 *
 *   1. Example includes are SOURCE-relative (`!include ../style.puml`) —
 *      never repo-root-relative paths that only resolve by accident.
 *   2. `<<human>>` is styled for BOTH participant and actor element types.
 *   3. Hold-state text uses the contrast-tested `#8A2C00`; the failing
 *      `#E65100` amber never returns as a FontColor.
 *   4. Status words stay literal: color alone never carries HOLD /
 *      CHANGES_REQUESTED / FAIL / PASS.
 *   5. Agents stay neutral — outcome stereotypes never become permanent
 *      participant colors in the handoff example.
 *   6. Every repo doc referenced by the pack exists on this branch.
 *   7. No generated render artifacts are committed.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const REPO = resolve(__dirname, "../..");
const PACK = resolve(REPO, "docs/plantuml");
const STYLE = readFileSync(join(PACK, "style.puml"), "utf8");
const README = readFileSync(join(PACK, "README.md"), "utf8");
const APPROVAL = readFileSync(join(PACK, "examples/cheek-approval.puml"), "utf8");
const HANDOFF = readFileSync(join(PACK, "examples/agent-handoff-sequence.puml"), "utf8");

describe("plantuml docs — include resolution", () => {
  it("examples include the shared style source-relatively", () => {
    for (const example of [APPROVAL, HANDOFF]) {
      expect(example).toMatch(/^!include \.\.\/style\.puml$/m);
      // A repo-root-relative include only resolves for a source file at the
      // repo root — it must never appear inside a diagram.
      expect(example).not.toMatch(/!include docs\/plantuml\/style\.puml/);
    }
  });

  it("README documents source-relative resolution, not launch-directory resolution", () => {
    expect(README).toMatch(/!include \.\.\/style\.puml/);
    expect(README).toMatch(/diagram source file/i);
    expect(README).not.toMatch(/```plantuml[^`]*!include docs\/plantuml\/style\.puml/);
  });
});

describe("plantuml docs — accessibility and honest status", () => {
  it("<<human>> is styled for both participant and actor element types", () => {
    expect(STYLE).toMatch(/skinparam participant<<human>>/);
    expect(STYLE).toMatch(/skinparam actor<<human>>/);
  });

  it("hold text is the contrast-tested #8A2C00; #E65100 never returns as text", () => {
    expect(STYLE).toMatch(/participant<<hold>>[\s\S]{0,120}FontColor #8A2C00/);
    expect(STYLE).not.toMatch(/FontColor #E65100/i);
    expect(STYLE).not.toMatch(/DiamondFontColor #E65100/i);
  });

  it("status words stay literal wherever hold/stop colors appear", () => {
    expect(APPROVAL).toMatch(/HOLD \/ CHANGES_REQUESTED/);
    expect(APPROVAL).toMatch(/STOP-SHIP/);
    for (const word of ["HOLD", "CHANGES_REQUESTED", "FAIL", "PASS", "APPROVE"]) {
      expect(HANDOFF).toContain(word);
    }
  });
});

describe("plantuml docs — roles are neutral, colors are outcomes", () => {
  it("no participant in the handoff example carries an outcome stereotype", () => {
    const participantLines = HANDOFF.split("\n").filter((l) => /^\s*(participant|actor)\b/.test(l));
    expect(participantLines.length).toBeGreaterThanOrEqual(7);
    for (const line of participantLines) {
      expect(line).not.toMatch(/<<(stop|hold|ok|packet)>>/);
    }
    // The single identity stereotype is Cheek's human authority.
    const humanLines = participantLines.filter((l) => l.includes("<<human>>"));
    expect(humanLines).toHaveLength(1);
    expect(humanLines[0]).toContain("Cheek");
  });
});

describe("plantuml docs — references and artifacts", () => {
  it("every referenced repo doc exists on this branch", () => {
    const referenced = new Set<string>();
    for (const content of [README, APPROVAL, HANDOFF, STYLE]) {
      for (const m of content.matchAll(/docs\/agents\/[A-Za-z0-9_./-]+\.md/g)) {
        referenced.add(m[0]);
      }
      if (/AGENTS\.md/.test(content)) referenced.add("AGENTS.md");
    }
    expect(referenced.size).toBeGreaterThanOrEqual(2);
    for (const rel of referenced) {
      expect(existsSync(resolve(REPO, rel)), `${rel} is referenced but missing`).toBe(true);
    }
  });

  it("no generated render artifacts are committed", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const artifacts = walk(PACK).filter((f) => /\.(svg|png|eps|pdf)$/i.test(f));
    expect(artifacts).toHaveLength(0);
  });
});
