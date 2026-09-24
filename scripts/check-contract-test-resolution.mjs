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
// A binding of the package source is compliant only as `JSON.parse(ID)` — or
// `JSON.parse(ID.toString())` / `JSON.parse(String(ID))`. Every other reference
// (`expect(ID)`, `ID.includes(…)`, `/re/.test(ID)`, `ID.split(…)`) consumes the raw
// text. This was a list of consumers until three rounds each found one it lacked:
// `$PKG.includes(…)` (round 10), then `/re/.test(PKG)` and `PKG.lastIndexOf(…)`
// (CodeRabbit, #1221 round 12). The binding side is inverted rather than extended;
// measured before inverting, no test outside the justified fixture file references
// a package binding other than to parse it.
//
// Deliberately lexical: a mention in a comment or a string also counts. That fails
// loudly and is fixed by parsing at the read; a consumer list that misses a method
// fails silently. The checker stays dependency-free (its workflow installs nothing),
// so it does not borrow a JS lexer to tell comments apart.
//
// Identifier boundaries are lookarounds, not `\b`: `$` is not a `\w` character
// (round 10), and the lookbehind also skips `obj.ID` and `a$ID`.
const USES_BINDING_AS_TEXT = (source, id) => {
  const e = escapeRegExp(id);
  for (const m of source.matchAll(new RegExp(`(?<![\\w$.])${e}(?![\\w$])`, "g"))) {
    const before = source.slice(Math.max(0, m.index - 64), m.index);
    const after = source.slice(m.index + id.length, m.index + id.length + 32);
    if (/(?:const|let|var)\s+$/.test(before)) continue; // its own declaration
    const parsed =
      (/JSON\.parse\(\s*$/.test(before) && /^\s*(?:\.toString\(\s*\))?\s*[,)]/.test(after)) ||
      (/JSON\.parse\(\s*String\(\s*$/.test(before) && /^\s*\)\s*[,)]/.test(after));
    if (!parsed) return true;
  }
  return false;
};

/**
 * An UNBOUND read consumed where it is made: `expect(readFileSync("package.json",
 * "utf8"))`, or a text method chained onto the read, `readFileSync(…).includes(…)`.
 * The binding signal above only sees identifiers a read is assigned to, so this
 * shape bound nothing and, beside an unrelated `JSON.parse`, exited 0 (Codex,
 * #1221 round 9).
 *
 * The read's extent is its own balanced argument list, not a statement-bounded
 * regex. A lazy `[^;]*?\)` walks past the read's closing parenthesis, so
 * `Object.keys(JSON.parse(readFileSync(…)).scripts).includes(…)` — a parsed,
 * compliant guard — would read as `readFileSync(…).includes(…)`. String literals
 * are skipped while balancing, so a quoted parenthesis does not end the call.
 *
 * Unlike a binding, an unbound read keeps a list of consumers: it can legitimately
 * feed something that is not an assertion, such as a copy into a fixture root
 * (`writeFileSync(…, readFileSync(…/package.json))` in check-bun-lockfile-policy).
 * Round 12 added the regex consumers `/re/.test(…)` and `/re/.exec(…)`, and
 * `lastIndexOf` / `matchAll` to the chained text methods (CodeRabbit, #1221).
 */
const READ_CALL = /(?:[\w.]*readFile(?:Sync)?|\bread|\breadText)\s*\(/g;
const TEXT_METHOD_AFTER =
  /^\s*(?:\.toString\(\s*\))?\s*\.(?:includes|match|matchAll|indexOf|lastIndexOf|search|startsWith|endsWith)\s*\(/;
const closingParen = (source, open) => {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
};
const ASSERTS_ON_INLINE_READ = (source, config) => {
  const target = new RegExp(
    `${escapeRegExp(config)}|\\b(?:PKG|PACKAGE_JSON|PACKAGE_PATH|PKG_PATH|pkgPath|packagePath)\\b`,
  );
  for (const m of source.matchAll(READ_CALL)) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(source, open);
    if (close < 0 || !target.test(source.slice(open + 1, close))) continue;
    const after = source.slice(close + 1);
    if (TEXT_METHOD_AFTER.test(after)) return true;
    const consumedByCall =
      /(?:expect|\.test|\.exec)\(\s*(?:await\s+)?$/.test(source.slice(0, m.index)) &&
      /^\s*(?:\.toString\(\s*\))?\s*\)/.test(after);
    if (consumedByCall) return true;
  }
  return false;
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
      USES_BINDING_AS_TEXT(source, id),
    );
    const inlineRead = ASSERTS_ON_INLINE_READ(source, config);
    if (!neverParsed && !assertsOnSource && !rawBinding && !inlineRead) continue; // parsed, asserted on the object
    const justification = source.match(JUSTIFICATION_RE);
    if (justification) {
      justified.push({ file: rel, config, reason: justification[1].trim() });
      continue;
    }
    violations.push({ file: rel, config, json: true, neverParsed, rawBinding, inlineRead });
  }
}

if (violations.length > 0) {
  console.error("Contract tests must assert against RESOLVED config, not source text.\n");
  for (const v of violations) {
    console.error(`  ${v.file}`);
    console.error(
      v.json
        ? v.rawBinding
          ? `    uses \`${v.rawBinding}\`, the raw ${v.config} source it read, other than as \`JSON.parse(${v.rawBinding})\` — comments and strings count; parse at the read`
          : v.inlineRead
            ? `    asserts on an unbound ${v.config} read (\`expect(readFileSync(…))\`, \`/re/.test(readFileSync(…))\` or \`readFileSync(…).includes(…)\`) instead of the parsed object`
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
