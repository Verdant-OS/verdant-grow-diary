#!/usr/bin/env node
/**
 * P2 knowledge-library consistency checker.
 *
 * Not wired into CI. Run manually:
 *   node scripts/knowledge/check-p2-claim-consistency.mjs
 *
 * Why this exists
 * ---------------
 * Review of PR #994 found the same defect shape seven times: a claim corrected
 * in one file while a stale assertion survived in another, or a prose fix that
 * never reached the operative table field. `knowledge:validate` passes green
 * against all of it, because none of this is what those validators check.
 *
 * Each rule below encodes a claim this PR *withdrew*, so the checker fails if
 * one is reintroduced anywhere in the P2 file set. Add a rule whenever a claim
 * is withdrawn; that is the point of the file.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DRAFT = "docs/knowledge-library-pillar-p2-environment-draft.md";
const ASSET_DIR = "docs/knowledge-library/assets/p2-environment";

/**
 * `forbid` is matched against the file with withdrawal/negation context lines
 * removed first, so a rule can be documented without tripping itself.
 */
const RULES = [
  {
    id: "within-canopy-outcome",
    forbid: /extremes are where the (underperforming plants|plants that underperform)/i,
    why: "Cited trials compared whole treatments; within-canopy outcome was never measured.",
  },
  {
    id: "proportional-corner-yield",
    forbid: /(proportional yield (loss|penalty)|corner is a proportional)/i,
    why: "15x PPFD gave 4.5x yield; the fit has a large positive intercept.",
  },
  {
    id: "unverified-botrytis-optimum",
    forbid: /68\s*°?F/i,
    why: "S6b returned HTTP 403 and was never read; the value must not appear in prose.",
    // The §8 source register and claim map may NAME the value as a blocked source.
    // Scope that exemption to those specific table rows — a file-level exemption would
    // let the value reappear in publishable §5 prose with the checker still reporting OK.
    allowLine: (line, file) => file === DRAFT && /^\|\s*(S6b|C09)\b/.test(line.trim()),
  },
  {
    id: "federal-osha-stel",
    forbid: /federal OSHA[^.]{0,80}30,?000/i,
    why: "Federal OSHA lists no CO2 short-term limit; 30,000 ppm is Cal/OSHA, NIOSH, ACGIH.",
  },
  {
    id: "single-reading-resolves-difference",
    forbid: /repeatability[^.]{0,60}resolve[^.]{0,40}perfectly well/i,
    why: "A difference carries sqrt(2) x the repeatability, not 1 x.",
  },
  {
    id: "raw-bound-quadrature",
    forbid: /sqrt\(0\.35² \+ 0\.5² \+ 0\.30² \+ 0\.18²\)/,
    why: "Mixes datasheet bounds with a 1-sigma SEM; superseded by the GUM treatment.",
  },
  {
    id: "circular-uc",
    forbid: /u_c\s*=\s*sqrt\(u_a²/,
    why: "u_c was both a contribution and the combined result.",
  },
  {
    id: "fixed-lights-off-window",
    forbid: /(first one to two hours|template for the 60–120 minutes)/i,
    why: "No claim in §8 establishes a duration for the humidity peak.",
  },
  {
    id: "unconditional-traceability",
    forbid: /No asset introduces a number that is not in that claim map\./,
    why: "Template structure (sample rows, grid size, scaffold length) is not in §8.",
  },
  {
    id: "co2-enrichment-range",
    forbid: /1,?000\s*[–-]\s*1,?500\s*ppm/,
    why: "Unsourced horticultural enrichment range in an R3 section.",
  },
  {
    id: "instrument-dominates-emissivity",
    forbid: /instrument accuracy[^.]{0,40}is the dominant error/i,
    why: "At 50-60C reflected, emissivity error equals or exceeds instrument accuracy.",
  },
  {
    id: "fixture-as-reflected-temp",
    forbid: /aim the instrument at the surface above/i,
    why: "Reports the fixture's apparent temperature, not the effective reflected temperature at the leaf plane.",
  },
];

/**
 * Exemptions are EXPLICIT, never inferred.
 *
 * An earlier revision guessed from vocabulary — a line containing "blocked",
 * "not read", "unsupported" and so on was assumed to be documenting a withdrawal.
 * That is unsound: `68 °F is optimal, although its source is blocked` passes it,
 * which is the same file-scope hole in a different mechanism. Review of PR #994
 * caught it; the heuristic is gone.
 *
 * To document a withdrawn claim, put this HTML comment on the line (invisible in
 * rendered markdown, and impossible to trigger by accident):
 *
 *   <!-- claim-check: allow <rule-id> -->
 *
 * Rules may additionally carry `allowLine` for structured §8 metadata rows.
 */
const ALLOW_TOKEN = /<!--\s*claim-check:\s*allow\s+([a-z0-9-]+)\s*-->/i;

function explicitlyAllowed(line, ruleId) {
  const m = line.match(ALLOW_TOKEN);
  return m ? m[1].toLowerCase() === ruleId.toLowerCase() : false;
}

function filesToCheck() {
  const assets = readdirSync(ASSET_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(ASSET_DIR, f));
  return [DRAFT, ...assets];
}

/**
 * Scan units: one per LINE (catches table rows) and one per PARAGRAPH with its
 * lines joined (catches claims that ordinary Markdown wrapping splits across
 * lines — `68` ending one line and `°F` starting the next renders as one
 * sentence but evaded a line-by-line scan).
 *
 * A paragraph inherits an exemption if ANY of its lines carries the token, so a
 * documented withdrawal keeps working after re-wrapping.
 */
export function scanUnits(text) {
  const lines = text.split(/\r?\n/);
  const units = lines.map((line, i) => ({ text: line, line: i + 1, lines: [line] }));

  // Paragraph units join only wrappable PROSE. Table rows and fenced code do not
  // wrap in Markdown, so joining them would splice unrelated cells into one
  // sentence and manufacture false positives.
  const isProse = (l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("|") && !t.startsWith("```");
  };

  let start = 0;
  for (let i = 0; i <= lines.length; i += 1) {
    const atBreak = i === lines.length || !isProse(lines[i]);
    if (!atBreak) continue;
    if (i - start > 1) {
      const block = lines.slice(start, i);
      units.push({
        text: block.join(" ").replace(/\s+/g, " "),
        line: start + 1,
        lines: block,
      });
    }
    start = i + 1;
  }
  return units;
}

export function findViolations(text, file, rules = RULES) {
  const out = [];
  for (const unit of scanUnits(text)) {
    for (const rule of rules) {
      if (unit.lines.some((l) => explicitlyAllowed(l, rule.id))) continue;
      if (unit.lines.every((l) => rule.allowLine?.(l, file))) continue;
      if (rule.forbid.test(unit.text)) {
        out.push({ rule, line: unit.line, text: unit.text });
      }
    }
  }
  // one report per (rule, line) — a claim on a single line also appears in its paragraph
  const seen = new Set();
  return out.filter((v) => {
    const key = `${v.rule.id}:${v.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let failures = 0;
let checked = 0;

for (const file of filesToCheck()) {
  const text = readFileSync(file, "utf8");
  checked += 1;
  for (const v of findViolations(text, file)) {
    failures += 1;
    console.error(`FAIL [${v.rule.id}] ${file}:${v.line}`);
    console.error(`     ${v.text.trim().slice(0, 120)}`);
    console.error(`     why: ${v.rule.why}`);
  }
}

// Regression cases — a fence that can be bypassed by formatting is not a fence.
const SELF_TESTS = [
  {
    name: "wrapped claim across a line break is caught",
    text: ["Infection risk peaks around 68", "°F in a cool room."].join("\n"),
    rule: "unverified-botrytis-optimum",
    expect: true,
  },
  {
    name: "single-line claim is caught",
    text: "A dim corner is a proportional yield loss.",
    rule: "proportional-corner-yield",
    expect: true,
  },
  {
    name: "explicit token exempts its own rule",
    text: "A dim corner is a proportional yield loss. <!-- claim-check: allow proportional-corner-yield -->",
    rule: "proportional-corner-yield",
    expect: false,
  },
  {
    name: "token naming a different rule does not exempt",
    text: "A dim corner is a proportional yield loss. <!-- claim-check: allow circular-uc -->",
    rule: "proportional-corner-yield",
    expect: true,
  },
  {
    name: "token anywhere in a wrapped paragraph exempts that paragraph",
    text: [
      "Infection risk peaks around 68",
      "°F. <!-- claim-check: allow unverified-botrytis-optimum -->",
    ].join("\n"),
    rule: "unverified-botrytis-optimum",
    expect: false,
  },
];

let selfFailures = 0;
for (const t of SELF_TESTS) {
  const hit = findViolations(t.text, "<self-test>").some((v) => v.rule.id === t.rule);
  if (hit !== t.expect) {
    selfFailures += 1;
    console.error(`SELF-TEST FAIL: ${t.name} (expected ${t.expect ? "caught" : "exempt"})`);
  }
}

console.log(
  failures === 0
    ? `P2 claim consistency: OK — ${RULES.length} withdrawn claims stay withdrawn across ${checked} files`
    : `P2 claim consistency: ${failures} reintroduced claim(s)`,
);
console.log(
  selfFailures === 0
    ? `Self-tests: ${SELF_TESTS.length}/${SELF_TESTS.length} pass`
    : `Self-tests: ${selfFailures} FAILED — the fence itself is broken`,
);
process.exit(failures === 0 && selfFailures === 0 ? 0 : 1);
