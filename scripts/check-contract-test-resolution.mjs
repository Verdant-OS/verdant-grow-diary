#!/usr/bin/env node
/**
 * Contract-test resolution check.
 *
 * AGENTS.md ("Contract tests must assert against resolved values, not source
 * text"): a test guarding a CONFIG file must import it and assert on the
 * resolved object. Regex-matching the config's source text cannot tell a live
 * setting from one commented out, moved into a narrower scope, or duplicated —
 * all three read the same to a text match while only the first still holds.
 *
 * Verified failure this exists to prevent: `playwright-action-timeout-fence`
 * regex-matched `playwright.config.ts`; replacing the setting with
 * `// was actionTimeout: 15_000, …` left the guard green.
 *
 * SCOPE — deliberately narrow, so it stays true rather than merely strict:
 * only tests that read a CONFIG_FILE's source (playwright.config.ts /
 * vitest.config.ts) are flagged, and only when they never import it. Reading
 * *other* sources (specs, generated artifacts, docs) to prove a string is
 * present or absent is legitimate and untouched — that is what source
 * scanning is actually good at.
 *
 * EXPLICIT EXCEPTION: sometimes resolving is genuinely impossible. Importing
 * `vitest.config` from inside this suite fails under jsdom on esbuild's
 * TextEncoder invariant, and under `@vitest-environment node` on the shared
 * setup's `window.scrollTo` (both verified 2026-08-07) — so its guard scans
 * source. Such a test declares
 *
 *   @source-scan-justified: <reason>
 *
 * in a comment, naming the blocker actually hit rather than a plausible one.
 * The exception is then visible in the diff, and printed on every run, rather
 * than silently absent. A justification with no reason text is rejected.
 *
 * Exit 0 = compliant. Exit 1 = a config guard asserts on text only.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = process.cwd();
const TEST_DIR = join(REPO_ROOT, "src", "test");

/** Config modules whose guards must assert on resolved values. */
const CONFIG_FILES = ["playwright.config", "vitest.config"];

/**
 * JSON configs whose guards must assert on the PARSED object.
 *
 * JSON has no comments, so the comment-out defeat that motivated the rule for
 * TS configs cannot happen here. Two others can, and do: a regex over JSON
 * source cannot tell which of two duplicate keys wins, and — the failure
 * actually found in this repository — it cannot tell WHICH nesting level a key
 * sits at, so a pattern intended for one key silently matches a same-named key
 * somewhere else entirely and passes for the wrong reason.
 *
 * `JSON.parse` is always available and has none of these problems, so unlike
 * the TS configs there is no import hazard and no reason to scan.
 */
const JSON_CONFIG_FILES = ["package.json"];

/**
 * An assertion whose PATTERN contains a JSON key in source form — `"someKey":`.
 * That shape is only meaningful against raw JSON text; against a parsed object
 * you would write `obj.someKey`. It is therefore a precise signature for
 * "asserting on JSON source", with no false positives from tests that merely
 * read the file and then parse it.
 */
const ASSERTS_ON_JSON_SOURCE =
  /(?:toMatch|toContain|\.match|\.includes)\s*\(\s*[/"'`][^\n]*\\?"[A-Za-z0-9:_@./-]+\\?"\s*:/;

/** Reads the JSON config's source, directly or through a `PKG`-style constant. */
const READS_JSON_SOURCE = (source, config) => {
  const esc = config.replace(".", "\\.");
  return (
    new RegExp(`readFile(?:Sync)?[^\\n]*${esc}`).test(source) ||
    new RegExp(`=\\s*["']${esc}["']`).test(source)
  );
};

/** Reads the config's source text (readFileSync/readFile of the config path). */
const READS_CONFIG_SOURCE = (source, config) =>
  new RegExp(`readFile(?:Sync)?[^\\n]*${config.replace(".", "\\.")}`).test(source);

/** Imports the config module (static or dynamic). */
const IMPORTS_CONFIG = (source, config) =>
  new RegExp(`(?:import\\s*\\(|from\\s*)["'][^"']*${config.replace(".", "\\.")}["']`).test(source);

function listTestFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTestFiles(full));
      continue;
    }
    if (/\.test\.(ts|tsx|mts|mjs)$/.test(name)) out.push(full);
  }
  return out.sort();
}

/**
 * Opt-out marker: `@source-scan-justified: <non-empty reason>`.
 *
 * Same-line whitespace only (`[ \t]*`, not `\s*`): `\s*` crosses newlines, so
 * a marker with NO reason would capture the next line — in a block comment
 * that is the `*​/` terminator — and a blank justification would be accepted
 * as if it carried a reason.
 */
const JUSTIFICATION_RE = /@source-scan-justified:[ \t]*(\S[^\n]*)/;

const violations = [];
const justified = [];
for (const file of listTestFiles(TEST_DIR)) {
  const source = readFileSync(file, "utf8");
  const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
  for (const config of CONFIG_FILES) {
    if (!READS_CONFIG_SOURCE(source, config)) continue;
    if (IMPORTS_CONFIG(source, config)) continue; // reads source AND resolves — fine
    const justification = source.match(JUSTIFICATION_RE);
    if (justification) {
      justified.push({ file: rel, config, reason: justification[1].trim() });
      continue;
    }
    violations.push({ file: rel, config });
  }
  for (const config of JSON_CONFIG_FILES) {
    if (!READS_JSON_SOURCE(source, config)) continue;
    if (!ASSERTS_ON_JSON_SOURCE.test(source)) continue; // reads it, then parses — fine
    const justification = source.match(JUSTIFICATION_RE);
    if (justification) {
      justified.push({ file: rel, config, reason: justification[1].trim() });
      continue;
    }
    violations.push({ file: rel, config, json: true });
  }
}

if (violations.length > 0) {
  console.error("Contract tests must assert against RESOLVED config, not source text.\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(
      v.json
        ? `    asserts on ${v.config} SOURCE TEXT (a "key": pattern) instead of the parsed object`
        : `    reads ${v.config} source but never imports it`,
    );
  }
  console.error(
    '\nFix: `const config = (await import("../../<config>")).default;` then assert on the',
  );
  console.error("object. Reference: src/test/playwright-config-retry-policy.test.ts");
  console.error("Rule: AGENTS.md > Testing Standard.");
  process.exit(1);
}

for (const j of justified) {
  console.log(`[check-contract-test-resolution] justified: ${j.file} (${j.config}) — ${j.reason}`);
}
console.log(
  `[check-contract-test-resolution] OK — every ${[...CONFIG_FILES, ...JSON_CONFIG_FILES].join("/")} guard resolves the config or declares why it cannot.`,
);
