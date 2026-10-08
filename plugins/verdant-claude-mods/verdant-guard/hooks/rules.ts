// Pure rules for verdant-guard: no engine, no I/O, deterministic.
// Each check returns a refusal reason, or null when the call may run.
// Source of every rule: AGENTS.md / CLAUDE.md on the verdant-grow-diary deploy branch.

export const PROTECTED_BRANCHES = ["verdant-grow-diary", "main"] as const;

// The production Supabase project ref (CURRENT_STATE.md, standing directive 2026-08-25).
export const PRODUCTION_PROJECT_REF = "knkwiiywfkbqznbxwqfh";

const HEREDOC_START = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
const SHELL_READS_STDIN = /(^|[\s|;&(])(bash|sh|zsh|dash)(\s+-[a-z]+)*\s*(<<|$)/;

/**
 * Drops heredoc bodies: they are data (a file being written, a script for python or node),
 * not shell commands. A body fed to a shell (`bash <<EOF`) is kept, since the shell runs it.
 */
export function stripHeredocs(command: string): string {
  const out: string[] = [];
  let end: string | null = null;
  let keep = false;
  for (const line of command.split("\n")) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      else if (keep) out.push(line);
      continue;
    }
    out.push(line);
    const m = HEREDOC_START.exec(line);
    if (m && m[2]) {
      end = m[2];
      keep = SHELL_READS_STDIN.test(line.slice(0, m.index).trimEnd() + " <<");
    }
  }
  return out.join("\n");
}

/**
 * Splits a shell command into simple-command segments and tokens. Quote-aware: `&&`, `||`,
 * `;`, `|` and newlines split only outside quotes, so `grep "a|git push --force"` stays one
 * command. Quotes are removed from tokens; a backslash escapes the next character outside
 * single quotes. It does not expand `$(…)`, backticks or `bash -c` strings (see README).
 * Unquoted redirections (`2>&1`, `> log`, `<in`) and their targets are dropped, since they are
 * not arguments; pass `redirections: false` for text no shell parses, such as an `env -S` string.
 */
/** Index of the `)` closing the `(` at `open`, respecting nested parens and quotes; -1 if none. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  let quote: "'" | '"' | null = null;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "\\") i += 1;
    else if (c === "'" || c === '"') quote = c;
    else if (c === "(") depth += 1;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

export function segments(command: string, redirections = true): string[][] {
  const text = stripHeredocs(command);
  const out: string[][] = [];
  let tokens: string[] = [];
  let token = "";
  let inToken = false;
  let quoted = false;
  let quote: "'" | '"' | null = null;
  // `redirect`: the current word is a redirection; `dropNext`: the next word is its target.
  let redirect = false;
  let dropNext = false;
  const endToken = () => {
    if (inToken) {
      if (redirect) dropNext = token === "";
      else if (dropNext) dropNext = false;
      else tokens.push(token);
    }
    token = "";
    inToken = false;
    quoted = false;
    redirect = false;
  };
  const endSegment = () => {
    endToken();
    dropNext = false;
    if (tokens.length > 0) out.push(tokens);
    tokens = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quote !== null) {
      if (quote === '"' && c === "$" && text[i + 1] === "(") {
        // A command substitution still runs inside double quotes: check its body as commands.
        const end = matchingParen(text, i + 1);
        if (end > i + 1) {
          out.push(...segments(text.slice(i + 2, end)));
          token += text.slice(i, end + 1);
          i = end;
          continue;
        }
      }
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && i + 1 < text.length) {
        // As in bash: inside double quotes a backslash escapes only $ ` " \ and newline;
        // before anything else it stays, so `"git\_push"` keeps its backslash for env -S.
        const next = text[i + 1]!;
        if (next === "\n") i += 1;
        else if ('$`"\\'.includes(next)) token += text[++i];
        else token += c;
      } else token += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      inToken = true;
      quoted = true;
    } else if (
      redirections &&
      !redirect &&
      (c === ">" || c === "<" || (c === "&" && text[i + 1] === ">"))
    ) {
      // An unquoted `>`, `<` or `&>` opens a redirection: read the whole operator, then any
      // attached target. A descriptor right before it (`2>`, `{fd}>`) belongs to it; any
      // other word before it (`main>log`, `-f>log`) is a word of its own and stays.
      if (inToken && (quoted || !/^(\d+|\{[A-Za-z_][A-Za-z0-9_]*\})$/.test(token))) endToken();
      while (i + 1 < text.length && "<>&|".includes(text[i + 1]!)) i += 1;
      redirect = true;
      inToken = true;
      token = "";
    } else if (c === "\\" && i + 1 < text.length) {
      // A backslash-newline is a line continuation, not a character.
      if (text[i + 1] !== "\n") {
        token += text[i + 1];
        inToken = true;
      }
      i += 1;
    } else if (c === "\n" || c === ";" || c === "|" || c === "(" || c === ")") {
      if (c === "|" && text[i + 1] === "|") i += 1;
      endSegment();
    } else if (c === "&" && text[i - 1] !== ">" && text[i + 1] !== ">") {
      // `&&` and a lone background `&` both end a command; `2>&1` and `&>` are redirections.
      if (text[i + 1] === "&") i += 1;
      endSegment();
    } else if (/\s/.test(c)) {
      endToken();
    } else {
      token += c;
      inToken = true;
    }
  }
  endSegment();
  // An unclosed quote would hide everything after it, so fall back to the conservative
  // split that treats every operator as a separator.
  if (quote !== null) return [...out, ...naiveSegments(text)];
  return out;
}

function naiveSegments(text: string): string[][] {
  return text
    .split(/&&|\|\||;|\||\n|\(|\)|(?<![>])&(?![>])/)
    .map((s) =>
      s
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => t.replace(/^['"]|['"]$/g, "")),
    )
    .filter((t) => t.length > 0);
}

// Wrapper commands and their options that consume the next token. Any other option is taken to
// stand alone; `--` ends the wrapper's options.
const WRAPPER_VALUE_OPTIONS = new Map<string, ReadonlySet<string>>([
  ["env", new Set(["-u", "--unset", "-C", "--chdir"])],
  [
    "sudo",
    new Set([
      "-u",
      "--user",
      "-g",
      "--group",
      "-C",
      "--close-from",
      "-D",
      "--chdir",
      "-h",
      "--host",
      "-p",
      "--prompt",
      "-R",
      "--chroot",
      "-r",
      "--role",
      "-t",
      "--type",
      "-T",
      "--command-timeout",
      "-U",
      "--other-user",
    ]),
  ],
  ["exec", new Set(["-a"])],
  ["time", new Set(["-f", "--format", "-o", "--output"])],
]);

/** Splits a string into words the way a shell would, removing quotes (`env -S`, `npx -c`). */
function shellWords(text: string): string[] {
  return segments(text, false).flat();
}

/**
 * Drops leading `VAR=value` assignments and `sudo`/`env`/`exec`/`time` wrappers with their own
 * options, so `env -i git push --force` is checked as `git push --force`. `env -S "<cmd>"`
 * (`--split-string`) runs its argument as the command, so that argument is split and checked.
 * A short-option cluster (`sudo -Eu runner`) is read letter by letter: the first value-taking
 * letter takes the rest of the cluster as its value, or the next token when it is last.
 */
function stripPrefix(tokens: string[], onSplit?: (split: string) => void): string[] {
  let rest = tokens;
  for (;;) {
    const head = rest[0];
    if (head === undefined) return rest;
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) {
      rest = rest.slice(1);
      continue;
    }
    const valueOptions = WRAPPER_VALUE_OPTIONS.get(head);
    if (valueOptions === undefined) return rest;
    let i = 1;
    let split: string | null = null;
    while (i < rest.length && rest[i]!.startsWith("-")) {
      const option = rest[i]!;
      if (option === "--") {
        i += 1;
        break;
      }
      if (option.startsWith("--")) {
        // Long options match by unambiguous prefix, as getopt_long does (`--spli`, `--us`).
        const eq = option.indexOf("=");
        if (head === "env" && longOpt(option, "split-string")) {
          split = eq >= 0 ? option.slice(eq + 1) : (rest[i + 1] ?? "");
          i += eq >= 0 ? 1 : 2;
          break;
        }
        const takesValue =
          eq < 0 &&
          [...valueOptions].some((v) => v.startsWith("--") && longOpt(option, v.slice(2)));
        i += takesValue ? 2 : 1;
        continue;
      }
      // A single-dash option is read letter by letter, whatever follows the first letter: an
      // attached value can hold any character (`env -S'git push -f'`, `sudo -urunner`).
      if (/^-[A-Za-z]/.test(option)) {
        let consumed = 1;
        for (let k = 1; k < option.length; k += 1) {
          const letter = `-${option[k]}`;
          const attached = option.slice(k + 1);
          if (head === "env" && letter === "-S") {
            split = attached !== "" ? attached : (rest[i + 1] ?? "");
            consumed = attached !== "" ? 1 : 2;
            break;
          }
          if (valueOptions.has(letter)) {
            if (attached === "") consumed = 2;
            break;
          }
        }
        i += consumed;
        if (split !== null) break;
        continue;
      }
      i += valueOptions.has(option) ? 2 : 1;
    }
    if (split === null) {
      rest = rest.slice(i);
      continue;
    }
    onSplit?.(split);
    // GNU env puts the split words back in place of `-S` and keeps parsing them as its own
    // options, so `env -S '-- git push -f'` runs the push: parse them as env options again.
    rest = [head, ...shellWords(split), ...rest.slice(i)];
  }
}

/** True when a short-option cluster such as `-uf` sets `flag` before any value-taking letter. */
function clusterHas(token: string, flag: string, valueLetters: string): boolean {
  if (!/^-[A-Za-z0-9]{2,}$/.test(token)) return false;
  for (const c of token.slice(1)) {
    if (c === flag) return true;
    if (valueLetters.includes(c)) return false;
  }
  return false;
}

/** For `git -C dir push ...` returns ["push", ...]. */
function gitArgs(tokens: string[]): string[] | null {
  if (tokens[0] !== "git") return null;
  let i = 1;
  for (let t = tokens[i]; t !== undefined && t.startsWith("-"); t = tokens[i]) {
    // -C <dir> and -c <k=v> consume a value
    i += t === "-C" || t === "-c" ? 2 : 1;
  }
  return tokens.slice(i);
}

/**
 * True when `token` is `--<full>` or an abbreviation of it, with or without `=value`. Git's
 * option parser accepts any unambiguous prefix (`--al` is `--all`, `--force-w` is
 * `--force-with-lease`); an ambiguous one is an error, so matching every prefix fails closed.
 */
function longOpt(token: string, full: string): boolean {
  const m = /^--([A-Za-z0-9-]+)(=.*)?$/.exec(token);
  return m !== null && m[1] !== undefined && full.startsWith(m[1]);
}

const FORCE_LONG = ["force", "force-with-lease", "force-if-includes"] as const;

function checkGit(args: string[]): string | null {
  const [sub, ...rest] = args;
  if (sub === "push") {
    if (
      rest.some(
        (t) =>
          t === "-f" ||
          FORCE_LONG.some((f) => longOpt(t, f)) ||
          clusterHas(t, "f", "o") ||
          (/^\+/.test(t) && !t.startsWith("+-")),
      )
    ) {
      return "Force-push is forbidden (AGENTS.md › Git and merges: never force-push or rewrite history). Update the branch by merging from base.";
    }
    if (rest.some((t) => longOpt(t, "no-verify"))) {
      return "`--no-verify` skips the repo's pre-commit/pre-push safety gates. Run the hooks and fix what they report.";
    }
    if (rest.some((t) => longOpt(t, "all") || longOpt(t, "mirror") || longOpt(t, "branches"))) {
      return "Bulk pushes (`--all`, `--mirror`, `--branches`) include `main` and `verdant-grow-diary` when they exist locally (AGENTS.md: never push directly to them). Push your own task branch by name.";
    }
    const positional = rest.filter((t) => !t.startsWith("-"));
    if (positional.slice(1).some((ref) => ref === ":" || ref === "+:")) {
      return "The `:` refspec pushes every matching branch, including protected ones (AGENTS.md: never push directly to verdant-grow-diary or main). Push your own task branch by name.";
    }
    for (const ref of positional.slice(1)) {
      const target = ref.includes(":") ? ref.split(":").pop()! : ref;
      const branch = target.replace(/^refs\/heads\//, "");
      if (target.includes("*")) {
        // A wildcard refspec pushes every local branch it matches (`refs/heads/*:refs/heads/*`).
        const glob = new RegExp(
          `^${target
            .split("*")
            .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
            .join(".*")}$`,
        );
        const hit = PROTECTED_BRANCHES.find((b) => glob.test(b) || glob.test(`refs/heads/${b}`));
        if (hit) {
          return `The wildcard refspec \`${ref}\` can push \`${hit}\` (AGENTS.md: never push directly to verdant-grow-diary or main). Push your own task branch by name.`;
        }
        continue;
      }
      if ((PROTECTED_BRANCHES as readonly string[]).includes(branch)) {
        return `Pushing to \`${branch}\` is forbidden (AGENTS.md: never push directly to verdant-grow-diary or main). Push your own task branch and open a draft PR.`;
      }
    }
    return null;
  }
  if (sub === "rebase" && !rest.some((t) => t === "--abort" || t === "--quit")) {
    return "`git rebase` rewrites history (AGENTS.md: update branches by merging from base). Use `git merge origin/<base>`.";
  }
  // `git pull` short options cluster (`-qr`); -s, -X, -o, -S and -j take the rest as a value.
  if (
    sub === "pull" &&
    rest.some((t) => t === "-r" || longOpt(t, "rebase") || clusterHas(t, "r", "sXoSj"))
  ) {
    return "`git pull --rebase` rewrites history. Use `git pull --no-rebase` or `git merge`.";
  }
  if (
    sub === "commit" &&
    rest.some((t) => longOpt(t, "no-verify") || t === "-n" || clusterHas(t, "n", "mFcCtSu"))
  ) {
    return "`git commit --no-verify` skips lint-staged, the full-project tsc and the docs-safety asserts. Commit without it and fix what fails.";
  }
  if (sub === "filter-branch" || sub === "filter-repo") {
    return "History rewriting is forbidden (AGENTS.md › Git and merges).";
  }
  return null;
}

const LOCK_MSG =
  "Dependency and lockfile changes are off-limits without Matthew's approval (AGENTS.md › Off-limits). Bun is canonical; never add/change deps with npm/yarn/pnpm.";

function checkPackageManager(tokens: string[]): string | null {
  const [pm, sub, ...rest] = tokens;
  const positional = rest.filter((t) => !t.startsWith("-"));
  if (pm === "npm") {
    if (["add", "uninstall", "remove", "rm", "un", "update", "up", "upgrade"].includes(sub ?? ""))
      return LOCK_MSG;
    // A bare install (no package named) is the run skill's public-registry bootstrap; naming a package is a dependency change.
    if ((sub === "install" || sub === "i") && positional.length > 0) return LOCK_MSG;
    return null;
  }
  if (pm === "yarn" || pm === "pnpm") {
    if (["add", "remove", "install", "i", "up", "upgrade", "update"].includes(sub ?? ""))
      return LOCK_MSG;
    return null;
  }
  if (pm === "bun") {
    if (["add", "a", "remove", "rm", "update"].includes(sub ?? "")) return LOCK_MSG;
    if (sub === "install" || sub === "i") {
      if (positional.length > 0) return LOCK_MSG;
      return "Don't run `bun install` here: bun.lock pins ~137 tarballs on a Lovable registry that 403s outside its sandbox. If node_modules exists, use it; otherwise follow the verified bootstrap in .claude/skills/run-verdant-grow-diary/SKILL.md.";
    }
  }
  return null;
}

// Playwright options that take no value. Every other option written without `=` is assumed to
// consume the next token, so an unlisted value (`--global-timeout 60000`, `--only-changed main`)
// is never mistaken for a spec filter. Unknown flags fail closed: pass `--flag=value` instead.
const PW_BOOLEAN_FLAGS = new Set([
  "--debug",
  "--fail-on-flaky-tests",
  "--forbid-only",
  "--fully-parallel",
  "--headed",
  "--help",
  "-h",
  "--ignore-snapshots",
  "--last-failed",
  "--list",
  "--no-deps",
  "--pass-with-no-tests",
  "--quiet",
  "--ui",
  "-x",
]);

/** A spec filter the shell passes through unchanged: no expansion can make it disappear. */
const PW_LITERAL_FILTER = /^[A-Za-z0-9._/:@+=-]+$/;

const PW_DEBUG_MODES = new Set(["inspector", "cli"]);

/** Drops a package-runner prefix: `bunx`, `npx`, `bun x`, `pnpm dlx|exec`, `yarn dlx|exec`. */
function stripRunner(tokens: string[]): string[] {
  const [a, b] = tokens;
  let rest: string[];
  if (a === "bunx" || a === "npx") rest = tokens.slice(1);
  else if (a === "bun" && b === "x") rest = tokens.slice(2);
  else if ((a === "pnpm" || a === "yarn") && (b === "dlx" || b === "exec")) rest = tokens.slice(2);
  else return tokens;
  // Skip the runner's own flags (`-y`, `--yes`, `--bun`, `--silent`, …). `-p`/`--package`
  // take a value; `-c`/`--call` take the command itself, which is what gets checked.
  for (let i = 0; i < rest.length; i += 1) {
    const t = rest[i] ?? "";
    if (!t.startsWith("-")) return rest.slice(i);
    if ((t === "-c" || t === "--call") && rest[i + 1] !== undefined) {
      return rest[i + 1]!.split(/\s+/).filter(Boolean);
    }
    if (t.startsWith("--call=")) return t.slice("--call=".length).split(/\s+/).filter(Boolean);
    if (t === "-p" || t === "--package") i += 1;
  }
  return [];
}

/** The credential-free projects in `playwright.config.ts`, which install no global route mocks. */
const PW_MOCKED_PROJECTS = ["chromium-mocked", "webkit-mocked"] as const;

/** A `--project` value with nothing left for the shell to expand. */
const PW_PROJECT_LITERAL = /^[A-Za-z0-9._/:@+=*-]+$/;

/**
 * True when a `--project` selector picks a mocked project. Playwright 1.62 compares names
 * case-insensitively and reads `*` as a wildcard (`filterProjects` in `lib/runner/index.js`).
 */
function selectsMockedProject(selector: string): boolean {
  // A selector the shell can still expand (`$P`, a substitution, `{a,b}`, `?`/`[…]` globs) is
  // unknown here, so it fails closed. `*` stays: Playwright reads it as its own wildcard.
  if (!PW_PROJECT_LITERAL.test(selector)) return true;
  const lower = selector.toLocaleLowerCase();
  if (!lower.includes("*")) return lower.includes("mocked");
  const escaped = lower.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`^${escaped.join(".*")}$`);
  return PW_MOCKED_PROJECTS.some((name) => pattern.test(name));
}

function checkPlaywright(tokens: string[]): string | null {
  const t = stripRunner(tokens);
  if (t[0] !== "playwright" || t[1] !== "test") return null;
  const args = t.slice(2);
  const projects: string[] = [];
  let specs = 0;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? "";
    if (a.startsWith("--project=")) {
      projects.push(a.slice("--project=".length));
      continue;
    }
    if (a === "--project") {
      // `--project <project-name...>` is variadic: every word up to the next option is a project
      // name, a spec path included (Playwright then reports that "project" as not found).
      while (i + 1 < args.length && !(args[i + 1] ?? "-").startsWith("-"))
        projects.push(args[++i]!);
      continue;
    }
    if (a.startsWith("-")) {
      // `--debug [mode]` takes an optional mode (Playwright 1.62: `inspector` or `cli`).
      if (a === "--debug" && PW_DEBUG_MODES.has(args[i + 1] ?? "")) {
        i += 1;
        continue;
      }
      if (!a.includes("=") && !PW_BOOLEAN_FLAGS.has(a) && !(args[i + 1] ?? "-").startsWith("-")) {
        i += 1;
      }
      continue;
    }
    // An empty filter matches every test, and the shell can expand a word to nothing (`$VAR`,
    // a substitution, `{,}`, a glob under nullglob), so only a plain literal word counts.
    if (PW_LITERAL_FILTER.test(a)) specs += 1;
  }
  if (specs > 0) return null;
  if (projects.length === 0) {
    return "`playwright test` with no `--project` runs every project, `chromium-mocked` included, and without a spec filter that can reach real Supabase (the mocked projects install no global route mocks). Pass an explicit spec path.";
  }
  const project = projects.find(selectsMockedProject);
  if (project !== undefined) {
    return `\`--project=${project}\` without a spec filter can reach real Supabase (the mocked projects install no global route mocks). Pass an explicit spec path.`;
  }
  return null;
}

const PFLAG_TRUE = /^(1|t|T|TRUE|true|True)$/;

/** The effective value of a GitHub CLI `--undo` boolean flag across all its occurrences. */
function undoIsSet(tokens: string[]): boolean {
  let undo = false;
  for (const t of tokens) {
    // After `--` every word is positional: `gh pr ready -- --undo` selects a branch named `--undo`.
    if (t === "--") break;
    if (t === "--undo") undo = true;
    else if (t.startsWith("--undo=")) undo = PFLAG_TRUE.test(t.slice("--undo=".length));
  }
  return undo;
}

const PROD_MSG =
  "Production database changes, deploys, promotion and rollback are Matthew's decisions (AGENTS.md › Release and Environment Rules). Prepare a release packet or escalation instead.";

function checkProductionOps(rawTokens: string[], whole: string): string | null {
  const tokens = stripRunner(rawTokens);
  const [cmd, a, b] = tokens;
  if (cmd === "supabase") {
    if (a === "db" && (b === "push" || (b === "reset" && tokens.includes("--linked"))))
      return PROD_MSG;
    if (a === "migration" && (b === "up" || b === "repair")) return PROD_MSG;
    if (a === "functions" && b === "deploy") return PROD_MSG;
    if (a === "secrets" && (b === "set" || b === "unset")) return PROD_MSG;
  }
  if (cmd === "vercel") {
    if (tokens.includes("--prod") || ["promote", "rollback", "alias"].includes(a ?? ""))
      return PROD_MSG;
  }
  // `gh pr ready --undo` converts a PR back to draft, which the drafts-remain-draft rule wants.
  // `--undo` is a pflag boolean: the last occurrence wins and `--undo=false` turns it off.
  if (cmd === "gh" && a === "pr" && (b === "merge" || (b === "ready" && !undoIsSet(tokens)))) {
    return "Merging and marking PRs ready belong to Chemdawg after 35/35 required checks plus an independent exact-head PASS (AGENTS.md). Drafts remain draft.";
  }
  if (
    (cmd === "psql" || cmd === "pg_dump" || cmd === "pg_restore") &&
    whole.includes(PRODUCTION_PROJECT_REF)
  ) {
    return PROD_MSG;
  }
  return null;
}

/** The whole Bash rule set. */
export function checkBash(command: string): string | null {
  for (const raw of segments(command)) {
    let expands = false;
    const tokens = stripPrefix(raw, (split) => {
      // GNU `env -S` has its own grammar beyond quotes: `${NAME}` expansion, backslash
      // escapes (`\_` separates arguments, `\c` ends the string) and `#` comments. This
      // guard models quotes only, so any of those makes the wrapped command uncheckable.
      if (/[\\$#]/.test(split)) expands = true;
    });
    if (expands) {
      return "`env -S` with `$`, `\\` or `#` uses env's own expansion, escapes or comments, so the command it runs cannot be checked here. Write the command out without `env -S`.";
    }
    if (tokens.length === 0) continue;
    const git = gitArgs(tokens);
    const reason =
      (git ? checkGit(git) : null) ??
      checkPackageManager(tokens) ??
      checkPlaywright(tokens) ??
      checkProductionOps(tokens, command);
    if (reason) return reason;
  }
  return null;
}

/** Normalises a path to its repo-relative form by anchoring on known roots. */
export function repoRelative(filePath: string, repoRoot?: string | null): string {
  const p = filePath.replace(/\\/g, "/");
  // With the repository root known, strip it exactly: the heuristic below would anchor on the
  // first `/src/` or `/docs/` anywhere, which is wrong for a checkout under ~/src/ or ~/docs/.
  const root = repoRoot ? repoRoot.replace(/\\/g, "/").replace(/\/+$/, "") : "";
  if (root && p.startsWith(`${root}/`)) return p.slice(root.length + 1);
  for (const root of ["src/", "supabase/", "scripts/", "docs/", "e2e/", "config/", ".github/"]) {
    const i = p.indexOf(`/${root}`);
    if (i >= 0) return p.slice(i + 1);
    if (p.startsWith(root)) return p;
  }
  return p.replace(/^.*\//, "");
}

const GENERATED = [
  /^src\/routeTree\.gen\.ts$/,
  /^src\/integrations\/supabase\/types\.ts$/,
  /^supabase\/functions\/mcp\/index\.ts$/,
  /^supabase\/functions\/_shared\/lib\//,
];

const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
]);

export const MIGRATION_PATH = /^supabase\/migrations\/[^/]+\.sql$/;

/**
 * Static file-edit rules. Published-migration immutability needs a git lookup,
 * so it is decided in register.ts with `isPublished`.
 */
export function checkFileEdit(filePath: string, repoRoot?: string | null): string | null {
  const rel = repoRelative(filePath, repoRoot);
  if (GENERATED.some((re) => re.test(rel))) {
    return `\`${rel}\` is generated — never hand-edit it (CLAUDE.md › Conventions). Regenerate it with the repo's tooling.`;
  }
  if (LOCKFILES.has(rel)) return LOCK_MSG;
  return null;
}

export const PUBLISHED_MIGRATION_MSG = (rel: string) =>
  `\`${rel}\` is a published migration and is permanent history (AGENTS.md › Migration Immutability). Ship a new additive migration, or check config/local-supabase-replay-compatibility.json.`;

/**
 * MCP tools that publish, merge, promote or write production, keyed by service and tool name.
 * The server segment of `mcp__<server>__<tool>` varies by how a connector is installed
 * (`Supabase`, `supabase`, `claude_ai_Supabase`), so it is matched by service, not exactly.
 */
const MCP_DENY: Record<string, string> = {
  github__merge_pull_request: "merge",
  github__enable_pr_auto_merge: "merge",
  supabase__apply_migration: "prod",
  supabase__execute_sql: "prod",
  supabase__deploy_edge_function: "prod",
  supabase__merge_branch: "prod",
  supabase__reset_branch: "prod",
  supabase__delete_branch: "prod",
  supabase__pause_project: "prod",
  supabase__restore_project: "prod",
  vercel__request_promote: "prod",
  vercel__request_rollback: "prod",
  vercel__create_deployment: "prod",
  vercel__start_rolling_release: "prod",
  vercel__complete_rolling_release: "prod",
  vercel__approve_rolling_release_stage: "prod",
  lovable__deploy_project: "prod",
};

const MCP_SERVICES = ["github", "supabase", "vercel", "lovable"] as const;

/** `mcp__claude_ai_Supabase__execute_sql` → `supabase__execute_sql`; null for other servers. */
function mcpServiceTool(tool: string): string | null {
  const m = /^mcp__(.+?)__([^_].*)$/.exec(tool);
  if (!m || !m[1] || !m[2]) return null;
  const server = m[1].toLowerCase();
  // The service must be a whole `_`- or `-`-separated part of the server name, so
  // `claude-ai-supabase` and `supabase_prod` match while `notsupabase` does not.
  const parts = server.split(/[_-]/);
  const service = MCP_SERVICES.find((s) => parts.includes(s));
  return service ? `${service}__${m[2]}` : null;
}

export function checkMcp(tool: string, input: Record<string, unknown>): string | null {
  const key = mcpServiceTool(tool);
  const kind = key ? MCP_DENY[key] : undefined;
  if (kind === "merge") {
    return "Merging belongs to Chemdawg after 35/35 required checks plus an independent exact-head PASS (AGENTS.md).";
  }
  if (kind === "prod") return PROD_MSG;
  if (key === "github__update_pull_request" && input.draft === false) {
    return "Drafts remain draft (AGENTS.md › Git and merges). Readiness is decided by the merge owner.";
  }
  return null;
}

/** CLAUDE.md › Check-in cadence: the prompt cache lives 60 min; arm at <= 55. */
export const CHECK_IN_MAX_MINUTES = 55;

export function checkInWarning(tool: string, input: Record<string, unknown>): string | null {
  if (!/send_later$/.test(tool)) return null;
  const minutes = typeof input.delay_minutes === "number" ? input.delay_minutes : null;
  if (minutes !== null && minutes > CHECK_IN_MAX_MINUTES && minutes <= 75) {
    return `verdant-guard: this check-in is armed at ${minutes} min. CLAUDE.md asks for <= ${CHECK_IN_MAX_MINUTES} min so the wake lands inside the 60-minute prompt cache; a 56–75 min gap is usually an accidental near-miss.`;
  }
  return null;
}
