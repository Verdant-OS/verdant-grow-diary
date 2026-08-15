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

let failures = 0;
let checked = 0;

for (const file of filesToCheck()) {
  const lines = readFileSync(file, "utf8").split("\n");
  checked += 1;
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (explicitlyAllowed(line, rule.id)) return;
      if (rule.allowLine?.(line, file)) return;
      if (rule.forbid.test(line)) {
        failures += 1;
        console.error(`FAIL [${rule.id}] ${file}:${i + 1}`);
        console.error(`     ${line.trim().slice(0, 120)}`);
        console.error(`     why: ${rule.why}`);
      }
    });
  }
}

console.log(
  failures === 0
    ? `P2 claim consistency: OK — ${RULES.length} withdrawn claims stay withdrawn across ${checked} files`
    : `P2 claim consistency: ${failures} reintroduced claim(s)`,
);
process.exit(failures === 0 ? 0 : 1);
