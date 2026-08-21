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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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

/** Tolerates chained calls between `.from(...)` and `.insert(...)`. */
const MULTILINE_INSERT_RE = /from\(\s*["']diary_entries["']\s*\)[\s\S]{0,120}?\.insert\(/;

/** Recursively collect .ts/.tsx paths under `dir`, repo-relative. */
function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Everything after the file's leading doc-comment header.
 *
 * Both helpers state their own safety properties in prose ("no service_role,
 * no sensor tables"), so scanning raw source flags a correct safety CLAIM as a
 * violation. The first attempt at this stripped ALL comments before scanning,
 * which a comment sequence inside a string literal defeats: a stripper is not
 * a parser, and a scan that a string literal can switch off is not a fence.
 *
 * Slicing off only the LEADING header is positional, so it needs no syntax
 * awareness, and it is strictly stronger — every occurrence in the body fails,
 * whether it sits in code, in a string, or in a comment added later. The
 * failure direction is right too: a new mid-file mention of service_role in
 * either helper should force a human look, not be waved through.
 */
function bodyAfterHeader(src: string): string {
  const trimmed = src.trimStart();
  if (!trimmed.startsWith("/*")) return src;
  const close = src.indexOf(String.fromCharCode(42, 47));
  return close === -1 ? src : src.slice(close + 2);
}

describe("D-B4 — media direct-insert divergence stays exactly two files", () => {
  it("both sanctioned helpers still perform their direct insert", () => {
    for (const file of SANCTIONED) {
      expect(INSERT_RE.test(read(file)), `${file} should hold the sanctioned insert`).toBe(true);
    }
  });

  it("each sanctioned helper documents WHY it diverges", () => {
    // A bare exception with no rationale is how an accepted divergence turns
    // into an unexamined habit. A bare "Safety:"/"Contract:" heading is not a
    // rationale, so require the header to name what the helper does NOT do —
    // the claim a reviewer can actually check against the body below it.
    for (const file of SANCTIONED) {
      const header = read(file).slice(0, 1200);
      expect(header, `${file} header must name the table it writes`).toMatch(/diary_entries/);
      expect(header, `${file} header must carry a labelled safety section`).toMatch(
        /Safety:|Contract:/,
      );
      expect(header, `${file} header must state a negative bound (what it does NOT do)`).toMatch(
        /\b(No|NOT|Does NOT|never)\b/,
      );
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
    //
    // Walked in pure Node rather than shelling out to ripgrep: `rg` is not
    // installed on the GitHub runner, so a subprocess scan passes locally and
    // dies with ENOENT in CI — a fence that depends on an optional binary is
    // not a fence.
    const quickLogWriters = walkSourceFiles("src")
      .filter((file) => /quicklog/i.test(file))
      .filter((file) => !file.startsWith("src/test/"))
      .filter((file) => MULTILINE_INSERT_RE.test(readFileSync(file, "utf8")))
      .sort();
    expect(quickLogWriters).toEqual([...SANCTIONED].sort());
  });

  it("neither helper smuggles in a privileged or unrelated write", () => {
    for (const file of SANCTIONED) {
      const src = bodyAfterHeader(read(file));
      expect(src, `${file} must not reference service_role below its header`).not.toMatch(
        /service_role/i,
      );
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(
        /from\(\s*["'](action_queue|alerts|sensor_readings|profiles|subscriptions)["']\s*\)/,
      );
    }
  });
});
