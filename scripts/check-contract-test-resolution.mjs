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

/**
 * Escape a string for literal use inside a RegExp. Every metacharacter, not a
 * chosen subset: CodeQL js/incomplete-sanitization (alert 256, high, on #1221)
 * flagged an escape that handled `$` alone. The identifiers and config names
 * interpolated below cannot contain the others today — that is a fact about
 * the current callers, not a property of this function, and the function
 * should not depend on it.
 */
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/**
 * The colon signature above is precise but not complete. A guard can assert on
 * JSON source with a quoted key and NO colon — `expect(PACKAGE).toContain('"test:x"')`
 * — and two harness guards did exactly that while this checker reported OK.
 *
 * The complete signal is simpler: a file that reads the JSON source and never
 * calls JSON.parse has no resolved object to assert on, so every assertion it
 * makes about that content is an assertion on text, whatever shape it takes.
 * Measured on this repository: 28 test files read package.json source, 26
 * parse it, and the 2 that do not are precisely the two offenders.
 */
const PARSES_JSON = /JSON\.parse\s*\(/;

/**
 * Both signals above are file-level, and Codex showed the gap on #1221 (round
 * 3): a file that JSON.parses something UNRELATED satisfies PARSES_JSON, and a
 * raw `expect(PACKAGE).toContain('"test:x"')` has no colon, so the checker
 * exited 0 on exactly the shape the rule forbids.
 *
 * The precise signal is bound to the READ, not the file: find each identifier
 * the package source is assigned to, then ask whether that identifier is what an
 * assertion consumes. `expect(PACKAGE)`, `PACKAGE.includes(...)`,
 * `PACKAGE.match(...)`, `PACKAGE.indexOf(...)` are assertions on text whatever
 * their pattern looks like; `JSON.parse(PACKAGE)` is the only legitimate
 * consumer. Measured on this repository before adding it: 28 test files bind a
 * package.json read, 0 assert on the bound variable after the two conversions.
 *
 * The read is matched within its STATEMENT (`[^;]*?`, closed by `);`), not its
 * line. The round-3 form used `[^\n]*`, and prettier wraps any call past 100
 * columns — so the same bypass shape with the read on three lines bound nothing
 * and the checker exited 0 (Codex, #1221 round 4). Measured before widening: no
 * present reader in src/test was missed by the single-line form; the gap was
 * open to the next wrapped read, not to any existing one.
 */
const PACKAGE_READ_BINDINGS = (source, config) => {
  const esc = escapeRegExp(config);
  const direct = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:[\\w.]*readFile(?:Sync)?|read|readText)\\s*\\([^;]*?${esc}[^;]*?\\)\\s*;`,
    "g",
  );
  const viaConst = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:await\\s+)?(?:[\\w.]*readFile(?:Sync)?|read|readText)\\s*\\(\\s*(?:PKG|PACKAGE_JSON|PACKAGE_PATH|PKG_PATH|pkgPath|packagePath)\\b[^;]*?\\)\\s*;`,
    "g",
  );
  const ids = new Set();
  for (const m of source.matchAll(direct)) ids.add(m[1]);
  for (const m of source.matchAll(viaConst)) ids.add(m[1]);
  return [...ids];
};
const ASSERTS_ON_BINDING = (source, id) => {
  const e = escapeRegExp(id);
  return new RegExp(
    `expect\\(\\s*${e}\\s*\\)|\\b${e}\\.(?:includes|match|indexOf|search|startsWith|endsWith)\\s*\\(`,
  ).test(source);
};

/** Reads the JSON config's source, directly or through a `PKG`-style constant (statement-bounded). */
const READS_JSON_SOURCE = (source, config) => {
  const esc = escapeRegExp(config);
  return (
    new RegExp(`readFile(?:Sync)?[^;]*?${esc}`).test(source) ||
    new RegExp(`=\\s*["']${esc}["']`).test(source)
  );
};

/** Reads the config's source text (readFileSync/readFile of the config path), wrapped or not. */
const READS_CONFIG_SOURCE = (source, config) =>
  new RegExp(`readFile(?:Sync)?[^;]*?${escapeRegExp(config)}`).test(source);

/** Imports the config module (static or dynamic). */
const IMPORTS_CONFIG = (source, config) =>
  new RegExp(`(?:import\\s*\\(\\s*|from\\s*)["'][^"']*${escapeRegExp(config)}["']`).test(source);

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
    const neverParsed = !PARSES_JSON.test(source);
    const assertsOnSource = ASSERTS_ON_JSON_SOURCE.test(source);
    const rawBinding = PACKAGE_READ_BINDINGS(source, config).find((id) =>
      ASSERTS_ON_BINDING(source, id),
    );
    if (!neverParsed && !assertsOnSource && !rawBinding) continue; // parsed, asserted on the object
    const justification = source.match(JUSTIFICATION_RE);
    if (justification) {
      justified.push({ file: rel, config, reason: justification[1].trim() });
      continue;
    }
    violations.push({ file: rel, config, json: true, neverParsed, rawBinding });
  }
}

if (violations.length > 0) {
  console.error("Contract tests must assert against RESOLVED config, not source text.\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(
      v.json
        ? v.rawBinding
          ? `    asserts on \`${v.rawBinding}\`, the raw ${v.config} source it read, instead of the parsed object`
          : v.neverParsed
            ? `    reads ${v.config} source and never JSON.parse()s it — every assertion on it is on text`
            : `    asserts on ${v.config} SOURCE TEXT (a "key": pattern) instead of the parsed object`
        : `    reads ${v.config} source but never imports it`,
    );
  }
  console.error(
    '\nFix: `const config = (await import("../../<config>")).default;` then assert on the',
  );
  console.error("object. Reference: src/test/playwright-config-retry-policy.test.ts");
  console.error(
    'For package.json: `const { scripts } = JSON.parse(readFileSync("package.json", "utf8"));`',
  );
  console.error(
    'then assert on `scripts["name"]`. Reference: genetics-propagation-rls-harness-static.test.ts',
  );
  console.error("Rule: AGENTS.md > Testing Standard.");
  process.exit(1);
}

for (const j of justified) {
  console.log(`[check-contract-test-resolution] justified: ${j.file} (${j.config}) — ${j.reason}`);
}
console.log(
  `[check-contract-test-resolution] OK — every ${[...CONFIG_FILES, ...JSON_CONFIG_FILES].join("/")} guard resolves the config or declares why it cannot.`,
);
