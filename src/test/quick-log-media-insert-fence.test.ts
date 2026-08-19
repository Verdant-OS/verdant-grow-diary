// Tranche B+ slice B2a — the media direct-insert fence (D-B4).
//
// Quick Log's canonical persistence path is the `quicklog_save_manual` RPC.
// Exactly TWO direct `diary_entries` inserts are sanctioned exceptions: the
// photo and video attachment helpers. The inline rationale is a real safety
// argument — routing media through the event RPC would confirm a diary entry
// for a photo that may not have uploaded, i.e. it would claim a save that did
// not happen. Folding media into the RPC needs a server change, which is
// schema territory and out of this program's scope (D-B4).
//
// This fence exists so that divergence stays exactly two known files instead
// of quietly becoming a third write path. It is a forbidden-construct scan —
// the use source-text matching is genuinely good at, and expressly permitted
// for by AGENTS.md — not an attempt to verify effective configuration, so no
// `@source-scan-justified` marker is required.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

/** The only Quick Log modules allowed to write `diary_entries` directly. */
const SANCTIONED = [
  "src/lib/quickLogPhotoDiaryEntry.ts",
  "src/lib/quickLogVideoDiaryEntry.ts",
] as const;

/** Quick Log surfaces that must route persistence through the RPC. */
const RPC_ONLY_SURFACES = [
  "src/components/QuickLog.tsx",
  "src/components/PlantQuickLog.tsx",
  "src/components/QuickLogV2Sheet.tsx",
  "src/components/QuickLogAllActivitiesSection.tsx",
  "src/hooks/useQuickLogActivitySave.ts",
] as const;

const INSERT_RE = /from\(\s*["']diary_entries["']\s*\)\s*\.insert\(/;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Strip comments before a forbidden-construct scan.
 *
 * These helpers document their own safety properties in prose ("no
 * service_role, no sensor tables"), so scanning raw source would flag a
 * correct safety CLAIM as a violation. Comments cannot execute, so removing
 * them can only hide a non-violation — it cannot mask real code.
 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("D-B4 — media direct-insert divergence stays exactly two files", () => {
  it("both sanctioned helpers still perform their direct insert", () => {
    for (const file of SANCTIONED) {
      expect(INSERT_RE.test(read(file)), `${file} should hold the sanctioned insert`).toBe(true);
    }
  });

  it("each sanctioned helper documents WHY it diverges", () => {
    // A bare exception with no rationale is how an accepted divergence turns
    // into an unexamined habit.
    for (const file of SANCTIONED) {
      const src = read(file);
      expect(src).toMatch(/diary_entries/);
      expect(src.slice(0, 1200)).toMatch(/Safety|Contract|no service_role|No service_role/i);
    }
  });

  it("no Quick Log save surface writes diary_entries directly", () => {
    for (const file of RPC_ONLY_SURFACES) {
      const src = read(file);
      expect(
        INSERT_RE.test(src),
        `${file} must persist through quicklog_save_manual, not a direct insert`,
      ).toBe(false);
    }
  });

  it("no THIRD quicklog module has appeared with a direct insert", () => {
    // Repo-wide sweep over quicklog-named modules. A new media/attachment
    // helper is exactly how a third write path would arrive.
    const out = execFileSync(
      "rg",
      [
        "-l",
        "--multiline",
        String.raw`from\(\s*["']diary_entries["']\s*\)[\s\S]{0,120}?\.insert\(`,
        "src",
      ],
      { encoding: "utf8" },
    );
    const quickLogWriters = out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((file) => /quicklog/i.test(file))
      .filter((file) => !file.startsWith("src/test/"))
      .sort();
    expect(quickLogWriters).toEqual([...SANCTIONED].sort());
  });

  it("neither helper smuggles in a privileged or unrelated write", () => {
    for (const file of SANCTIONED) {
      const src = codeOnly(read(file));
      expect(src, `${file} code must not reference service_role`).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(
        /from\(\s*["'](action_queue|alerts|sensor_readings|profiles|subscriptions)["']\s*\)/,
      );
    }
  });
});
